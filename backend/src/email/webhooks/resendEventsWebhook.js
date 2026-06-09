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
import { findByProviderMessageId, markDelivered, markBounced, markComplaint } from "../repos/emailOutboxRepo.js";
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

  const emailId = event?.data?.email_id || event?.data?.id || null;
  if (!emailId) return { ok: true, skipped: "no_email_id" };

  const outboxRow = await findByProviderMessageId(emailId);
  if (!outboxRow) return { ok: true, skipped: "no_outbox_match" };

  // Keep the outbox row's own status in sync (best-effort; never blocks the tick).
  try {
    if (type === "email.delivered") await markDelivered(outboxRow.id);
    else if (type === "email.bounced") await markBounced(outboxRow.id, { errorCode: "resend_bounce" });
    else if (type === "email.complained") await markComplaint(outboxRow.id, { errorCode: "resend_complaint" });
  } catch (err) {
    logger?.warn?.("[resendEvents] outbox status update failed", { error: err?.message });
  }

  if (outboxRow.tracking_id) {
    await bumpMessageStatus({ key: "tracking_id", value: outboxRow.tracking_id, status });
  }
  return { ok: true, type, status };
}
