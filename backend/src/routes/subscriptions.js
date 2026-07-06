// backend/src/routes/subscriptions.js
//
// The Creator tier over HTTP:
//   GET  /host/subscription            — where do I stand? (+ ?session_id=
//                                        syncs a just-finished checkout first,
//                                        so the return page unlocks instantly)
//   POST /host/subscription/checkout   — start paying (Stripe Checkout URL)
//   POST /host/subscription/portal     — manage/cancel (Stripe Portal URL)
//   POST /webhooks/stripe/subscriptions — Stripe's side of the truth
//   POST /me/deletion-request          — the Settings promise, made real:
//                                        records the request + cancels the sub
//
// The webhook route must be registered BEFORE the global JSON parser (raw body
// for signature verification) — index.js mounts registerSubscriptionWebhook
// next to the existing Stripe webhook, and registerSubscriptionRoutes with the
// normal route block.

import express from "express";
import Stripe from "stripe";
import { requireAuth } from "../middleware/auth.js";
import { isDevelopment } from "../lib/urls.js";
import { getStripeSecretKey } from "../stripe.js";
import { subscriptionConfig, tierForPlan, TIERS } from "../config/subscriptions.js";
import { getEntitlement, invalidateEntitlement } from "../services/billing/entitlements.js";
import {
  createCheckoutSession,
  createPortalSession,
  syncCheckoutSession,
  handleSubscriptionWebhookEvent,
  cancelSubscriptionForHost,
  changeSubscriptionTier,
} from "../services/billing/subscriptions.js";
import { getPlanForHost } from "../repos/billing.js";
import { supabase } from "../supabase.js";

export function registerSubscriptionRoutes(app) {
  app.get("/host/subscription", requireAuth, async (req, res) => {
    try {
      const cfg = subscriptionConfig();
      const sessionId = req.query.session_id;
      if (sessionId && cfg.configured) {
        try {
          await syncCheckoutSession(req.user.id, String(sessionId));
        } catch (e) {
          // Sync is an accelerator, not the source of truth — the webhook
          // still lands. Don't fail the read over it.
          console.error("[subscriptions] checkout sync failed:", e?.message);
        }
      }
      invalidateEntitlement(req.user.id); // this endpoint is the "am I in yet?" poll — always fresh
      const [entitlement, plan] = [await getEntitlement(req.user.id), await getPlanForHost(req.user.id)];
      res.json({
        tier: tierForPlan(plan.plan), // the host's own tier (agency → 450, else creator)
        tiers: TIERS,
        configured: cfg.configured,
        enforced: cfg.enforced,
        entitlement,
        plan: {
          plan: plan.plan,
          founding: plan.founding,
          subscriptionStatus: plan.subscriptionStatus,
          currentPeriodEnd: plan.currentPeriodEnd,
          cancelAtPeriodEnd: plan.cancelAtPeriodEnd,
          hasStripeCustomer: !!plan.stripeCustomerId,
        },
      });
    } catch (error) {
      console.error("[subscriptions] status failed:", error);
      res.status(500).json({ error: "subscription_status_failed" });
    }
  });

  app.post("/host/subscription/checkout", requireAuth, async (req, res) => {
    try {
      const cfg = subscriptionConfig();
      if (!cfg.configured) return res.status(503).json({ error: "subscriptions_not_configured" });
      const tier = req.body?.tier && TIERS[req.body.tier] ? req.body.tier : undefined;
      const embedded = req.body?.embedded === true;
      const result = await createCheckoutSession(req.user.id, { returnTo: req.body?.returnTo, tier, embedded });
      res.json(result); // { url } for hosted, { clientSecret } for embedded
    } catch (error) {
      if (error?.message === "tier_not_configured") {
        return res.status(503).json({ error: "tier_not_configured" });
      }
      console.error("[subscriptions] checkout failed:", error?.message);
      res.status(500).json({ error: "checkout_failed" });
    }
  });

  // ── Agency tier interest ───────────────────────────────────────────────
  // Agency is functionally identical to Creator today, so it isn't directly
  // purchasable — it's a "request early access" that measures desire and
  // opens the concierge loop (dock thread + a repliable hello@ email, same
  // as Instagram early access). Any signed-in host may raise their hand.
  app.get("/host/subscription/agency-interest", requireAuth, async (req, res) => {
    try {
      const { data } = await supabase
        .from("tier_access_requests")
        .select("status, created_at")
        .eq("host_id", req.user.id)
        .eq("tier", "agency")
        .maybeSingle();
      res.json({ requested: !!data, request: data || null });
    } catch (e) {
      console.error("[agency-interest] status failed:", e?.message);
      res.json({ requested: false, request: null }); // cosmetic read — fail soft
    }
  });

  app.post("/host/subscription/agency-interest", requireAuth, async (req, res) => {
    try {
      const note = String(req.body?.note || "").trim().slice(0, 1000) || null;
      const { error } = await supabase.from("tier_access_requests").upsert(
        { host_id: req.user.id, tier: "agency", note, status: "pending", updated_at: new Date().toISOString() },
        { onConflict: "host_id,tier" },
      );
      if (error) throw error;

      const requesterEmail = req.user.email || null;
      let requesterName = null;
      try {
        const { getUserProfile } = await import("../repos/profiles.js");
        const profile = await getUserProfile(req.user.id);
        requesterName = profile?.name || profile?.brand || null;
      } catch { /* name is a nicety */ }

      // The system chat: PullUp becomes a contact in the REQUESTER's Messages
      // (eyes avatar, Official). The request is the ✦ log line; PullUp greets
      // so the thread is born alive. Internal rows — the admin dashboard's
      // System inbox answers here; no email is involved in the conversation.
      try {
        const { getSystemPersonId } = await import("../repos/systemPerson.js");
        const systemPersonId = await getSystemPersonId();
        if (systemPersonId) {
          const { logPersonEvent } = await import("../services/personTimeline.js");
          await logPersonEvent({
            personId: systemPersonId,
            hostId: req.user.id,
            type: "access_request",
            channel: "email",
            body: `Requested Agency tier early access${note ? `\n${note}` : ""}`,
            metadata: { source: "agency_tier_interest" },
          });
          await logPersonEvent({
            personId: systemPersonId,
            hostId: req.user.id,
            type: "message_in",
            channel: "email",
            direction: "in",
            body: "Got your Agency request — Felix will reply to you right here.",
            metadata: { source: "system_auto" },
          });
        }
      } catch (e) {
        console.error("[agency-interest] system thread failed (non-blocking):", e?.message);
      }

      // Plain heads-up ping to the shared mailbox (NOT the conversation — the
      // admin dashboard's System inbox is where the reply happens).
      try {
        const ent = await getEntitlement(req.user.id);
        const { sendEmail } = await import("../services/emailService.js");
        await sendEmail({
          to: "hello@pullup.se",
          subject: `Agency tier interest: ${requesterName || requesterEmail || req.user.id}`,
          text: [
            `Agency tier early-access request`,
            ``,
            `Name: ${requesterName || "—"}`,
            `Email: ${requesterEmail || "—"}`,
            `Current tier: ${ent.plan}${ent.reason === "early" ? " (founding)" : ""} · status ${ent.subscriptionStatus}`,
            `Note: ${note || "—"}`,
            ``,
            `Reply from the admin dashboard → System inbox: https://pullup.se/admin`,
          ].join("\n"),
        });
      } catch (e) {
        console.error("[agency-interest] notify email failed:", e?.message);
      }

      res.json({ ok: true, requested: true });
    } catch (e) {
      console.error("[agency-interest] request failed:", e?.message);
      res.status(500).json({ error: "request_failed" });
    }
  });

  // Upgrade/downgrade in place — Stripe prorates, the plan flips immediately.
  app.post("/host/subscription/change-tier", requireAuth, async (req, res) => {
    try {
      const cfg = subscriptionConfig();
      if (!cfg.configured) return res.status(503).json({ error: "subscriptions_not_configured" });
      const tier = req.body?.tier;
      if (!tier || !TIERS[tier]) return res.status(400).json({ error: "unknown_tier" });
      const result = await changeSubscriptionTier(req.user.id, tier);
      res.json({ ok: true, plan: result.plan || tier, unchanged: !!result.unchanged });
    } catch (error) {
      const known = ["tier_not_configured", "no_subscription", "unknown_tier"];
      if (known.includes(error?.message)) {
        return res.status(error.message === "no_subscription" ? 409 : 503).json({ error: error.message });
      }
      console.error("[subscriptions] change-tier failed:", error?.message);
      res.status(500).json({ error: "change_tier_failed" });
    }
  });

  app.post("/host/subscription/portal", requireAuth, async (req, res) => {
    try {
      const cfg = subscriptionConfig();
      if (!cfg.configured) return res.status(503).json({ error: "subscriptions_not_configured" });
      const { url } = await createPortalSession(req.user.id, { returnTo: req.body?.returnTo });
      res.json({ url });
    } catch (error) {
      if (error?.message === "no_stripe_customer") {
        return res.status(409).json({ error: "no_stripe_customer" });
      }
      console.error("[subscriptions] portal failed:", error?.message);
      res.status(500).json({ error: "portal_failed" });
    }
  });

  // The Settings "delete my account" promise, made real: durable request row
  // (worked concierge at today's scale) + immediate subscription cancel so
  // nobody pays for an account they've asked us to erase. Idempotent.
  app.post("/me/deletion-request", requireAuth, async (req, res) => {
    try {
      const { error } = await supabase
        .from("account_deletion_requests")
        .upsert({ user_id: req.user.id, status: "pending" }, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      await cancelSubscriptionForHost(req.user.id); // best-effort, never blocks
      console.log("[account] deletion requested by", req.user.id);
      res.json({ ok: true });
    } catch (error) {
      console.error("[account] deletion request failed:", error?.message);
      res.status(500).json({ error: "deletion_request_failed" });
    }
  });
}

// Mounted BEFORE the global JSON parser, exactly like /webhooks/stripe.
// Its own endpoint + signing secret (STRIPE_SUBSCRIPTION_WEBHOOK_SECRET);
// falls back to STRIPE_WEBHOOK_SECRET so pointing the existing dashboard
// endpoint config at this path also works.
export function registerSubscriptionWebhookRoutes(app) {
  app.post(
    "/webhooks/stripe/subscriptions",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      const secret = isDevelopment
        ? process.env.TEST_STRIPE_SUBSCRIPTION_WEBHOOK_SECRET ||
          process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET ||
          process.env.TEST_STRIPE_WEBHOOK_SECRET ||
          process.env.STRIPE_WEBHOOK_SECRET
        : process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) return res.status(500).json({ error: "webhook_secret_missing" });

      let event;
      try {
        const stripe = new Stripe(getStripeSecretKey());
        event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], secret);
      } catch (err) {
        console.error("[subscriptions] webhook signature failed:", err?.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Process, then ack — a 500 makes Stripe retry (same policy as
      // /webhooks/stripe; see that handler's comment for the reasoning).
      try {
        const result = await handleSubscriptionWebhookEvent(event);
        console.log("[subscriptions] webhook:", event.type, result);
        res.json({ received: true });
      } catch (error) {
        console.error("[subscriptions] webhook processing failed:", event?.type, error?.message);
        res.status(500).send("Webhook processing failed — will be retried");
      }
    },
  );
}
