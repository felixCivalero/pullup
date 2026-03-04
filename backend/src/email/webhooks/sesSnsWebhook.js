// backend/src/email/webhooks/sesSnsWebhook.js

import { WEBHOOK_SNS_VERIFY } from "../config.js";
import { processSesEvent } from "../events/processSesEvent.js";

async function confirmSubscription(subscribeUrl) {
  if (!WEBHOOK_SNS_VERIFY) {
    console.log(
      "[sesSnsWebhook] SubscriptionConfirmation received, WEBHOOK_SNS_VERIFY=false, skipping auto-confirm",
    );
    return;
  }
  try {
    const res = await fetch(subscribeUrl);
    console.log(
      "[sesSnsWebhook] SubscriptionConfirmation confirm status",
      res.status,
    );
  } catch (error) {
    console.error(
      "[sesSnsWebhook] Error confirming SubscriptionConfirmation",
      error,
    );
  }
}

export async function handleSesSnsEvent({ headers, body }) {
  const messageType =
    headers["x-amz-sns-message-type"] ||
    headers["X-Amz-Sns-Message-Type"] ||
    body?.Type;

  if (!body || typeof body !== "object") {
    throw new Error("[sesSnsWebhook] Invalid body");
  }

  const type = body.Type || messageType;

  if (type === "SubscriptionConfirmation") {
    await confirmSubscription(body.SubscribeURL);
    return { ok: true, type };
  }

  if (type !== "Notification") {
    console.log("[sesSnsWebhook] Ignoring non-Notification SNS message", type);
    return { ok: true, type };
  }

  let notification;
  try {
    notification = JSON.parse(body.Message);
  } catch (error) {
    console.error("[sesSnsWebhook] Failed to parse Message JSON", error);
    throw new Error("Invalid SES notification payload");
  }

  const result = await processSesEvent(notification);

  return { ok: true, type, eventType: result.eventType };
}

