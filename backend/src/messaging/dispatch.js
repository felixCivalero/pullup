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
import { sendTemplate, isPhoneSuppressed } from "../whatsapp/index.js";
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

/**
 * @param {object} args
 * @param {object} args.recipient
 *   { id, email, phone_e164, phone_verified_at, marketing_consent, do_not_contact }
 * @param {object} args.hostProfile
 *   { id, whatsapp_enabled, whatsapp_signature, name, brand }
 * @param {object} [args.whatsapp]
 *   { templateKey, variables, locale? }    — required to even consider WA
 * @param {object} args.email
 *   { subject, htmlBody, textBody, fromEmail?, category? }
 * @param {object} [args.context]
 *   { campaignSendId, campaignTag, legalBasis, idempotencyKey,
 *     personId, hostProfileId }
 *   Used for outbox bookkeeping + tracking. Defaults derived from
 *   recipient / hostProfile when not passed.
 */
export async function dispatch({
  recipient,
  hostProfile,
  whatsapp = null,
  email,
  context = {},
}) {
  if (!recipient) throw new Error("[messaging/dispatch] recipient required");
  if (!email || (!email.subject && !email.htmlBody && !email.textBody)) {
    throw new Error(
      "[messaging/dispatch] email payload required for fallback",
    );
  }

  const personId = context.personId ?? recipient.id ?? null;
  const hostProfileId = context.hostProfileId ?? hostProfile?.id ?? null;

  // ── Decide whether WhatsApp is even a candidate. ───────────────────
  const reasons = [];
  let waChosen = !!whatsapp;
  if (!whatsapp || !whatsapp.templateKey) {
    waChosen = false;
    reasons.push("no whatsapp payload");
  }
  if (waChosen && hostProfile?.whatsapp_enabled === false) {
    waChosen = false;
    reasons.push("host disabled whatsapp");
  }
  if (waChosen && !recipient.phone_e164) {
    waChosen = false;
    reasons.push("no phone_e164");
  }
  if (waChosen && !recipient.phone_verified_at) {
    waChosen = false;
    reasons.push("phone not verified");
  }
  if (waChosen && recipient.do_not_contact) {
    waChosen = false;
    reasons.push("do_not_contact");
  }
  if (waChosen && !isTemplateApproved(whatsapp.templateKey)) {
    waChosen = false;
    reasons.push(
      `template not approved (${TEMPLATES?.[whatsapp.templateKey]?.status || "unknown"})`,
    );
  }

  // Per-guest opt-in + suppression checks (DB lookups; skip when already ruled out).
  if (waChosen) {
    if (await isPhoneSuppressed(recipient.phone_e164)) {
      waChosen = false;
      reasons.push("phone suppressed");
    }
  }
  if (waChosen) {
    const okay = await hasActiveOptIn({
      phoneE164: recipient.phone_e164,
      channel: "whatsapp",
      hostProfileId,
    });
    if (!okay) {
      waChosen = false;
      reasons.push("no active opt-in");
    }
  }

  // ── WhatsApp path ──────────────────────────────────────────────────
  if (waChosen) {
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
      logger?.warn?.("[messaging/dispatch] whatsapp send failed, falling back to email", {
        to: recipient.phone_e164,
        templateKey: whatsapp.templateKey,
        code: err.code,
        message: err.message,
      });
      // fall through to email below
    }
  }

  // ── Email path (default + fallback) ────────────────────────────────
  if (!recipient.email) {
    // No WhatsApp and no email = the message reaches no one. This was a quiet
    // warn with no audit trail; make it a loud, structured, alertable signal
    // (stable `event` tag) and flag it on the return so callers can react.
    logger?.error?.("[messaging/dispatch] message dropped — no deliverable channel", {
      event: "message_dropped",
      recipient_id: recipient.id ?? null,
      person_id: personId,
      host_profile_id: hostProfileId,
      whatsapp_template: whatsapp?.templateKey ?? null,
      reasons,
    });
    return { channel: "suppressed", row: null, fallback: waChosen, dropped: true };
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
    fallback: !!whatsapp && !waChosen ? false : !!whatsapp,
    skipped_whatsapp_because: reasons,
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
