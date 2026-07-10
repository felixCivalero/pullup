import { processBatch } from "./outboxWorker.js";
import { initObservability } from "../../observability.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Idle backoff: how long to wait when there's no work or a transient
// error happens. Doubles up to a cap so a Supabase/Cloudflare outage
// doesn't pin the CPU retrying — but the loop never exits. The audit
// found the worker had restarted 323 times in 79 days because the
// previous code did `process.exit(1)` on any throw (typically
// Cloudflare 502s from Supabase during claimOutboxBatch /
// countSentSinceUtc). PM2 would restart, hit the same blip, exit
// again. Now: log + backoff + keep running.
// Idle polling: start fast (1s) so a freshly-enqueued email goes out promptly,
// but back OFF while there's nothing to send — the worker is idle ~99% of the
// time (a few dozen sends/day), so a flat 1s poll was ~1 claim_email_outbox_batch
// call/second forever (millions of empty polls = a real chunk of DB load). The
// delay doubles up to IDLE_MAX while empty and RESETS to IDLE_MIN the instant a
// batch has work, so a send burst still drains fast — only the first mail after
// a quiet spell waits up to IDLE_MAX.
const IDLE_MIN_DELAY_MS = 1000;
const IDLE_MAX_DELAY_MS = Number(process.env.EMAIL_WORKER_IDLE_MAX_MS ?? 10_000);
const ERROR_BASE_DELAY_MS = 2000;
const ERROR_MAX_DELAY_MS = 60_000;

async function runLoop() {
  // The worker is its OWN process — wire its error sink up separately from the
  // API, else a crash in here would be invisible (the exact dark-failure mode).
  await initObservability({ serviceName: "pullup-email-worker" });

  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.split("=")[1] : "loop";

  if (mode === "once") {
    const summary = await processBatch({});
    console.log("[outboxWorkerRunner] Single batch processed", summary);
    return;
  }

  console.log("[outboxWorkerRunner] Starting continuous loop");
  let consecutiveErrors = 0;
  let idleDelay = IDLE_MIN_DELAY_MS;
  for (;;) {
    try {
      const summary = await processBatch({});
      consecutiveErrors = 0;
      if (summary?.processed === 0) {
        await sleep(idleDelay);
        idleDelay = Math.min(idleDelay * 2, IDLE_MAX_DELAY_MS); // back off while idle
      } else {
        idleDelay = IDLE_MIN_DELAY_MS; // work found → poll fast to drain the burst
      }
    } catch (err) {
      consecutiveErrors += 1;
      const delay = Math.min(
        ERROR_BASE_DELAY_MS * 2 ** Math.min(consecutiveErrors - 1, 5),
        ERROR_MAX_DELAY_MS,
      );
      console.error(
        `[outboxWorkerRunner] processBatch failed (attempt #${consecutiveErrors}, backoff ${delay}ms):`,
        err?.message || err,
      );
      await sleep(delay);
    }
  }
}

// Top-level safety net. The loop above never throws (everything inside
// the for(;;) is in try/catch), so reaching this handler means
// something during startup (e.g. a missing required env) failed — that
// is genuinely fatal and PM2 should restart.
runLoop().catch((err) => {
  console.error("[outboxWorkerRunner] Fatal startup error", err);
  process.exit(1);
});
