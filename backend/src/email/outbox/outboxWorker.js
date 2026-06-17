// backend/src/email/outbox/outboxWorker.js

import {
  EMAIL_SEND_RATE_PER_SEC,
  EMAIL_MAX_RETRIES,
  EMAIL_WORKER_BATCH_SIZE,
  EMAIL_DAILY_LIMIT,
  INBOUND_EMAIL_DOMAIN,
  INBOUND_EMAIL_LOCAL,
} from "../config.js";
import { getActiveProvider } from "../providers/providerRouter.js";
import { sendEmailViaSes } from "../providers/sesProvider.js";
import { sendEmailViaResend } from "../providers/resendProvider.js";
import {
  claimOutboxBatch,
  markSent,
  markDelivered,
  markBounced,
  markComplaint,
  markFailed,
  markSuppressed,
  markRetrying,
  countSentSinceUtc,
} from "../repos/emailOutboxRepo.js";
import { isSuppressed } from "../repos/emailSuppressionsRepo.js";
import { getRetryDelaySeconds } from "./retryPolicy.js";
import { throttle } from "./rateLimiter.js";
import { insertEvent } from "../repos/emailEventsRepo.js";
import { startOfTodayUtc, nextSendWindowUtc } from "./quotaGuard.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Public base the tracking pixel / click-redirect resolve against. Mirrors the
// VIP-invite path in index.js: prod routes through nginx /api/ to the backend.
function trackingBaseUrl() {
  if (process.env.NODE_ENV !== "production") return "http://localhost:3001";
  return `${process.env.FRONTEND_URL || "https://pullup.se"}/api`;
}

// Two-way email: address a guest's reply can route back on. Only set when the
// row carries host context (so an inbound reply can resolve to a real thread)
// and an inbound domain is configured — otherwise email stays one-way and a
// reply bounces, exactly as before. Token = the row's per-send tracking_id.
function replyToFor(row) {
  if (!INBOUND_EMAIL_DOMAIN) return null;
  if (!row.host_profile_id || !row.tracking_id) return null;
  return `${INBOUND_EMAIL_LOCAL}+${row.tracking_id}@${INBOUND_EMAIL_DOMAIN}`;
}

// Inject open-pixel + click-redirect tracking into a row's HTML at send time,
// for EVERY email (previously only the VIP invite path did this, so opens/
// clicks were invisible for confirmations, reminders, waitlist + room mail).
// Guarded: the VIP path pre-injects and persists tracked HTML, so we skip any
// body that already carries the open pixel to avoid double-wrapping links.
// Never throws — a tracking failure must not block the actual send.
async function withTracking(row) {
  const html = row.html_body;
  if (!html || !row.tracking_id) return html;
  if (html.includes("/t/o/")) return html; // already tracked (e.g. VIP)
  try {
    const { addTracking } = await import("../tracking/linkRewriter.js");
    return addTracking(html, {
      trackingId: row.tracking_id,
      baseUrl: trackingBaseUrl(),
      campaignTag: row.campaign_tag || null,
    });
  } catch (err) {
    console.error("[outboxWorker] tracking injection failed", {
      id: row.id,
      error: err?.message,
    });
    return html;
  }
}

// Optional mailto target for List-Unsubscribe (RFC 2369). Only listed when the
// mailbox actually exists/receives — leave unset to ship https one-click only.
const UNSUBSCRIBE_MAILTO = process.env.UNSUBSCRIBE_MAILTO || null;

// Build RFC 8058 one-click List-Unsubscribe headers from a send's HTML. We key
// off the visible /u/<token> footer link, so ONLY mail that already offers an
// unsubscribe (reminders, invites, anything marketing-ish) gets the header —
// pure 1:1 transactional mail (magic links, RSVP confirmations) has no footer
// link and correctly gets no header. The one-click POST must hit the backend
// route directly (no browser/JS), so we resolve the token against the API base
// (https://pullup.se/api/u/<token>), not the human-facing frontend page.
// Mailbox providers (Gmail/Yahoo) require this header on bulk mail in 2024+.
function unsubscribeHeadersFor(html) {
  if (!html) return null;
  const match = html.match(/\/u\/([A-Za-z0-9_-]{20,})/);
  if (!match) return null;
  const oneClickUrl = `${trackingBaseUrl()}/u/${match[1]}`;
  const listValue = UNSUBSCRIBE_MAILTO
    ? `<mailto:${UNSUBSCRIBE_MAILTO}?subject=unsubscribe>, <${oneClickUrl}>`
    : `<${oneClickUrl}>`;
  return {
    "List-Unsubscribe": listValue,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
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
  const activeProvider = getActiveProvider();

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
      deferred: 0,
    };
  }

  let sent = 0;
  let failed = 0;
  let suppressed = 0;
  let retrying = 0;
  let deferred = 0;

  // Daily quota guard. If EMAIL_DAILY_LIMIT > 0 we read today's sent
  // count once at the start of the batch (cheap; small numbers on free
  // tier). Each successful send increments the local counter so we
  // don't requery per row. A row hitting the limit is parked until the
  // next UTC midnight + jitter — NOT counted as a failed attempt, so
  // EMAIL_MAX_RETRIES stays for real delivery problems.
  let sentTodayCount = 0;
  if (EMAIL_DAILY_LIMIT > 0) {
    sentTodayCount = await countSentSinceUtc(startOfTodayUtc().toISOString());
  }

  for (const row of claimed) {
    const category = row.category || "transactional";

    let providerName = activeProvider?.name || null;
    let sendEmailFn = activeProvider?.sendEmail;

    try {
      const suppression = await isSuppressed(row.to_email);
      if (suppression.suppressed) {
        await markSuppressed(row.id);
        suppressed += 1;
        continue;
      }

      // Daily-quota check — defer to tomorrow without burning an attempt.
      if (EMAIL_DAILY_LIMIT > 0 && sentTodayCount >= EMAIL_DAILY_LIMIT) {
        const sendAfter = nextSendWindowUtc();
        await markRetrying(row.id, {
          attempts: row.attempts || 0,
          sendAfter,
          errorCode: "DAILY_QUOTA_REACHED",
          errorMessage: `Daily limit (${EMAIL_DAILY_LIMIT}) reached; deferred to ${sendAfter.toISOString()}`,
        });
        deferred += 1;
        continue;
      }

      await throttle(EMAIL_SEND_RATE_PER_SEC);

      if (category === "newsletter") {
        providerName = "ses";
        sendEmailFn = sendEmailViaSes;
      } else if (providerName === "resend") {
        sendEmailFn = sendEmailViaResend;
      }

      const htmlToSend = await withTracking(row);
      const replyTo = replyToFor(row);
      const headers = unsubscribeHeadersFor(htmlToSend);

      const result = await sendEmailFn({
        from: row.from_email,
        to: row.to_email,
        subject: row.subject,
        html: htmlToSend,
        text: row.text_body,
        replyTo,
        headers,
        tags: {
          outbox_id: row.id,
          email_type: row.campaign_send_id ? "campaign" : "transactional",
          provider: providerName || row.provider,
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
      sentTodayCount += 1;
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
    deferred,
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

