import { hasEventEnded, deriveEventListingStatus, sameInstant } from "../src/lib/eventLifecycle.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const NOW = new Date("2026-07-02T12:00:00Z").getTime();
const PAST = "2026-05-28T16:00:00Z";
const PAST_END = "2026-05-28T18:00:00Z";
const FUTURE = "2026-08-01T16:00:00Z";
const FUTURE_END = "2026-08-01T18:00:00Z";

console.log("🧪 hasEventEnded — ends_at is the clock when set");
assert(hasEventEnded(PAST, PAST_END, NOW) === true, "past start + past end → ended");
assert(hasEventEnded(PAST, FUTURE_END, NOW) === false, "started but end in future → NOT ended (ongoing)");
assert(hasEventEnded(FUTURE, FUTURE_END, NOW) === false, "future event → not ended");

console.log("🧪 hasEventEnded — falls back to starts_at with no end");
assert(hasEventEnded(PAST, null, NOW) === true, "past start, no end → ended");
assert(hasEventEnded(FUTURE, null, NOW) === false, "future start, no end → not ended");

console.log("🧪 hasEventEnded — missing/garbage dates never end");
assert(hasEventEnded(null, null, NOW) === false, "no dates → not ended (forever-upcoming)");
assert(hasEventEnded("not-a-date", null, NOW) === false, "garbage date → not ended");

console.log("🧪 deriveEventListingStatus — draft | live | past");
assert(deriveEventListingStatus("DRAFT", PAST, PAST_END, NOW) === "draft", "DRAFT stays draft even when dated past");
assert(deriveEventListingStatus("PUBLISHED", PAST, PAST_END, NOW) === "past", "published + ended → past");
assert(deriveEventListingStatus("PUBLISHED", FUTURE, null, NOW) === "live", "published + upcoming → live");
assert(deriveEventListingStatus("PUBLISHED", PAST, FUTURE_END, NOW) === "live", "published + ongoing → live (was 'past' under the old start-based rule)");
assert(deriveEventListingStatus(null, FUTURE, null, NOW) === "draft", "missing status → draft");
assert(deriveEventListingStatus("published", PAST, PAST_END, NOW) === "past", "status is case-insensitive");

console.log("🧪 sameInstant — format-proof date-change detection");
assert(sameInstant("2026-05-28T16:00:00+00:00", "2026-05-28T16:00:00.000Z") === true, "same instant, different ISO formats → equal");
assert(sameInstant(PAST, PAST_END) === false, "different instants → not equal");
assert(sameInstant(null, PAST) === false, "missing side → treated as changed");
assert(sameInstant("garbage", "garbage") === false, "unparseable → treated as changed");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nAll event-lifecycle tests passed");
