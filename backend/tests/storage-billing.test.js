// Storage-markup billing (Phase A) — pure logic: usage→cost rate card, the
// Prometheus metric parser, the 30% markup math, and the monthly dedupe bucket.
// No DB / no network.

import assert from "node:assert";
import { usageToCostCents } from "../src/services/billing/storageTiers.js";
import { sumPromMetric } from "../src/services/byo/projectUsage.js";
import { computeStorageServiceFee } from "../src/services/billing/feeEngine.js";
import { currentMonthKey } from "../src/jobs/storageBillingRun.js";

const GB = 1024 ** 3;

console.log("🧪 usageToCostCents: continuous, $0.15/GB, never negative");
assert.equal(usageToCostCents({ storedBytes: 0 }), 0, "zero usage → 0");
assert.equal(usageToCostCents({ storedBytes: GB }), 15, "1GB → 15¢");
assert.equal(usageToCostCents({ storedBytes: 10 * GB }), 150, "10GB → $1.50");
assert.equal(usageToCostCents({ storedBytes: 2 * GB, egressBytes: 0 }), 30, "2GB → 30¢");
assert.equal(usageToCostCents({}), 0, "empty → 0");
assert.equal(usageToCostCents({ storedBytes: GB, egressBytes: GB }), 30, "stored + egress both priced");
console.log("✅ rate card ok");

console.log("🧪 sumPromMetric: sums matching samples, null when absent");
const txt = [
  "# HELP pg_database_size_bytes size",
  'pg_database_size_bytes{datname="postgres"} 1073741824',
  'pg_database_size_bytes{datname="other"} 1073741824',
  "unrelated_metric 5",
].join("\n");
assert.equal(sumPromMetric(txt, ["pg_database_size_bytes"]), 2 * GB, "sums both samples");
assert.equal(sumPromMetric(txt, ["missing_metric"]), null, "absent metric → null");
assert.equal(sumPromMetric("", ["x"]), null, "empty text → null");
console.log("✅ prom parser ok");

console.log("🧪 computeStorageServiceFee: 30% of the cost basis");
assert.equal(computeStorageServiceFee(150, 3000), 45, "$1.50 → 45¢");
assert.equal(computeStorageServiceFee(0, 3000), 0, "0 → 0");
assert.equal(computeStorageServiceFee(15, undefined), 5, "default 3000 bps, rounds 4.5→5");
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
