// backend/src/email/outbox/outboxWorker.js

import {
  EMAIL_SEND_RATE_PER_SEC,
  EMAIL_MAX_RETRIES,
  EMAIL_WORKER_BATCH_SIZE,
} from "../config.js";
import { getActiveProvider } from "../providers/providerRouter.js";
import {
  claimOutboxBatch,
  markSent,
  markDelivered,
  markBounced,
  markComplaint,
  markFailed,
  markSuppressed,
  markRetrying,
} from "../repos/emailOutboxRepo.js";
import { isSuppressed } from "../repos/emailSuppressionsRepo.js";
import { getRetryDelaySeconds } from "./retryPolicy.js";
import { throttle } from "./rateLimiter.js";
import { insertEvent } from "../repos/emailEventsRepo.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientError(error) {
  const status =
    error?.$metadata?.httpStatusCode || error?.statusCode || error?.status;

  if (status && typeof status === "number") {
    if (status >= 500) return true;
    if (status === 429) return true;
  }

  const code = String(error?.code || error?.name || "").toLowerCase();
  if (
    code.includes("throttle") ||
    code.includes("timeout") ||
    code.includes("temporar")
  ) {
    return true;
  }

  return false;
}

export async function processBatch({
  workerId = `worker-${process.pid}`,
  batchSize = EMAIL_WORKER_BATCH_SIZE,
} = {}) {
  const provider = getActiveProvider();
  const providerName = provider?.name || null;

  const claimed = await claimOutboxBatch({
    workerId,
    batchSize,
    now: new Date(),
  });

  if (!claimed.length) {
    return {
      processed: 0,
      sent: 0,
      failed: 0,
      suppressed: 0,
      retrying: 0,
    };
  }

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let retrying = 0;

  for (const row of claimed) {
    try {
      const suppression = await isSuppressed(row.to_email);
      if (suppression.suppressed) {
        await markSuppressed(row.id);
        suppressed += 1;
        continue;
      }

      await throttle(EMAIL_SEND_RATE_PER_SEC);

      const result = await provider.sendEmail({
        from: row.from_email,
        to: row.to_email,
        subject: row.subject,
        html: row.html_body,
        text: row.text_body,
        tags: {
          outbox_id: row.id,
          email_type: row.campaign_send_id ? "campaign" : "transactional",
          provider: row.provider,
        },
      });

      if (providerName === "resend") {
        if (result?.messageId) {
          await markDelivered(row.id);
        }

        try {
          await insertEvent({
            provider: "resend",
            providerMessageId: result?.messageId || null,
            eventType: "delivery",
            emailOutboxId: row.id,
            recipient: row.to_email,
            payload: {
              provider: "resend",
              messageId: result?.messageId || null,
              raw: result?.raw ?? result ?? null,
            },
          });
        } catch (eventError) {
          console.error(
            "[outboxWorker] Failed to insert Resend delivery event",
            {
              outboxId: row.id,
              error: eventError?.message,
            },
          );
        }
      }

      await markSent(row.id, {
        providerMessageId: result.messageId,
      });
      sent += 1;
    } catch (error) {
      console.error(
        "[outboxWorker] Error sending email for row",
        { id: row.id, to: row.to_email },
        error,
      );

      const attempts = (row.attempts || 0) + 1;

      if (!isTransientError(error) || attempts >= EMAIL_MAX_RETRIES) {
        await markFailed(row.id, {
          errorCode: error?.code || error?.name || null,
          errorMessage: error?.message || "Permanent failure",
        });
        if (providerName === "resend") {
          try {
            await insertEvent({
              provider: "resend",
              providerMessageId: null,
              eventType: "failed",
              emailOutboxId: row.id,
              recipient: row.to_email,
              payload: {
                errorCode: error?.code || error?.name || null,
                errorMessage:
                  error?.message || "Permanent failure while sending",
              },
            });
          } catch (eventError) {
            console.error(
              "[outboxWorker] Failed to insert Resend failure event",
              {
                outboxId: row.id,
                error: eventError?.message,
              },
            );
          }
        }
        failed += 1;
        continue;
      }

      const delaySeconds = getRetryDelaySeconds({ attempt: attempts });
      const sendAfter = new Date(Date.now() + delaySeconds * 1000).toISOString();

      await markRetrying(row.id, {
        attempts,
        sendAfter,
        errorCode: error?.code || error?.name || null,
        errorMessage: error?.message || "Transient failure, will retry",
      });
      retrying += 1;
    }
  }

  return {
    processed: claimed.length,
    sent,
    failed,
    suppressed,
    retrying,
  };
}

async function runLoop() {
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.split("=")[1] : "loop";

  if (mode === "once") {
    const summary = await processBatch({});
    console.log("[outboxWorker] Single batch processed", summary);
    return;
  }

  console.log("[outboxWorker] Starting continuous loop");
  for (;;) {
    const summary = await processBatch({});
    if (summary.processed === 0) {
      await sleep(1000);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLoop().catch((err) => {
    console.error("[outboxWorker] Fatal error", err);
    process.exit(1);
  });
}

