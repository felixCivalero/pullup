// Newsletter signup/unsubscribe + consent recording: /u/:token unsubscribe pages,
// /newsletter signup, /newsletter/unsubscribe-token, /auth/record-consent, /auth/link-newsletter.
import crypto from "crypto";

import { ensurePersonLinked } from "../data.js";
import { requireAuth, optionalAuth } from "../middleware/auth.js";

function generateUnsubscribeToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function registerNewsletterRoutes(app) {
  app.get("/u/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const { findPersonByUnsubscribeToken } = await import("../data.js");
      const person = await findPersonByUnsubscribeToken(token);
      if (!person) {
        return res.status(404).json({ error: "Invalid or expired link" });
      }
      res.json({
        id: person.id,
        email: person.email,
        name: person.name,
        isUnsubscribed: Boolean(person.marketing_unsubscribed_at),
        unsubscribedAt: person.marketing_unsubscribed_at,
      });
    } catch (err) {
      console.error("[unsubscribe] lookup error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  app.post("/u/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const subscribed = req.body?.subscribed === true;
      const { findPersonByUnsubscribeToken, setMarketingUnsubscribed } = await import("../data.js");
      const person = await findPersonByUnsubscribeToken(token);
      if (!person) {
        return res.status(404).json({ error: "Invalid or expired link" });
      }
      await setMarketingUnsubscribed(person.id, !subscribed);
      res.json({ ok: true, isUnsubscribed: !subscribed });
    } catch (err) {
      console.error("[unsubscribe] toggle error:", err);
      res.status(500).json({ error: "Internal error" });
    }
  });

  // ---------------------------
  // PUBLIC: Newsletter subscription & unsubscribe
  // ---------------------------

  app.post("/newsletter", optionalAuth, async (req, res) => {
    try {
      const rawEmail = req.body?.email;
      const source = req.body?.source || "landing_newsletter";
      const interests = Array.isArray(req.body?.interests) ? req.body.interests.filter(i => typeof i === "string") : [];
      const consent = req.body?.consent;

      if (!rawEmail || typeof rawEmail !== "string") {
        return res.status(400).json({
          code: "invalid_email",
          message: "Email is required.",
        });
      }

      const normalizedEmail = rawEmail.trim().toLowerCase();

      // Very lightweight email validation to avoid obviously bad input
      if (
        !normalizedEmail ||
        !normalizedEmail.includes("@") ||
        normalizedEmail.length > 320
      ) {
        return res.status(400).json({
          code: "invalid_email",
          message: "Enter a valid email address to continue.",
        });
      }

      const { supabase } = await import("../supabase.js");

      const {
        data: existing,
        error: selectError,
      } = await supabase
        .from("newsletter_subscriptions")
        .select("id, status, user_id")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (selectError) {
        // Table missing or other structural issue
        if (selectError.code === "PGRST116" || selectError.code === "42P01") {
          console.error(
            "[newsletter] newsletter_subscriptions table missing:",
            selectError
          );
          return res.status(500).json({
            code: "newsletter_not_configured",
            message: "Newsletter is not configured yet.",
          });
        }

        console.error("[newsletter] Error fetching subscription:", selectError);
        return res.status(500).json({
          code: "newsletter_error",
          message: "Failed to subscribe.",
        });
      }

      const userId = req.user?.id || existing?.user_id || null;
      const now = new Date().toISOString();

      // Helper to map Supabase auth/rate-limit errors into HTTP responses
      function handleSupabaseWriteError(err, defaultStatus = 500) {
        const msg = (err?.message || "").toLowerCase();
        if (msg.includes("rate limit") || msg.includes("too many requests")) {
          return res.status(429).json({
            code: "rate_limited",
            message:
              "Too many attempts for this email. Wait a moment and try again.",
          });
        }

        console.error("[newsletter] Write error:", err);
        return res.status(defaultStatus).json({
          code: "newsletter_error",
          message: "Failed to update subscription.",
        });
      }

      // No existing subscription: create a new confirmed subscription
      if (!existing) {
        const unsubscribeToken = generateUnsubscribeToken();

        const { error: insertError } = await supabase
          .from("newsletter_subscriptions")
          .insert({
            email: normalizedEmail,
            user_id: userId,
            status: "confirmed",
            source,
            confirmed_at: now,
            created_at: now,
            updated_at: now,
            unsubscribe_token: unsubscribeToken,
            ...(interests.length > 0 ? { interests } : {}),
            consent_given: consent === true,
            consent_at: consent === true ? now : null,
          });

        if (insertError) {
          return handleSupabaseWriteError(insertError);
        }

        return res.json({ status: "subscribed", created: true });
      }

      // Existing subscription: branch on status
      if (existing.status === "bounced" || existing.status === "suppressed") {
        return res.status(400).json({
          code: "suppressed",
          message: "We can't subscribe this address right now.",
        });
      }

      let nextStatus = existing.status;
      let responseStatus = "already_subscribed";
      const patch = {
        user_id: userId,
        updated_at: now,
        ...(interests.length > 0 ? { interests } : {}),
        consent_given: consent === true,
        consent_at: consent === true ? now : null,
      };

      if (existing.status === "unsubscribed") {
        nextStatus = "confirmed";
        responseStatus = "resubscribed";
        const unsubscribeToken = generateUnsubscribeToken();
        Object.assign(patch, {
          status: nextStatus,
          confirmed_at: now,
          unsubscribed_at: null,
          unsubscribe_token: unsubscribeToken,
        });
      } else if (existing.status === "pending") {
        nextStatus = "confirmed";
        responseStatus = "resubscribed";
        Object.assign(patch, {
          status: nextStatus,
          confirmed_at: now,
        });
      } else {
        // confirmed / other non-terminal statuses
        Object.assign(patch, {
          status: existing.status || "confirmed",
        });
      }

      const { error: updateError } = await supabase
        .from("newsletter_subscriptions")
        .update(patch)
        .eq("id", existing.id);

      if (updateError) {
        return handleSupabaseWriteError(updateError);
      }

      return res.json({ status: responseStatus, created: false });
    } catch (error) {
      console.error("[newsletter] Unexpected error:", error);
      return res.status(500).json({
        code: "newsletter_error",
        message: "Failed to subscribe.",
      });
    }
  });

  app.post("/newsletter/unsubscribe-token", async (req, res) => {
    try {
      const rawToken = req.body?.token;
      if (!rawToken || typeof rawToken !== "string") {
        return res.status(400).json({
          code: "invalid_token",
          message: "Invalid unsubscribe link.",
        });
      }

      const token = rawToken.trim();
      if (!token) {
        return res.status(400).json({
          code: "invalid_token",
          message: "Invalid unsubscribe link.",
        });
      }

      const { supabase } = await import("../supabase.js");

      const {
        data: existing,
        error: selectError,
      } = await supabase
        .from("newsletter_subscriptions")
        .select("id, status")
        .eq("unsubscribe_token", token)
        .maybeSingle();

      if (selectError) {
        if (selectError.code === "PGRST116" || selectError.code === "42P01") {
          console.error(
            "[newsletter] newsletter_subscriptions table missing on unsubscribe:",
            selectError
          );
          return res.status(400).json({
            code: "invalid_token",
            message: "This unsubscribe link is no longer valid.",
          });
        }

        console.error(
          "[newsletter] Error fetching unsubscribe token:",
          selectError
        );
        return res.status(400).json({
          code: "invalid_token",
          message: "This unsubscribe link is no longer valid.",
        });
      }

      if (!existing) {
        return res.status(400).json({
          code: "invalid_token",
          message: "This unsubscribe link is no longer valid.",
        });
      }

      if (existing.status === "unsubscribed") {
        return res.json({ status: "already_unsubscribed" });
      }

      if (existing.status === "bounced" || existing.status === "suppressed") {
        return res.json({ status: "suppressed" });
      }

      const now = new Date().toISOString();

      const { error: updateError } = await supabase
        .from("newsletter_subscriptions")
        .update({
          status: "unsubscribed",
          unsubscribed_at: now,
          updated_at: now,
        })
        .eq("id", existing.id);

      if (updateError) {
        console.error(
          "[newsletter] Error updating unsubscribe status:",
          updateError
        );
        return res.status(500).json({
          code: "newsletter_error",
          message: "Failed to update subscription.",
        });
      }

      return res.json({ status: "unsubscribed" });
    } catch (error) {
      console.error("[newsletter] Unexpected unsubscribe error:", error);
      return res.status(500).json({
        code: "newsletter_error",
        message: "Failed to update subscription.",
      });
    }
  });

  // ---------------------------
  // PROTECTED: Record auth consent (sign-up / sign-in)
  // ---------------------------

  app.post("/auth/record-consent", requireAuth, async (req, res) => {
    try {
      const rawEmail = req.user?.email;
      if (!rawEmail) return res.json({ ok: false });

      const email = String(rawEmail).trim().toLowerCase();
      if (!email) return res.json({ ok: false });

      const { supabase } = await import("../supabase.js");
      const now = new Date().toISOString();

      // Upsert into newsletter_subscriptions
      await supabase
        .from("newsletter_subscriptions")
        .upsert(
          {
            email,
            user_id: req.user.id,
            consent_given: true,
            consent_at: now,
            source: "account_signup",
            updated_at: now,
          },
          { onConflict: "email" }
        );

      // Update people table if record exists
      await supabase
        .from("people")
        .update({
          marketing_consent: true,
          marketing_consent_at: now,
        })
        .eq("email", email);

      // Identity spine: self-heal the account<->person link on every authenticated
      // load (the one-time backfill handled existing rows; this keeps it wired for
      // new signups). Best-effort — never block the consent response.
      try {
        await ensurePersonLinked({ userId: req.user.id, email, name: req.user.name || null });
      } catch (e) {
        console.warn("[consent] ensurePersonLinked failed:", e?.message);
      }

      return res.json({ ok: true });
    } catch (error) {
      console.error("[consent] Unexpected record-consent error:", error);
      return res.status(500).json({ ok: false, code: "consent_error" });
    }
  });

  // ---------------------------
  // PROTECTED: Link newsletter subscriptions to authenticated user
  // ---------------------------

  app.post("/auth/link-newsletter", requireAuth, async (req, res) => {
    try {
      const rawEmail = req.user?.email;
      if (!rawEmail) {
        return res.json({ linked: false });
      }

      const email = String(rawEmail).trim().toLowerCase();
      if (!email) {
        return res.json({ linked: false });
      }

      const { supabase } = await import("../supabase.js");
      const now = new Date().toISOString();

      const { error } = await supabase
        .from("newsletter_subscriptions")
        .update({
          user_id: req.user.id,
          updated_at: now,
        })
        .eq("email", email)
        .is("user_id", null);

      if (error) {
        console.error("[newsletter] Error linking subscription to user:", error);
        return res.status(500).json({
          linked: false,
          code: "newsletter_link_error",
        });
      }

      return res.json({ linked: true });
    } catch (error) {
      console.error("[newsletter] Unexpected link-newsletter error:", error);
      return res.status(500).json({
        linked: false,
        code: "newsletter_link_error",
      });
    }
  });
}
