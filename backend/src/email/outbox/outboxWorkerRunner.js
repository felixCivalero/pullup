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
const IDLE_DELAY_MS = 1000;
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
  for (;;) {
    try {
      const summary = await processBatch({});
      consecutiveErrors = 0;
      if (summary?.processed === 0) {
        await sleep(IDLE_DELAY_MS);
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
