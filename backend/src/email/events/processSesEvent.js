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
import { supabase } from "../../supabase.js";

async function updateCampaignSendDeliveryStatus(campaignSendId, status) {
  if (!campaignSendId) return;
  const fields = {
    delivery_status: status,
    delivery_status_updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("campaign_sends")
    .update(fields)
    .eq("id", campaignSendId);
  if (error) {
    console.error(
      "[processSesEvent] Failed to update campaign_sends.delivery_status",
      error,
    );
  }
}

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
    await updateCampaignSendDeliveryStatus(
      outboxRow.campaign_send_id,
      "delivered",
    );
  } else if (eventType === "Bounce") {
    const bounce = notification.bounce || {};
    const bounceType = bounce.bounceType || "";
    const isHard = bounceType === "Permanent";

    await markBounced(outboxRow.id, {
      errorCode: bounceType,
      errorMessage: bounce.bounceSubType || null,
    });

    await updateCampaignSendDeliveryStatus(
      outboxRow.campaign_send_id,
      "bounced",
    );

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

    await updateCampaignSendDeliveryStatus(
      outboxRow.campaign_send_id,
      "complaint",
    );

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

