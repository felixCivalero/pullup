// backend/src/email/webhooks/sesSnsWebhook.js

import MessageValidator from "sns-validator";
import { WEBHOOK_SNS_VERIFY } from "../config.js";
import { processSesEvent } from "../events/processSesEvent.js";

const validator = new MessageValidator();

// AWS only signs notifications from `sns.<region>.amazonaws.com`. We still
// parse the SubscribeURL host and assert it ourselves before any fetch, even
// after signature validation, so a confirmed subscriber can't smuggle a
// fetched URL pointing at the AWS metadata service or an internal host.
function isTrustedSnsHost(urlString) {
  try {
    const u = new URL(urlString);
    if (u.protocol !== "https:") return false;
    return /^sns\.[a-z0-9-]+\.amazonaws\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}

function validateMessage(message) {
  return new Promise((resolve, reject) => {
    validator.validate(message, (err, msg) => {
      if (err) return reject(err);
      resolve(msg);
    });
  });
}

async function confirmSubscription(subscribeUrl) {
  if (!isTrustedSnsHost(subscribeUrl)) {
    console.error(
      "[sesSnsWebhook] Refusing to confirm SubscribeURL with untrusted host:",
      subscribeUrl,
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
  if (!body || typeof body !== "object") {
    throw new Error("[sesSnsWebhook] Invalid body");
  }

  // Verify SNS signature first. Without this, any unauthenticated POST can
  // spoof bounces/complaints (poisoning email_suppressions) or trigger SSRF
  // through SubscribeURL. WEBHOOK_SNS_VERIFY=false is honored only as a dev
  // escape hatch and logs loudly.
  if (WEBHOOK_SNS_VERIFY) {
    try {
      await validateMessage(body);
    } catch (err) {
      console.error("[sesSnsWebhook] Signature validation failed:", err.message);
      const error = new Error("Invalid SNS signature");
      error.statusCode = 403;
      throw error;
    }
  } else {
    console.warn(
      "[sesSnsWebhook] WEBHOOK_SNS_VERIFY=false — accepting unsigned SNS message (dev only)",
    );
  }

  const messageType =
    headers?.["x-amz-sns-message-type"] ||
    headers?.["X-Amz-Sns-Message-Type"] ||
    body.Type;
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
