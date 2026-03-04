import { processBatch } from "./outboxWorker.js";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

runLoop().catch((err) => {
  console.error("[outboxWorker] Fatal error", err);
  process.exit(1);
});
