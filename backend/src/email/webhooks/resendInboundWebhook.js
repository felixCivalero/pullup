// backend/src/email/webhooks/resendInboundWebhook.js
//
// Two-way email via Resend (Resend added inbound receiving in Nov 2025).
//
// Flow: a guest replies to reply+<tracking_id>@<INBOUND_EMAIL_DOMAIN> → Resend
// MX receives it → fires an `email.received` webhook (METADATA ONLY) → here. We
// verify the Svix signature (bundled in the Resend SDK — no extra dep), fetch
// the body via the Received Emails API, then feed the SAME parse/thread
// pipeline the SES path uses (processInboundEmail) so the reply lands in the
// host's Room thread.

import { Resend } from "resend";
import { INBOUND_EMAIL_DOMAIN, INBOUND_EMAIL_LOCAL } from "../config.js";
import { extractToken } from "../inbound/parseInboundEmail.js";
import { processInboundEmail } from "../inbound/processInboundEmail.js";

// Resend's webhook signing secret (whsec_…). Accept either name; the prod/dev
// .env uses RESEND_WEBHOOK_SIGNING_SECRET.
const RESEND_WEBHOOK_SECRET =
  process.env.RESEND_WEBHOOK_SIGNING_SECRET ||
  process.env.RESEND_WEBHOOK_SECRET ||
  null;

let _client = null;
function client() {
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY);
  return _client;
}

// Crude HTML→text fallback for the rare reply with no text/plain part.
function htmlToText(html) {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function lowerKeys(obj) {
  const out = {};
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) out[String(k).toLowerCase()] = v;
  }
  return out;
}

/**
 * @param {object} args
 * @param {string} args.rawBody  exact raw request body (for Svix signature verify)
 * @param {object} args.body     already-parsed JSON event (used when unverified)
 * @param {object} args.headers  request headers (svix-id / -timestamp / -signature)
 */
export async function handleResendInboundEvent({ rawBody, body, headers }) {
  if (!INBOUND_EMAIL_DOMAIN) return { ok: true, skipped: "inbound_disabled" };

  // ── Verify the Svix signature (the Resend SDK bundles svix). ──
  let event = body;
  if (RESEND_WEBHOOK_SECRET) {
    try {
      event = client().webhooks.verify({
        payload: rawBody,
        webhookSecret: RESEND_WEBHOOK_SECRET,
        headers: {
          id: headers["svix-id"],
          timestamp: headers["svix-timestamp"],
          signature: headers["svix-signature"],
        },
      });
    } catch (err) {
      console.error("[resendInbound] signature verification failed:", err?.message);
      const e = new Error("Invalid Resend webhook signature");
      e.statusCode = 403;
      throw e;
    }
  } else {
    console.warn("[resendInbound] RESEND_WEBHOOK_SECRET unset — accepting unverified (dev only)");
  }

  if (event?.type !== "email.received") {
    return { ok: true, ignored: event?.type || "unknown" };
  }

  const d = event.data || {};
  const recipients = [...(d.to || []), ...(d.cc || [])];
  const token = extractToken(recipients, {
    local: INBOUND_EMAIL_LOCAL,
    domain: INBOUND_EMAIL_DOMAIN,
  });
  const toAddress =
    recipients.find((r) => typeof r === "string" && r.includes("+")) ||
    recipients[0] ||
    null;

  // ── Fetch the body — the webhook carries metadata only. ──
  let text = "";
  let hdrs = {};
  try {
    const { data, error } = await client().emails.receiving.get(d.email_id);
    if (error) {
      console.error("[resendInbound] receiving.get error", error);
    } else if (data) {
      text = data.text || (data.html ? htmlToText(data.html) : "");
      hdrs = lowerKeys(data.headers);
    }
  } catch (err) {
    console.error("[resendInbound] receiving.get threw", err?.message);
  }

  // Shape a `parsed` object for the shared pipeline. Resend already parsed text
  // + headers, so no MIME parsing is needed on this path.
  const parsed = {
    from: (d.from || "").toLowerCase().trim() || null,
    toAddresses: d.to || [],
    subject: d.subject || null,
    text,
    // Resend's email_id is stable + unique → our idempotency / dedupe key.
    messageId: d.email_id || d.message_id || null,
    date: d.created_at ? new Date(d.created_at) : new Date(),
    headers: hdrs,
  };

  // Attachment filenames are in the webhook payload itself (no fetch needed).
  const attachments = (d.attachments || [])
    .map((a) => a.filename)
    .filter(Boolean);

  const result = await processInboundEmail({ parsed, token, toAddress, attachments });
  return { ok: true, result: result.status };
}
