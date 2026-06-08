// backend/src/email/events/processSesEvent.js

import { insertEvent } from "../repos/emailEventsRepo.js";
import {
  findById,
  findByProviderMessageId,
  markDelivered,
  markBounced,
  markComplaint,
} from "../repos/emailOutboxRepo.js";
import { upsertSuppression } from "../repos/emailSuppressionsRepo.js";
import { bumpMessageStatus } from "../../services/messageStatus.js";

function canonicalizeEventType(eventType) {
  if (eventType === "Delivery") return "delivery";
  if (eventType === "Bounce") return "bounce";
  if (eventType === "Complaint") return "complaint";
  return (eventType || "unknown").toLowerCase();
}

function extractRecipient(notification, outboxRow) {
  const deliveryRecipients = notification.delivery?.recipients || [];
  const deliveryRecipient = deliveryRecipients[0] || null;

  const mailDestination = notification.mail?.destination || [];
  const mailRecipient = mailDestination[0] || null;

  return (
    deliveryRecipient ||
    mailRecipient ||
    outboxRow?.to_email ||
    null
  );
}

async function resolveOutboxRow(notification) {
  const mail = notification.mail || {};
  const tags = mail.tags || {};

  const outboxIdStr = Array.isArray(tags.outbox_id)
    ? tags.outbox_id[0]
    : tags.outbox_id;

  if (outboxIdStr) {
    const byId = await findById(outboxIdStr);
    if (byId) {
      return { outboxRow: byId, outboxId: byId.id };
    }
  }

  const messageId = mail.messageId;
  const byProviderMessageId = await findByProviderMessageId(messageId);
  return {
    outboxRow: byProviderMessageId,
    outboxId: byProviderMessageId?.id ?? null,
  };
}

export async function processSesEvent(notification) {
  if (!notification || typeof notification !== "object") {
    throw new Error("[processSesEvent] Invalid notification");
  }

  const eventType = notification.eventType;
  const mail = notification.mail || {};
  const messageId = mail.messageId;

  const canonicalEventType = canonicalizeEventType(eventType);

  const { outboxRow, outboxId } = await resolveOutboxRow(notification);

  const recipient = extractRecipient(notification, outboxRow);

  // Always store the raw event
  await insertEvent({
    provider: "ses",
    providerMessageId: messageId,
    eventType: canonicalEventType,
    emailOutboxId: outboxId,
    recipient,
    payload: notification,
  });

  if (!outboxRow) {
    console.warn(
      "[processSesEvent] No email_outbox row found for provider_message_id or outbox_id",
      {
        messageId,
      },
    );
    return { ok: true, eventType: canonicalEventType };
  }

  if (eventType === "Delivery") {
    await markDelivered(outboxRow.id);
    // Mirror onto the Room bubble (if this was a Room message) — the email got
    // to their inbox, so the tick moves sent → delivered, live.
    if (outboxRow.tracking_id) {
      await bumpMessageStatus({ key: "tracking_id", value: outboxRow.tracking_id, status: "delivered" });
    }
  } else if (eventType === "Bounce") {
    const bounce = notification.bounce || {};
    const bounceType = bounce.bounceType || "";
    const isHard = bounceType === "Permanent";

    await markBounced(outboxRow.id, {
      errorCode: bounceType,
      errorMessage: bounce.bounceSubType || null,
    });
    // It didn't land — surface a red "!" on the Room bubble.
    if (outboxRow.tracking_id) {
      await bumpMessageStatus({ key: "tracking_id", value: outboxRow.tracking_id, status: "failed" });
    }

    const recipients = bounce.bouncedRecipients || [];
    const toEmail =
      recipients[0]?.emailAddress || outboxRow.to_email || null;

    if (toEmail && isHard) {
      await upsertSuppression({
        email: toEmail,
        reason: "hard_bounce",
        source: "ses",
        details: bounce,
      });
    }
  } else if (eventType === "Complaint") {
    const complaint = notification.complaint || {};
    await markComplaint(outboxRow.id, {
      errorCode: complaint.complaintFeedbackType || null,
      errorMessage: null,
    });

    const recipients = complaint.complainedRecipients || [];
    const toEmail =
      recipients[0]?.emailAddress || outboxRow.to_email || null;

    if (toEmail) {
      await upsertSuppression({
        email: toEmail,
        reason: "complaint",
        source: "ses",
        details: complaint,
      });
    }
  }

  return { ok: true, eventType: canonicalEventType };
}

