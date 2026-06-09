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
import { TEMPLATES, activeKey } from "../whatsapp/templates/registry.js";
import { logger } from "../logger.js";
import { resolveTryOrder } from "../lib/idempotency.js";
import { IG_HUMAN_AGENT_APPROVED } from "../instagram/config.js";

/**
 * Pure decision for what an Instagram send may do, given the window state, who
 * composed it, and whether Meta has approved the HUMAN_AGENT feature. Extracted
 * so the policy is unit-testable without a DB or the network.
 *
 *   standard      → free text, no tag.
 *   human_agent   → only a HUMAN_AGENT-tagged, human-composed reply, AND only
 *                   once Meta has approved the feature (else it 403s — see
 *                   IG_HUMAN_AGENT_APPROVED). Otherwise not sendable → fall to email.
 *   expired/other → not sendable.
 *
 * @returns {{ send: boolean, humanAgent: boolean, reason?: string }}
 */
export function decideIgSend({ state, humanComposed, humanAgentApproved }) {
  if (state === "standard") return { send: true, humanAgent: false };
  if (state === "human_agent") {
    if (!humanComposed) {
      return { send: false, humanAgent: false, reason: "ig: 24h–7d window needs a human-composed reply" };
    }
    if (!humanAgentApproved) {
      return { send: false, humanAgent: false, reason: "ig: extended (24h–7d) replies pending Meta Human Agent approval" };
    }
    return { send: true, humanAgent: true };
  }
  return { send: false, humanAgent: false, reason: "ig: window expired (>7d since inbound)" };
}

// A message dispatch() could not deliver on ANY channel — persist it so a drop
// is a recoverable row, not just a stderr line. Best-effort: never throw out of
// the send path because we failed to record the failure.
async function recordDeadLetter({ recipient, personId, hostProfileId, preferredChannel, email, reasons }) {
  try {
    await supabase.from("message_dead_letters").insert({
      person_id: personId,
      host_profile_id: hostProfileId,
      preferred_channel: preferredChannel,
      subject: email?.subject ?? null,
      reasons,
      payload: {
        recipient_id: recipient?.id ?? null,
        has_phone: !!recipient?.phone_e164,
        has_email: !!recipient?.email,
        has_ig: !!(recipient?.ig_user_id || recipient?.igUserId),
      },
    });
  } catch (err) {
    logger?.error?.("[messaging/dispatch] dead-letter write failed", { error: err?.message });
  }
}

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
  // Gate on the ACTIVE key's status — sendTemplate resolves activeKey() before
  // sending, so checking the logical key could green-light an unapproved v2 (or
  // wrongly block a logical key whose active alias is the approved one).
  return TEMPLATES?.[activeKey(templateKey)]?.status === "approved";
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
    const decision = decideIgSend({ state, humanComposed, humanAgentApproved: IG_HUMAN_AGENT_APPROVED });
    if (!decision.send) { reasons.push(decision.reason); return null; }
    const { getConnectionForHost, getCredentialsByIgUserId } =
      await import("../instagram/repos/instagramConnectionsRepo.js");
    const conn = await getConnectionForHost(hostProfileId);
    const creds = conn?.ig_user_id ? await getCredentialsByIgUserId(conn.ig_user_id) : null;
    if (!creds?.accessToken) { reasons.push("ig: host not connected"); return null; }
    const { sendMessage } = await import("../instagram/providers/igGraphClient.js");
    const base = { igUserId: creds.igUserId, accessToken: creds.accessToken, recipientId: igId, humanAgent: decision.humanAgent };
    // A message is text OR one attachment — so send the note, then one send per
    // image. Keep the last provider message id for delivery/read tracking.
    let mid = null;
    if (bodyText) { const res = await sendMessage({ ...base, text: bodyText }); mid = res?.message_id || mid; }
    for (const img of images) {
      const res = await sendMessage({ ...base, attachment: { type: "image", url: img.url } });
      mid = res?.message_id || mid;
    }
    await upsertThreadFromMessage({
      personId, hostProfileId, igUserId: igId,
      direction: "outbound", preview: bodyText || (images.length ? "[Photo]" : "[media]"),
    });
    return { channel: "instagram", mid };
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
 * Send an Instagram DM IFF the messaging window allows it — and NOTHING else.
 * Unlike dispatch(), this never falls through to WhatsApp or the email floor,
 * so it's safe to fire alongside a confirmation that already went out on another
 * rail (e.g. the RSVP→DM trigger): a closed window is a silent no-op, never a
 * duplicate email.
 *
 * Returns { channel: 'instagram', mid } on a real send, or
 * { sent: false, reasons } when the window's closed / not connected / no IGSID.
 *
 * @param {object} args
 * @param {object} args.recipient  { id, ig_user_id }
 * @param {string} args.text
 * @param {Array}  [args.attachments]
 * @param {boolean} [args.humanComposed]  false for automated sends (limits to the 24h window)
 * @param {string} args.personId
 * @param {string} args.hostProfileId
 */
export async function sendInstagramDM({ recipient, text, attachments = [], humanComposed = false, personId, hostProfileId }) {
  const reasons = [];
  const r = await attemptInstagram({ recipient, text, attachments, humanComposed, personId, hostProfileId, reasons });
  if (r?.channel) return { ...r, sent: true };
  return { sent: false, reasons };
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
  strict = false,
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
  const tryOrder = resolveTryOrder({ preferredChannel, hasWhatsAppTemplate: !!whatsapp });

  for (const ch of tryOrder) {
    const r = ch === "instagram"
      ? await attemptInstagram({ recipient, text, attachments, humanComposed, personId, hostProfileId, reasons })
      : await attemptWhatsApp({ recipient, hostProfile, text, attachments, whatsapp, personId, hostProfileId, context, reasons });
    if (r?.channel) return { ...r, fallback: false };
  }

  // ── Strict 1:1 send: the host explicitly chose a live rail and it couldn't
  //    deliver AS ITSELF (window closed, not connected, opt-out…). NEVER silently
  //    reroute a DM to email behind the host's back — report it blocked so the UI
  //    can say "couldn't reach them on X" and let the host consciously pick email.
  //    (Automated rails — reminders, auto-DMs, broadcasts — leave strict off and
  //    keep the email floor below.) ──
  if (strict && preferredChannel && preferredChannel !== "email") {
    logger?.info?.("[messaging/dispatch] strict send blocked — chosen rail unavailable, not rerouting to email", {
      person_id: personId, host_profile_id: hostProfileId, preferred_channel: preferredChannel, reasons,
    });
    return { channel: "blocked", row: null, fallback: false, dropped: true, blockedChannel: preferredChannel, reasons };
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
    await recordDeadLetter({ recipient, personId, hostProfileId, preferredChannel, email, reasons });
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
