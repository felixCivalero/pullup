// backend/src/messaging/dispatch.js
//
// Unified channel router. Every transactional or broadcast send in the
// app goes through `dispatch()`; the router decides per-recipient
// whether the message ships via WhatsApp or via email, applies host-
// level and per-guest gates, and gracefully falls through on failure.
//
// Decision tree (in order):
//
//   1. Host disabled WhatsApp                       → email
//   2. Recipient has no E.164 phone                 → email
//   3. Recipient's phone not verified               → email
//   4. Recipient is on whatsapp_suppressions        → email
//   5. No active phone_opt_ins row for this host    → email
//   6. WhatsApp send attempted; provider errors out → email (fallback)
//   7. WhatsApp send succeeds                       → whatsapp
//
// The contract is intentionally symmetric: the caller supplies BOTH a
// `whatsapp` block (templateKey + variables) and an `email` block
// (subject + body), so the router can pick either without coordinating
// back. The caller treats it like dual-rendering once and the router
// chooses the rail.
//
// Returns:
//   { channel: 'whatsapp' | 'email' | 'suppressed',
//     row:     <the persisted outbox row>,
//     fallback: <truthy when WA was preferred but failed/skipped> }

import { supabase } from "../supabase.js";
import { sendTemplate, sendText, isPhoneSuppressed } from "../whatsapp/index.js";
import { hasActiveOptIn } from "../whatsapp/repos/phoneOptInsRepo.js";
import { enqueueOutbox as enqueueEmailOutbox } from "../email/index.js";
import { TEMPLATES } from "../whatsapp/templates/registry.js";
import { logger } from "../logger.js";

/**
 * A template may only ship on WhatsApp once Meta has approved it. Until then
 * (status 'draft'/'submitted') email is the floor, in EVERY environment.
 *
 * This is deliberately not bypassed in sandbox: sandbox returns a synthetic
 * provider success, so a non-approved template would otherwise report
 * "whatsapp sent" and skip the email — silently swallowing the message. And
 * because WHATSAPP_SANDBOX_MODE defaults to ON, that swallow would hit any
 * deployment that forgets to disable it. Gating on real approval keeps the
 * behaviour identical and correct regardless of the sandbox flag: nothing
 * ships on WhatsApp until Meta says yes, then it lights up automatically.
 */
function isTemplateApproved(templateKey) {
  return TEMPLATES?.[templateKey]?.status === "approved";
}

// Is ANY WhatsApp template approved yet? Until at least one is, dispatch()
// can never actually pick WhatsApp, so a generic "this guest gets WhatsApp"
// preview would be lying. previewChannel() gates on this so the UI stops
// promising a rail we don't have; it lights up automatically on approval.
function anyTemplateApproved() {
  return Object.values(TEMPLATES || {}).some((t) => t?.status === "approved");
}

// ── Instagram attempt — in-window live chat only (no templates). ───────
// Free text within 24h of the guest's last inbound; within 24h–7d only a
// human-composed reply with the HUMAN_AGENT tag. Beyond 7d → not deliverable.
async function attemptInstagram({ recipient, text, attachments = [], humanComposed, personId, hostProfileId, reasons }) {
  const igId = recipient.ig_user_id || recipient.igUserId || null;
  if (!igId) { reasons.push("ig: no ig_user_id"); return null; }
  // Images go as real attachments; anything we can't deliver as media (e.g. a
  // generic file) rides along as a link in the text — IG attachments only
  // support image/video/audio.
  const images = (attachments || []).filter((a) => a?.url && a?.isImage);
  const others = (attachments || []).filter((a) => a?.url && !a?.isImage);
  const bodyText = others.length
    ? `${text ? text + "\n\n" : ""}${others.map((a) => a.url).join("\n")}`.trim()
    : (text || "");
  if (!bodyText && !images.length) { reasons.push("ig: nothing to send"); return null; }
  try {
    const { getWindowState, upsertThreadFromMessage } =
      await import("../instagram/repos/instagramThreadsRepo.js");
    const state = await getWindowState({ personId, hostProfileId });
    if (state === "expired") { reasons.push("ig: window expired (>7d since inbound)"); return null; }
    if (state === "human_agent" && !humanComposed) {
      reasons.push("ig: 24h–7d window needs a human-composed reply");
      return null;
    }
    const { getConnectionForHost, getCredentialsByIgUserId } =
      await import("../instagram/repos/instagramConnectionsRepo.js");
    const conn = await getConnectionForHost(hostProfileId);
    const creds = conn?.ig_user_id ? await getCredentialsByIgUserId(conn.ig_user_id) : null;
    if (!creds?.accessToken) { reasons.push("ig: host not connected"); return null; }
    const { sendMessage } = await import("../instagram/providers/igGraphClient.js");
    const base = { igUserId: creds.igUserId, accessToken: creds.accessToken, recipientId: igId, humanAgent: state === "human_agent" };
    // A message is text OR one attachment — so send the note, then one send per image.
    if (bodyText) await sendMessage({ ...base, text: bodyText });
    for (const img of images) {
      await sendMessage({ ...base, attachment: { type: "image", url: img.url } });
    }
    await upsertThreadFromMessage({
      personId, hostProfileId, igUserId: igId,
      direction: "outbound", preview: bodyText || (images.length ? "[Photo]" : "[media]"),
    });
    return { channel: "instagram" };
  } catch (e) {
    reasons.push(`ig: send failed (${e?.message || e})`);
    logger?.error?.("[messaging/dispatch] instagram send failed, falling through", {
      person_id: personId, host_profile_id: hostProfileId, message: e?.message,
    });
    return null;
  }
}

// ── WhatsApp attempt — in-window free text, else approved template. ────
async function attemptWhatsApp({ recipient, hostProfile, text, attachments = [], whatsapp, personId, hostProfileId, context, reasons }) {
  if (hostProfile?.whatsapp_enabled === false) { reasons.push("wa: host disabled"); return null; }
  if (!recipient.phone_e164) { reasons.push("wa: no phone_e164"); return null; }
  if (!recipient.phone_verified_at) { reasons.push("wa: phone not verified"); return null; }
  if (recipient.do_not_contact) { reasons.push("wa: do_not_contact"); return null; }
  if (await isPhoneSuppressed(recipient.phone_e164)) { reasons.push("wa: phone suppressed"); return null; }
  if (!(await hasActiveOptIn({ phoneE164: recipient.phone_e164, channel: "whatsapp", hostProfileId }))) {
    reasons.push("wa: no active opt-in");
    return null;
  }

  // WhatsApp text is plain — fold any attachment URLs into the body (we don't
  // do WA media upload yet, so they ride as links).
  const waBody = (attachments && attachments.length)
    ? `${text ? text + "\n\n" : ""}${attachments.map((a) => a.url).join("\n")}`.trim()
    : text;

  // Inside the 24h window → a real free-text message in the host's voice.
  if (waBody) {
    try {
      const { isConversationWindowOpen } = await import("../whatsapp/repos/whatsappThreadsRepo.js");
      if (await isConversationWindowOpen({ personId, hostProfileId })) {
        const row = await sendText({
          to: recipient.phone_e164, body: waBody, personId, hostProfileId,
          legalBasis: context.legalBasis ?? "consent",
          idempotencyKey: context.idempotencyKey ?? null,
        });
        return { channel: "whatsapp", row };
      }
    } catch (e) {
      reasons.push(`wa: in-window send failed (${e?.message || e})`);
    }
  }

  // Window closed (or no live text) → only an approved template is legal.
  if (whatsapp?.templateKey) {
    if (!isTemplateApproved(whatsapp.templateKey)) {
      reasons.push(`wa: template not approved (${TEMPLATES?.[whatsapp.templateKey]?.status || "unknown"})`);
      return null;
    }
    try {
      const row = await sendTemplate({
        to: recipient.phone_e164,
        templateKey: whatsapp.templateKey,
        variables: whatsapp.variables,
        locale: whatsapp.locale,
        personId,
        hostProfileId,
        campaignSendId: context.campaignSendId ?? null,
        campaignTag: context.campaignTag ?? null,
        legalBasis: context.legalBasis ?? "consent",
        idempotencyKey: context.idempotencyKey ?? null,
      });
      return { channel: "whatsapp", row };
    } catch (err) {
      reasons.push(`wa: template send failed (${err?.message})`);
      logger?.warn?.("[messaging/dispatch] whatsapp template failed, falling back to email", {
        to: recipient.phone_e164, templateKey: whatsapp.templateKey, code: err.code, message: err.message,
      });
      return null;
    }
  }
  reasons.push("wa: no in-window text and no template");
  return null;
}

/**
 * The single send router for every 1:1 message. The caller renders ONCE and
 * supplies whatever the chosen rail might need; the router picks the channel,
 * enforces every per-channel constraint (WA 24h window/template approval/opt-in,
 * IG 24h + 7d human-agent windows), and falls through to the email floor.
 *
 * @param {object} args
 * @param {object} args.recipient { id, email, phone_e164, phone_verified_at, ig_user_id, do_not_contact }
 * @param {object} args.hostProfile { id, whatsapp_enabled, ... }
 * @param {string} [args.preferredChannel] 'whatsapp' | 'instagram' | 'email' — the
 *   thread's rail. Omitted (legacy proactive callers) ⇒ WhatsApp-template-then-email.
 * @param {string} [args.text] free-text body for the live rails (WA in-window, IG).
 * @param {object} [args.whatsapp] { templateKey, variables, locale } for the closed-window WA template.
 * @param {object} args.email { subject, htmlBody, textBody, fromEmail?, category? } — the floor (required).
 * @param {boolean} [args.humanComposed] true for host-typed Room messages; gates IG's 7d human-agent tag.
 * @param {object} [args.context] { campaignSendId, campaignTag, legalBasis, idempotencyKey, personId, hostProfileId }
 * @returns {Promise<{channel, row?, fallback, dropped?, reasons?}>}
 */
export async function dispatch({
  recipient,
  hostProfile,
  preferredChannel = null,
  text = null,
  attachments = [],
  whatsapp = null,
  email,
  humanComposed = false,
  context = {},
}) {
  if (!recipient) throw new Error("[messaging/dispatch] recipient required");
  if (!email || (!email.subject && !email.htmlBody && !email.textBody)) {
    throw new Error("[messaging/dispatch] email payload required for fallback");
  }

  const personId = context.personId ?? recipient.id ?? null;
  const hostProfileId = context.hostProfileId ?? hostProfile?.id ?? null;
  const reasons = [];

  // Which rail to try before the email floor. An explicit preferredChannel is
  // the thread's rail; with none (legacy proactive sends) we try WhatsApp when
  // a template was supplied, exactly as before. Email is always the floor.
  const tryOrder = [];
  if (preferredChannel === "instagram") tryOrder.push("instagram");
  else if (preferredChannel === "whatsapp") tryOrder.push("whatsapp");
  else if (!preferredChannel && whatsapp) tryOrder.push("whatsapp");

  for (const ch of tryOrder) {
    const r = ch === "instagram"
      ? await attemptInstagram({ recipient, text, attachments, humanComposed, personId, hostProfileId, reasons })
      : await attemptWhatsApp({ recipient, hostProfile, text, attachments, whatsapp, personId, hostProfileId, context, reasons });
    if (r?.channel) return { ...r, fallback: false };
  }

  // ── Email floor (default + fallback) ───────────────────────────────
  if (!recipient.email) {
    logger?.error?.("[messaging/dispatch] message dropped — no deliverable channel", {
      event: "message_dropped",
      recipient_id: recipient.id ?? null,
      person_id: personId,
      host_profile_id: hostProfileId,
      preferred_channel: preferredChannel,
      reasons,
    });
    return { channel: "suppressed", row: null, fallback: tryOrder.length > 0, dropped: true, reasons };
  }

  const emailRow = await enqueueEmailOutbox({
    fromEmail: email.fromEmail,
    toEmail: recipient.email,
    subject: email.subject,
    htmlBody: email.htmlBody,
    textBody: email.textBody,
    campaignSendId: context.campaignSendId ?? null,
    campaignTag: context.campaignTag ?? null,
    idempotencyKey: context.idempotencyKey ?? null,
    category: email.category ?? "transactional",
    // Lets a reply to this email thread back to the host's Room (two-way email).
    personId,
    hostProfileId,
  });

  return {
    channel: "email",
    row: emailRow,
    fallback: tryOrder.length > 0,
    skipped_because: reasons,
  };
}

/**
 * Lighter-weight check that returns the channel the router WOULD pick
 * without actually sending. Useful for UI hints ("This guest will get
 * a WhatsApp") and for cost previews.
 */
export async function previewChannel({ recipient, hostProfile }) {
  if (!recipient) return "email";
  // No approved template → dispatch() always falls to email; don't preview WA.
  if (!anyTemplateApproved()) return "email";
  if (hostProfile?.whatsapp_enabled === false) return "email";
  if (!recipient.phone_e164) return "email";
  if (!recipient.phone_verified_at) return "email";
  if (recipient.do_not_contact) return "email";
  if (await isPhoneSuppressed(recipient.phone_e164)) return "email";
  const optedIn = await hasActiveOptIn({
    phoneE164: recipient.phone_e164,
    channel: "whatsapp",
    hostProfileId: hostProfile?.id ?? null,
  });
  if (!optedIn) return "email";
  return "whatsapp";
}
