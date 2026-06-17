// Storage-markup billing (Phase A) — pure logic: plan→tier-cents mapping, the
// 30% markup math, and the monthly dedupe-key bucket. No DB.

import assert from "node:assert";
import { planToTierCents } from "../src/services/billing/storageTiers.js";
import { computeStorageServiceFee } from "../src/services/billing/feeEngine.js";
import { currentMonthKey } from "../src/jobs/storageBillingRun.js";

console.log("🧪 planToTierCents: known plans, decorated ids, unknown → 0");
assert.equal(planToTierCents("free"), 0, "free");
assert.equal(planToTierCents("pro"), 2500, "pro");
assert.equal(planToTierCents("team"), 59900, "team");
assert.equal(planToTierCents("TIER_PRO"), 2500, "decorated pro id");
assert.equal(planToTierCents("pro_2024"), 2500, "suffixed pro id");
assert.equal(planToTierCents(null), 0, "null → 0");
assert.equal(planToTierCents("mystery_plan"), 0, "unknown → 0 (never over-charge)");
console.log("✅ tier mapping ok");

console.log("🧪 computeStorageServiceFee: 30% of the tier base");
assert.equal(computeStorageServiceFee(2500, 3000), 750, "$25 → $7.50");
assert.equal(computeStorageServiceFee(59900, 3000), 17970, "$599 → $179.70");
assert.equal(computeStorageServiceFee(0, 3000), 0, "free tier → 0");
assert.equal(computeStorageServiceFee(2500, undefined), 750, "default 3000 bps");
console.log("✅ markup math ok");

console.log("🧪 currentMonthKey: UTC YYYY-MM dedupe bucket");
assert.match(currentMonthKey(new Date("2026-06-17T12:00:00Z")), /^2026-06$/, "month key");
assert.notEqual(
  currentMonthKey(new Date("2026-06-30T23:00:00Z")),
  currentMonthKey(new Date("2026-07-01T01:00:00Z")),
  "rolls at month boundary",
);
console.log("✅ month-key ok");

console.log("\nAll storage-billing tests passed");
