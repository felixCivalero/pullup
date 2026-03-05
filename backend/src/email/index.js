// backend/src/email/index.js

import {
  SES_FROM_EMAIL,
  EMAIL_WORKER_BATCH_SIZE,
} from "./config.js";
import { getActiveProvider } from "./providers/providerRouter.js";
import {
  insertOutboxRow,
} from "./repos/emailOutboxRepo.js";
import {
  isSuppressed,
} from "./repos/emailSuppressionsRepo.js";
import { processBatch as processOutboxBatchImpl } from "./outbox/outboxWorker.js";
import { handleSesSnsEvent } from "./webhooks/sesSnsWebhook.js";

/**
 * Public API: enqueue a generic transactional email.
 */
export async function sendEmail({
  from = SES_FROM_EMAIL,
  to,
  subject,
  html,
  text,
  idempotencyKey = null,
  sendAfter = null,
}) {
  return enqueueOutbox({
    fromEmail: from,
    toEmail: to,
    subject,
    htmlBody: html,
    textBody: text,
    campaignSendId: null,
    idempotencyKey,
    sendAfter,
  });
}

/**
 * Public API: enqueue directly into email_outbox.
 */
export async function enqueueOutbox({
  fromEmail = SES_FROM_EMAIL,
  toEmail,
  subject,
  htmlBody,
  textBody,
  campaignSendId = null,
  idempotencyKey = null,
  sendAfter = null,
  category = "transactional",
}) {
  if (!toEmail) {
    throw new Error("[email] enqueueOutbox: toEmail is required");
  }
  if (!subject) {
    throw new Error("[email] enqueueOutbox: subject is required");
  }

  const suppression = await isSuppressed(toEmail);
  if (suppression.suppressed) {
    // Insert a suppressed row for observability, but do not attempt to send.
    const providerName =
      category === "newsletter" ? "ses" : getActiveProvider().name;

    return insertOutboxRow({
      fromEmail,
      toEmail,
      subject,
      htmlBody,
      textBody,
      campaignSendId,
      idempotencyKey,
      provider: providerName,
      category,
    }).then((row) => row);
  }

  const providerName =
    category === "newsletter" ? "ses" : getActiveProvider().name;

  const row = await insertOutboxRow({
    fromEmail,
    toEmail,
    subject,
    htmlBody,
    textBody,
    campaignSendId,
    idempotencyKey,
    provider: providerName,
    category,
  });

  if (sendAfter) {
    // Simple update of send_after; we keep logic in one place (insertOutboxRow doesn't know about it).
    row.send_after = sendAfter;
  }

  return row;
}

/**
 * Public API: process a batch of outbox items.
 */
export function processOutboxBatch({
  workerId,
  batchSize = EMAIL_WORKER_BATCH_SIZE,
} = {}) {
  return processOutboxBatchImpl({ workerId, batchSize });
}

/**
 * Public API: handle provider webhook events.
 */
export async function handleProviderEvent({ provider, rawHeaders, rawBody }) {
  if (provider === "ses") {
    return handleSesSnsEvent({
      headers: rawHeaders,
      body: rawBody,
    });
  }

  console.warn(
    `[email] handleProviderEvent: unsupported provider "${provider}", ignoring`,
  );
  return { ok: true, provider };
}

