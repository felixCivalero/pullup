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

import crypto from "node:crypto";
import { Resend } from "resend";
import { INBOUND_EMAIL_DOMAIN, INBOUND_EMAIL_LOCAL } from "../config.js";
import { extractToken } from "../inbound/parseInboundEmail.js";
import { processInboundEmail } from "../inbound/processInboundEmail.js";
import { supabase } from "../../supabase.js";

const ATTACH_BUCKET = "event-images";
const MAX_ATTACH_BYTES = 15 * 1024 * 1024;

// Resend's attachment endpoint returns a short-lived download_url, so we pull
// the bytes and re-host them in our own storage — durable public URLs that
// persist on the message and survive reloads. Returns [{name,url,contentType,isImage}].
async function storeAttachments(emailId, meta) {
  const out = [];
  for (const a of meta || []) {
    try {
      const { data, error } = await client().emails.receiving.attachments.get({
        emailId,
        id: a.id,
      });
      const dl = data?.download_url;
      if (error || !dl) {
        console.error("[resendInbound] attachment fetch failed", { id: a.id, error: error?.message });
        continue;
      }
      const resp = await fetch(dl);
      if (!resp.ok) {
        console.error("[resendInbound] attachment download failed", { id: a.id, status: resp.status });
        continue;
      }
      const buf = Buffer.from(await resp.arrayBuffer());
      if (buf.length > MAX_ATTACH_BYTES) {
        console.warn("[resendInbound] attachment too large, skipping", a.filename);
        continue;
      }
      const ct = a.content_type || "application/octet-stream";
      const ext = (ct.split("/")[1] || "bin").split("+")[0].replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
      const key = `room-attachments/inbound/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from(ATTACH_BUCKET)
        .upload(key, buf, { contentType: ct, upsert: true });
      if (upErr) {
        console.error("[resendInbound] storage upload failed", upErr.message);
        continue;
      }
      const { data: pub } = supabase.storage.from(ATTACH_BUCKET).getPublicUrl(key);
      out.push({
        name: a.filename || `file.${ext}`,
        url: pub.publicUrl,
        contentType: ct,
        isImage: ct.startsWith("image/"),
      });
    } catch (err) {
      console.error("[resendInbound] attachment store error", err?.message);
    }
  }
  return out;
}

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

// Where the quoted reply chain begins in the HTML, per client. We keep only the
// HTML BEFORE the first marker as the sender's "new" content.
const HTML_QUOTE_MARKERS = [
  /<div[^>]*class="[^"]*gmail_quote/i, // Gmail
  /<blockquote[^>]*type="cite"/i, // Apple Mail
  /<div[^>]*class="[^"]*yahoo_quoted/i, // Yahoo
  /<div[^>]*id="divRplyFwdMsg/i, // Outlook desktop
  /<div[^>]*id="mail-editor-reference-message-container/i, // Outlook web
  /<hr[^>]*id="zwchr"/i, // Zimbra
  /<blockquote/i, // generic — last resort
];

export function stripQuotedHtml(html) {
  if (!html) return { newHtml: "", quotedFound: false };
  let cut = -1;
  for (const re of HTML_QUOTE_MARKERS) {
    const m = html.match(re);
    if (m && (cut === -1 || m.index < cut)) cut = m.index;
  }
  if (cut === -1) return { newHtml: html, quotedFound: false };
  return { newHtml: html.slice(0, cut), quotedFound: true };
}

export function collectCids(html) {
  const set = new Set();
  if (!html) return set;
  const re = /cid:([^"'\s>)]+)/gi;
  let m;
  while ((m = re.exec(html))) set.add(m[1].trim().toLowerCase());
  return set;
}

// Keep only attachments that are part of the NEW reply, not the quoted thread:
//  • an explicitly attached file (disposition "attachment") → always keep
//  • an inline image (content_id) → keep ONLY if its cid is referenced in the
//    new (pre-quote) HTML, i.e. the sender pasted it into their reply
//  • when no quote boundary is detected (e.g. some Outlook markup), fall back to
//    conservative: drop inline images (never re-attach the thread's embeds)
export function selectNewAttachments(attachments, html) {
  const { newHtml, quotedFound } = stripQuotedHtml(html);
  const newCids = quotedFound ? collectCids(newHtml) : new Set();
  return (attachments || []).filter((a) => {
    const disp = String(a.content_disposition || "").toLowerCase();
    if (disp === "attachment") return true;
    const cid = a.content_id
      ? String(a.content_id).replace(/^<|>$/g, "").trim().toLowerCase()
      : null;
    if (cid) return newCids.has(cid);
    return disp !== "inline";
  });
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
  } else if (process.env.NODE_ENV === "production") {
    // In prod, no signing secret = we can't prove Resend sent this, yet this
    // endpoint writes into hosts' Rooms. Refuse rather than accept a spoofable
    // payload. (Set RESEND_WEBHOOK_SIGNING_SECRET on the box to enable it.)
    console.error("[resendInbound] RESEND_WEBHOOK_SECRET unset in production — refusing unverified payload");
    const e = new Error("Resend webhook signing secret not configured");
    e.statusCode = 503;
    throw e;
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
  let html = "";
  let hdrs = {};
  try {
    const { data, error } = await client().emails.receiving.get(d.email_id);
    if (error) {
      console.error("[resendInbound] receiving.get error", error);
    } else if (data) {
      html = data.html || "";
      text = data.text || (html ? htmlToText(html) : "");
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

  // Keep only attachments from the NEW reply (attached files + inline images the
  // sender pasted into their reply) — not the quoted thread's embedded images,
  // signatures or logos. Uses the HTML to tell new cids from quoted ones.
  const newAttachments = selectNewAttachments(d.attachments || [], html);

  // Fetch + re-host attachments durably (webhook only carries metadata).
  const attachments = await storeAttachments(d.email_id, newAttachments);

  const result = await processInboundEmail({ parsed, token, toAddress, attachments });
  return { ok: true, result: result.status };
}
