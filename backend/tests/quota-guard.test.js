import { startOfTodayUtc, nextSendWindowUtc } from "../src/email/outbox/quotaGuard.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

console.log("🧪 startOfTodayUtc returns midnight UTC of the same day");
{
  const now = new Date("2026-04-28T15:30:42.123Z");
  const out = startOfTodayUtc(now);
  assert(out.toISOString() === "2026-04-28T00:00:00.000Z", `got ${out.toISOString()}`);
}

console.log("🧪 startOfTodayUtc rolls to UTC even when local time is the next day");
{
  // 2026-04-28 23:30 in a +08 TZ would be 15:30 UTC the same day
  const out = startOfTodayUtc(new Date("2026-04-28T23:30:00+08:00"));
  assert(out.toISOString() === "2026-04-28T00:00:00.000Z", `got ${out.toISOString()}`);
}

console.log("🧪 nextSendWindowUtc returns next UTC midnight + 0..3600s jitter");
{
  const now = new Date("2026-04-28T15:30:42.123Z");
  const noJitter = nextSendWindowUtc(now, () => 0);
  assert(noJitter.toISOString() === "2026-04-29T00:00:00.000Z", `no jitter (got ${noJitter.toISOString()})`);

  const fullJitter = nextSendWindowUtc(now, () => 0.999);
  // 3600 seconds past midnight = 01:00:00 next day (jitterSeconds = floor(0.999 * 3600) = 3596)
  assert(
    fullJitter.toISOString() === "2026-04-29T00:59:56.000Z",
    `max jitter (got ${fullJitter.toISOString()})`,
  );

  const halfJitter = nextSendWindowUtc(now, () => 0.5);
  // 1800 seconds past midnight = 00:30:00
  assert(
    halfJitter.toISOString() === "2026-04-29T00:30:00.000Z",
    `mid jitter (got ${halfJitter.toISOString()})`,
  );
}

console.log("🧪 nextSendWindowUtc handles month boundary");
{
  const now = new Date("2026-04-30T22:00:00.000Z");
  const out = nextSendWindowUtc(now, () => 0);
  assert(out.toISOString() === "2026-05-01T00:00:00.000Z", `month boundary (got ${out.toISOString()})`);
}

console.log("🧪 nextSendWindowUtc handles year boundary");
{
  const now = new Date("2026-12-31T23:59:00.000Z");
  const out = nextSendWindowUtc(now, () => 0);
  assert(out.toISOString() === "2027-01-01T00:00:00.000Z", `year boundary (got ${out.toISOString()})`);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
