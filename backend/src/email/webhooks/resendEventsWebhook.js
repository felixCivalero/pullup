// backend/src/email/webhooks/resendEventsWebhook.js
//
// Resend DELIVERY events (delivered / bounced / opened / clicked / complained)
// → the Room tick. This is the prod email provider, so without it the email
// "delivered" tick would only ever light up on the SES path. With it, an email
// gets the same sent → delivered → read language as WhatsApp.
//
// We match Resend's `data.email_id` (== our email_outbox.provider_message_id,
// stamped by markSent) → the outbox row → its tracking_id → the Room bubble.
//
// GATE: point a Resend webhook at POST /webhooks/resend-events with the
// email.delivered / .bounced / .opened / .clicked / .complained events, signed
// with RESEND_WEBHOOK_SIGNING_SECRET (already used for inbound). The open pixel
// already covers "read" provider-agnostically, so this is purely additive.

import { Resend } from "resend";
import {
  findById,
  findByProviderMessageId,
  getDeliveryHistoryFor,
  markDelivered,
  markBounced,
  markComplaint,
} from "../repos/emailOutboxRepo.js";
import { upsertSuppression } from "../repos/emailSuppressionsRepo.js";
import { bounceVerdict } from "../outbox/bouncePolicy.js";
import { bumpMessageStatus } from "../../services/messageStatus.js";
import { logger } from "../../logger.js";

// Each Resend webhook endpoint has its OWN signing secret. Prefer the events-
// specific one; fall back to the legacy single name for older boxes.
const RESEND_WEBHOOK_SECRET =
  process.env.RESEND_EVENTS_WEBHOOK_SIGNING_SECRET ||
  process.env.RESEND_WEBHOOK_SIGNING_SECRET ||
  process.env.RESEND_WEBHOOK_SECRET ||
  null;

let _client = null;
function client() {
  if (!_client) _client = new Resend(process.env.RESEND_API_KEY);
  return _client;
}

// Resend event type → the Room tick status (and the outbox bookkeeping).
const EVENT_MAP = {
  "email.delivered": "delivered",
  "email.opened": "read",
  "email.clicked": "read",
  "email.bounced": "failed",
  "email.complained": "failed",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// We stamp every send with tags.outbox_id (outboxWorker), so the event can name
// our row directly. Resend has shipped tags on webhook payloads as both an
// object map and an array of {name,value} — read both.
function outboxIdFromTags(data) {
  const tags = data?.tags;
  if (!tags) return null;
  if (Array.isArray(tags)) {
    const hit = tags.find((t) => t?.name === "outbox_id");
    return hit?.value || null;
  }
  if (typeof tags === "object") return tags.outbox_id || null;
  return null;
}

// Resolve the outbox row an event belongs to.
//
// The old code did a single findByProviderMessageId and gave up on a miss. That
// id is stamped only AFTER the provider call returns, so a fast delivered event
// (Gmail, ~1s) could arrive before the row knew its own message id — the lookup
// missed, the event was dropped, and the send sat at `sent` forever. Two ways
// out: the outbox_id tag we already send (no race — it is our own id), and a
// short bounded retry on the message-id lookup for events with no tags.
const LOOKUP_BACKOFF_MS = [0, 750, 2000, 4000];

async function resolveOutboxRow(data) {
  const taggedId = outboxIdFromTags(data);
  if (taggedId) {
    const byTag = await findById(taggedId);
    if (byTag) return byTag;
  }

  const emailId = data?.email_id || data?.id || null;
  if (!emailId) return null;

  for (const wait of LOOKUP_BACKOFF_MS) {
    if (wait) await sleep(wait);
    const row = await findByProviderMessageId(emailId);
    if (row) return row;
  }
  return null;
}

// Is this bounce permanent? Resend reports `data.bounce.type` as
// Permanent | Transient | Undetermined (older payloads flattened it onto
// data.type / data.bounce_type). Anything not explicitly permanent is treated
// as soft here and escalated separately by repeat-bounce history, so one bad
// night at a mail host never permanently silences a real guest.
function isPermanentBounce(data) {
  const raw = data?.bounce?.type || data?.bounce_type || data?.type || "";
  return String(raw).toLowerCase() === "permanent";
}

/**
 * @param {object} args
 * @param {string} args.rawBody  exact raw request body (for Svix signature verify)
 * @param {object} args.body     already-parsed JSON event (used when unverified)
 * @param {object} args.headers  request headers (svix-id / -timestamp / -signature)
 */
export async function handleResendEventEvent({ rawBody, body, headers }) {
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
      logger?.error?.("[resendEvents] signature verification failed", { error: err?.message });
      const e = new Error("Invalid Resend webhook signature");
      e.statusCode = 403;
      throw e;
    }
  } else if (process.env.NODE_ENV === "production") {
    // No signing secret in prod = a spoofable endpoint that mutates message
    // delivery state. Refuse rather than trust it. (Set the secret on the box.)
    logger?.error?.("[resendEvents] RESEND_WEBHOOK_SECRET unset in production — refusing unverified payload");
    const e = new Error("Resend webhook signing secret not configured");
    e.statusCode = 503;
    throw e;
  } else {
    logger?.warn?.("[resendEvents] RESEND_WEBHOOK_SECRET unset — accepting unverified (dev only)");
  }

  const type = event?.type;
  const status = EVENT_MAP[type];
  // email.received is the inbound webhook's job; ignore anything we don't map.
  if (!status) return { ok: true, ignored: type || "unknown" };

  const data = event?.data || {};
  const outboxRow = await resolveOutboxRow(data);
  if (!outboxRow) {
    logger?.warn?.("[resendEvents] no outbox match", {
      type,
      emailId: data?.email_id || data?.id || null,
    });
    return { ok: true, skipped: "no_outbox_match" };
  }

  // Keep the outbox row's own status in sync (best-effort; never blocks the tick).
  try {
    if (type === "email.delivered") await markDelivered(outboxRow.id);
    else if (type === "email.bounced") {
      await markBounced(outboxRow.id, {
        errorCode: "resend_bounce",
        errorMessage: data?.bounce?.message || data?.bounce?.subType || null,
      });
    } else if (type === "email.complained") {
      await markComplaint(outboxRow.id, { errorCode: "resend_complaint" });
    }
  } catch (err) {
    logger?.warn?.("[resendEvents] outbox status update failed", { error: err?.message });
  }

  // Stop mailing addresses that can never receive. Until now only the SES path
  // wrote suppressions, so on Resend (the prod provider) a dead address was
  // marked bounced on its own row and then mailed again on the next campaign —
  // typo'd addresses had bounced 9 and 10 times each, quietly burning sending
  // reputation on every blast. Complaints always suppress; bounces suppress on
  // an explicit Permanent, or once the address has proven itself dead.
  try {
    const recipient = data?.to?.[0] || data?.to || outboxRow.to_email || null;
    if (type === "email.complained" && recipient) {
      await upsertSuppression({
        email: recipient,
        reason: "complaint",
        source: "resend",
        details: data || {},
      });
    } else if (type === "email.bounced" && recipient) {
      const permanent = isPermanentBounce(data);
      // Only pay for the history lookup when the provider left it ambiguous.
      const history = permanent ? {} : await getDeliveryHistoryFor(recipient);
      const verdict = bounceVerdict({ permanent, ...history });
      if (verdict.suppress) {
        await upsertSuppression({
          email: recipient,
          reason: "hard_bounce",
          source: "resend",
          details: { ...(data || {}), pullup_reason: verdict.reason },
        });
      }
    }
  } catch (err) {
    logger?.warn?.("[resendEvents] suppression write failed", { error: err?.message });
  }

  if (outboxRow.tracking_id) {
    await bumpMessageStatus({ key: "tracking_id", value: outboxRow.tracking_id, status });
  }
  return { ok: true, type, status };
}
