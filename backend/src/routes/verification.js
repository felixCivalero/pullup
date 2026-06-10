// Verification + auth delivery routes: phone OTP verify (/verify/phone/start), /v/:token
// WhatsApp magic links, auth request-link + Supabase send-SMS hook, internal SES webhook.
import crypto from "crypto";
import { supabase } from "../supabase.js";
import { WHATSAPP_SANDBOX_MODE } from "../whatsapp/config.js";
import { processSesEvent } from "../email/events/processSesEvent.js";
import {
  startVerification as startPhoneVerification,
  redeemToken as redeemMagicLinkToken,
} from "../services/phoneVerification.js";
import { normalisePhone } from "../utils/phone.js";

// Magic-link redemption. Hit by tapping the WhatsApp link.
// Marks phone_verified_at, records the opt-in, and renders a polished
// server-side confirmation page (or 302s into the caller's flow if a
// redirect_url was set in the token payload).
//
// The success page is self-contained inline HTML so it doesn't depend
// on any specific frontend route being deployed. New-brand palette:
// white canvas, near-black ink, screamy-pink accent, calm-green check.
function renderVerifyHtml({ ok, message }) {
  const tone = ok
    ? { color: "#16a34a", glyph: "✓", title: "Phone verified" }
    : { color: "#dc2626", glyph: "!", title: "Link no longer valid" };
  const body = ok
    ? "You're all set. Reminders, RSVPs, and future mobile-payment rails all key off this verified number. You can close this and head back to PullUp."
    : `That magic link didn't redeem (${message || "expired or already used"}). Open PullUp again and we'll send a fresh one.`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${ok ? "Phone verified · PullUp" : "Link expired · PullUp"}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #ffffff; color: #0a0a0a;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .card {
      width: 100%; max-width: 420px; text-align: center; padding: 8px 4px 0;
    }
    .glyph {
      width: 84px; height: 84px; border-radius: 999px;
      display: inline-flex; align-items: center; justify-content: center;
      font-size: 44px; font-weight: 700; color: #fff;
      background: ${tone.color};
      box-shadow: 0 8px 24px ${tone.color}33;
      margin-bottom: 18px;
    }
    h1 { font-size: 26px; font-weight: 700; margin: 0 0 10px; letter-spacing: -0.01em; }
    p  { font-size: 15px; line-height: 1.55; color: rgba(10,10,10,0.62); margin: 0 0 22px; }
    a.cta {
      display: inline-flex; align-items: center; justify-content: center;
      padding: 12px 22px; border-radius: 999px; text-decoration: none;
      background: #ec178f; color: #fff; font-size: 14px; font-weight: 700;
      box-shadow: 0 6px 18px rgba(236, 23, 143, 0.28);
    }
    .wordmark { margin-top: 28px; font-size: 11px; letter-spacing: 0.16em;
      text-transform: uppercase; color: rgba(10,10,10,0.45); }
  </style>
</head>
<body>
  <div class="card">
    <div class="glyph">${tone.glyph}</div>
    <h1>${tone.title}</h1>
    <p>${body}</p>
    <a class="cta" href="https://pullup.se">Open PullUp</a>
    <div class="wordmark">pullup</div>
  </div>
</body>
</html>`;
}

// User-Agent patterns of crawlers that pre-fetch URLs in messages they
// route. If we redeemed on first hit, WhatsApp's own preview crawler
// (facebookexternalhit) would consume the token in ~3 seconds, before
// the human ever tapped. We serve them a success-looking preview but
// DO NOT redeem; the token stays valid for the real tap.
const URL_PREVIEW_BOTS = [
  "facebookexternalhit",
  "whatsapp",
  "twitterbot",
  "linkedinbot",
  "slackbot",
  "discordbot",
  "telegrambot",
  "applebot",
  "googlebot",
  "bingbot",
  "yandexbot",
  "duckduckbot",
  "baiduspider",
];
function isUrlPreviewBot(ua) {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return URL_PREVIEW_BOTS.some((p) => lower.includes(p));
}

// ---------------------------
// PASSWORDLESS LOGIN — email magic link
// The default front door for everyone (guest or host): no password. We mint a
// Supabase magic link server-side and deliver it through our branded email.
// Always returns {ok:true} for a valid email shape (don't reveal whether an
// account exists), and throttles per-email to keep an inbox from being spammed.
// ---------------------------
const _loginLinkCooldown = new Map(); // email -> last-sent ms (in-memory, best-effort)
const LOGIN_LINK_COOLDOWN_MS = 60 * 1000;

// ---------------------------
// WHATSAPP LOGIN — Supabase "Send SMS Hook" routed over WhatsApp
//
// The native-as-possible bridge: Supabase phone-OTP owns the code + the session
// (real security, real verifyOtp), but instead of letting it send the code by
// SMS we register THIS endpoint as the Send SMS Hook. Supabase calls us with the
// {phone, otp}; we deliver the code over WhatsApp (our Meta Cloud rail). The
// guest types it back into verifyOtp → Supabase mints a genuine session. So the
// account, session, and OTP are 100% native Supabase; only delivery is ours.
//
// Auth: Standard Webhooks signature (HMAC-SHA256) using the hook secret Supabase
// shows when you create the hook (env SUPABASE_AUTH_HOOK_SECRET, "v1,whsec_..").
// ---------------------------
function verifySendSmsHook(req) {
  const secret = process.env.SUPABASE_AUTH_HOOK_SECRET || "";
  // Dev convenience: in sandbox with no secret set, don't block local testing.
  if (!secret) return WHATSAPP_SANDBOX_MODE;
  try {
    const id = req.headers["webhook-id"];
    const ts = req.headers["webhook-timestamp"];
    const sigHeader = req.headers["webhook-signature"] || "";
    if (!id || !ts || !sigHeader) return false;
    const raw = req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body || {});
    // Secret is base64 after the "v1,whsec_" prefix.
    const b64 = secret.split(",").pop().replace(/^whsec_/, "");
    const key = Buffer.from(b64, "base64");
    const signed = `${id}.${ts}.${raw}`;
    const expected = crypto.createHmac("sha256", key).update(signed).digest("base64");
    // Header may carry several space-separated "v1,<sig>" — match any.
    return sigHeader.split(" ").some((part) => {
      const sig = part.includes(",") ? part.split(",")[1] : part;
      try {
        return sig && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
      } catch {
        return false;
      }
    });
  } catch (err) {
    console.error("[send-sms-hook] verify error:", err.message);
    return false;
  }
}

export function registerVerificationRoutes(app) {
  // ---------------------------
  // PHONE VERIFICATION: magic-link via WhatsApp
  // ---------------------------
  // Kick off a verification — fired in the background as soon as the
  // signup form's phone field becomes valid E.164. Body:
  //   { phone, intent?, payload?, defaultCountry? }
  // Mounted at /verify/* (no /api prefix) — nginx strips /api/ before
  // proxying, matching the rest of the codebase's route convention.
  app.post("/verify/phone/start", async (req, res) => {
    try {
      const {
        phone,
        email = null,
        intent = "verify_phone",
        payload = {},
        defaultCountry = null,
        templateKey,
      } = req.body || {};
      // Link the verification to the person so redeem can set phone_verified_at on
      // the RIGHT person (the gate the WhatsApp rail needs). Resolve by phone_e164
      // first, then fall back to email — the identity anchor the RSVP always
      // stores. Phone-only resolution misses when the verified number isn't yet on
      // the person (returning guest, new number, or a write/lookup race), which
      // silently orphans the token.
      const normEmail = email ? String(email).trim().toLowerCase() : null;
      let resolvedPersonId = null;
      try {
        const norm = normalisePhone(phone, defaultCountry);
        if (norm.ok) {
          const { data: p } = await supabase
            .from("people")
            .select("id")
            .eq("phone_e164", norm.e164)
            .maybeSingle();
          resolvedPersonId = p?.id || null;
        }
        if (!resolvedPersonId && normEmail) {
          const { data: pe } = await supabase
            .from("people")
            .select("id")
            .eq("email", normEmail)
            .maybeSingle();
          resolvedPersonId = pe?.id || null;
        }
      } catch { /* best-effort linkage */ }
      const result = await startPhoneVerification({
        phone,
        intent,
        // Carry the email in the token payload too, so redeemToken can self-heal
        // the link even if mint-time resolution missed.
        payload: normEmail ? { ...payload, email: normEmail } : payload,
        defaultCountry,
        personId: resolvedPersonId,
        templateKey: templateKey || undefined,
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"] || null,
      });
      if (!result.ok) return res.status(400).json(result);
      return res.json(result);
    } catch (err) {
      console.error("[verify/phone/start] error", err);
      return res.status(500).json({ ok: false, error: "internal error" });
    }
  });

  app.get("/v/:token", async (req, res) => {
    const ua = req.headers["user-agent"] || null;

    // Skip redeem for link-preview crawlers. Render a benign success-looking
    // page so the chat-bubble preview looks polished without burning the
    // token. The actual redemption happens on the real human tap below.
    if (isUrlPreviewBot(ua)) {
      res.set("Content-Type", "text/html; charset=utf-8");
      return res
        .status(200)
        .send(renderVerifyHtml({ ok: true }));
    }

    try {
      const result = await redeemMagicLinkToken({
        rawToken: req.params.token,
        ipAddress: req.ip,
        userAgent: ua,
      });
      if (!result.ok) {
        res.set("Content-Type", "text/html; charset=utf-8");
        return res.status(400).send(renderVerifyHtml({ ok: false, message: result.error }));
      }
      if (result.payload?.redirect_url) {
        return res.redirect(302, result.payload.redirect_url);
      }
      res.set("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(renderVerifyHtml({ ok: true }));
    } catch (err) {
      console.error("[/v/:token] redeem error", err);
      res.set("Content-Type", "text/html; charset=utf-8");
      return res
        .status(500)
        .send(renderVerifyHtml({ ok: false, message: "something went wrong" }));
    }
  });

  app.post("/auth/request-link", async (req, res) => {
    try {
      const { email, name, next } = req.body || {};
      const { isValidEmail, normalizeEmail, requestLoginLink } = await import("../services/account.js");
      const norm = normalizeEmail(email);
      if (!isValidEmail(norm)) return res.status(400).json({ ok: false, error: "invalid_email" });

      // Per-email cooldown (clear stale entries opportunistically).
      const now = Date.now();
      const last = _loginLinkCooldown.get(norm) || 0;
      if (now - last < LOGIN_LINK_COOLDOWN_MS) {
        // Don't reveal timing details; just acknowledge.
        return res.json({ ok: true, throttled: true });
      }
      _loginLinkCooldown.set(norm, now);
      if (_loginLinkCooldown.size > 5000) _loginLinkCooldown.clear();

      const safeNext = typeof next === "string" && next.startsWith("/") ? next : "/room";
      const result = await requestLoginLink({ email: norm, name, next: safeNext });
      // Acknowledge regardless of whether the account existed (no enumeration).
      if (!result.ok && result.error === "invalid_email") {
        return res.status(400).json({ ok: false, error: "invalid_email" });
      }
      // A real failure (account_failed / link_failed / send_failed) used to be
      // swallowed by the ok:true anti-enumeration response — the user is told
      // "check your inbox" for a mail that never sends, with no signal anywhere.
      // Keep the client response generic, but log loudly server-side so the
      // failure is alertable instead of invisible.
      if (!result.ok) {
        console.error("[auth/request-link] login link not delivered", {
          event: "login_link_failed",
          reason: result.error || "unknown",
        });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[auth/request-link] error:", err.message);
      res.status(500).json({ ok: false, error: "failed" });
    }
  });

  app.post("/auth/hooks/send-sms", async (req, res) => {
    try {
      if (!verifySendSmsHook(req)) {
        return res.status(401).json({ error: { http_code: 401, message: "invalid signature" } });
      }
      // Supabase payload: { user: { phone }, sms: { otp } }.
      const phoneRaw = req.body?.user?.phone || req.body?.phone || "";
      const otp = req.body?.sms?.otp || req.body?.otp || "";
      if (!phoneRaw || !otp) {
        return res.status(400).json({ error: { http_code: 400, message: "missing phone or otp" } });
      }
      const to = phoneRaw.startsWith("+") ? phoneRaw : `+${phoneRaw}`;

      const { sendTemplate } = await import("../whatsapp/index.js");
      await sendTemplate({
        to,
        templateKey: "auth_whatsapp_otp",
        variables: { code: String(otp) },
        legalBasis: "consent",
        idempotencyKey: `wa-otp:${to}:${otp}`,
      });
      // 200 with empty body tells Supabase the SMS hook handled delivery.
      res.json({});
    } catch (err) {
      console.error("[send-sms-hook] error:", err.message);
      // Surface to Supabase so it can fall back / report.
      res.status(500).json({ error: { http_code: 500, message: "whatsapp delivery failed" } });
    }
  });

  // ---------------------------
  // INTERNAL: SES EventBridge forwarder
  // ---------------------------
  app.post("/internal/webhooks/ses-eventbridge", async (req, res) => {
    try {
      const secret = process.env.EVENTS_WEBHOOK_SECRET;

      if (secret) {
        const signatureHeader =
          req.headers["x-events-signature"] ||
          req.headers["X-Events-Signature"];

        if (!signatureHeader) {
          console.warn(
            "[Webhook][SES-EventBridge] Missing x-events-signature header",
          );
          return res.status(401).json({ error: "Missing events signature" });
        }

        const rawBody =
          req.rawBody || Buffer.from(JSON.stringify(req.body), "utf8");
        const expectedSignature = crypto
          .createHmac("sha256", secret)
          .update(rawBody)
          .digest("hex");

        const expectedBuf = Buffer.from(expectedSignature, "hex");
        const providedBuf = Buffer.from(String(signatureHeader), "hex");

        if (
          expectedBuf.length !== providedBuf.length ||
          !crypto.timingSafeEqual(expectedBuf, providedBuf)
        ) {
          console.warn(
            "[Webhook][SES-EventBridge] Invalid events signature",
          );
          return res.status(401).json({ error: "Invalid events signature" });
        }
      }

      const notification = req.body;
      const result = await processSesEvent(notification);

      res.json({ ok: true, eventType: result.eventType });
    } catch (error) {
      console.error(
        "[Webhook][SES-EventBridge] Error processing webhook",
        error,
      );
      res.status(500).json({ error: "Failed to process SES EventBridge webhook" });
    }
  });
}
