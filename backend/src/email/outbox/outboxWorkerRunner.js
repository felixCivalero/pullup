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
    if (summary?.processed === 0) await sleep(1000);
  }
}

runLoop().catch((err) => {
  console.error("[outboxWorkerRunner] Fatal error", err);
  process.exit(1);
});
