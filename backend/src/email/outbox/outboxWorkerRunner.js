// backend/src/email/outbox/outboxWorkerRunner.js
//
// Thin wrapper around the outbox worker that can be used as a stable
// entrypoint for process managers like PM2. All provider selection
// (SES vs Resend) is handled inside `outboxWorker.processBatch` via
// the shared providerRouter + config.

import { processBatch } from "./outboxWorker.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop() {
  const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
  const mode = modeArg ? modeArg.split("=")[1] : "loop";

  if (mode === "once") {
    const summary = await processBatch({});
    console.log("[outboxWorkerRunner] Single batch processed", summary);
    return;
  }

  console.log("[outboxWorkerRunner] Starting continuous loop");
  for (;;) {
    const summary = await processBatch({});
    if (summary.processed === 0) {
      await sleep(1000);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLoop().catch((err) => {
    console.error("[outboxWorkerRunner] Fatal error", err);
    process.exit(1);
  });
}

