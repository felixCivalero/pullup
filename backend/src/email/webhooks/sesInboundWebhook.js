// backend/src/email/webhooks/sesInboundWebhook.js
//
// Receives inbound guest replies: SES inbound receipt rule → SNS → here. Mirrors
// the SNS plumbing in sesSnsWebhook.js (signature verify + subscription confirm
// + trusted-host SSRF guard), then hands the raw MIME to the inbound pipeline.
//
// Recommended SES setup: a receipt rule on the inbound subdomain with an SNS
// action that INCLUDES the message content (covers normal short replies). If
// you instead store to S3, set INBOUND_EMAIL_S3_BUCKET and the handler fetches
// the object (requires @aws-sdk/client-s3).

import MessageValidator from "sns-validator";
import {
  WEBHOOK_SNS_VERIFY,
  INBOUND_EMAIL_DOMAIN,
  INBOUND_EMAIL_LOCAL,
  INBOUND_EMAIL_S3_BUCKET,
} from "../config.js";
import { parseRawEmail, extractToken } from "../inbound/parseInboundEmail.js";
import { processInboundEmail } from "../inbound/processInboundEmail.js";

const validator = new MessageValidator();

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
    validator.validate(message, (err, msg) => (err ? reject(err) : resolve(msg)));
  });
}

async function confirmSubscription(subscribeUrl) {
  if (!isTrustedSnsHost(subscribeUrl)) {
    console.error("[sesInbound] Refusing untrusted SubscribeURL host:", subscribeUrl);
    return;
  }
  try {
    const res = await fetch(subscribeUrl);
    console.log("[sesInbound] SubscriptionConfirmation status", res.status);
  } catch (err) {
    console.error("[sesInbound] Error confirming subscription", err?.message);
  }
}

// Fetch raw MIME from S3 when the receipt rule stored it there. Guarded: the
// S3 client is an optional dependency and the bucket is optional config.
async function fetchRawFromS3(bucket, key) {
  if (!bucket || !key) return null;
  try {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({});
    const out = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    return await out.Body.transformToString();
  } catch (err) {
    console.error(
      "[sesInbound] S3 fetch failed — install @aws-sdk/client-s3 and check INBOUND_EMAIL_S3_BUCKET/IAM",
      { bucket, key, error: err?.message },
    );
    return null;
  }
}

export async function handleSesInboundEvent({ body }) {
  if (!INBOUND_EMAIL_DOMAIN) {
    // Two-way email isn't configured; ack so SNS doesn't retry forever.
    return { ok: true, skipped: "inbound_disabled" };
  }
  if (!body || typeof body !== "object") {
    throw new Error("[sesInbound] Invalid body");
  }

  if (WEBHOOK_SNS_VERIFY) {
    try {
      await validateMessage(body);
    } catch (err) {
      console.error("[sesInbound] SNS signature validation failed:", err?.message);
      const error = new Error("Invalid SNS signature");
      error.statusCode = 403;
      throw error;
    }
  } else {
    console.warn("[sesInbound] WEBHOOK_SNS_VERIFY=false — accepting unsigned SNS (dev only)");
  }

  const type = body.Type;
  if (type === "SubscriptionConfirmation") {
    await confirmSubscription(body.SubscribeURL);
    return { ok: true, type };
  }
  if (type !== "Notification") {
    return { ok: true, type, ignored: true };
  }

  let notification;
  try {
    notification = JSON.parse(body.Message);
  } catch {
    throw new Error("[sesInbound] Invalid SES notification payload");
  }

  // Only inbound receipts carry a reply. Bounce/complaint/delivery go to the
  // other SES webhook.
  if (notification.notificationType && notification.notificationType !== "Received") {
    return { ok: true, ignored: notification.notificationType };
  }

  // Raw MIME: inline SNS content first, S3 fallback if configured.
  let rawMime = notification.content || null;
  if (!rawMime && INBOUND_EMAIL_S3_BUCKET) {
    const action = notification.receipt?.action || {};
    rawMime = await fetchRawFromS3(
      action.bucketName || INBOUND_EMAIL_S3_BUCKET,
      action.objectKey,
    );
  }
  if (!rawMime) {
    console.error(
      "[sesInbound] notification had no content — configure the SNS action to include content, or set INBOUND_EMAIL_S3_BUCKET",
    );
    return { ok: true, skipped: "no_content" };
  }

  const parsed = await parseRawEmail(rawMime);
  if (!parsed) return { ok: true, skipped: "unparseable" };

  // Candidate recipient addresses the token could live in.
  const recipients = [
    ...(notification.receipt?.recipients || []),
    ...(notification.mail?.destination || []),
    ...(parsed.toAddresses || []),
  ];
  const token = extractToken(recipients, {
    local: INBOUND_EMAIL_LOCAL,
    domain: INBOUND_EMAIL_DOMAIN,
  });
  const toAddress =
    recipients.find((r) => typeof r === "string" && r.includes("+")) ||
    recipients[0] ||
    null;

  const result = await processInboundEmail({ parsed, token, toAddress });
  return { ok: true, type, result: result.status };
}
