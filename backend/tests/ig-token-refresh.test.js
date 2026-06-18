// Unit tests for the PURE Instagram token-refresh due-check. No clock, no DB —
// we feed `now` and the expiry explicitly so the window math is pinned.

import { isTokenRefreshDue, REFRESH_WITHIN_DAYS } from "../src/instagram/tokenRefresh.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const NOW = new Date("2026-06-18T00:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const inDays = (d) => new Date(NOW + d * DAY).toISOString();

console.log("🧪 isTokenRefreshDue: fresh 60-day token is not due");
assert(isTokenRefreshDue(inDays(60), { now: NOW }) === false, "60 days out → not due");
assert(isTokenRefreshDue(inDays(11), { now: NOW }) === false, "11 days out → not due (outside window)");

console.log("🧪 isTokenRefreshDue: within the window is due");
assert(isTokenRefreshDue(inDays(10), { now: NOW }) === true, "exactly 10 days out → due");
assert(isTokenRefreshDue(inDays(3), { now: NOW }) === true, "3 days out → due");
assert(isTokenRefreshDue(inDays(0.5), { now: NOW }) === true, "12h out → due");

console.log("🧪 isTokenRefreshDue: already-expired tokens are NOT refreshed (need reconnect)");
assert(isTokenRefreshDue(inDays(-1), { now: NOW }) === false, "expired yesterday → not due");
assert(isTokenRefreshDue(inDays(0), { now: NOW }) === false, "expiring exactly now → not due");

console.log("🧪 isTokenRefreshDue: missing / malformed expiry is not due");
assert(isTokenRefreshDue(null, { now: NOW }) === false, "null expiry → not due");
assert(isTokenRefreshDue(undefined, { now: NOW }) === false, "undefined expiry → not due");
assert(isTokenRefreshDue("not-a-date", { now: NOW }) === false, "garbage expiry → not due");

console.log("🧪 isTokenRefreshDue: window is configurable");
assert(isTokenRefreshDue(inDays(20), { now: NOW, withinDays: 30 }) === true, "20 days out, 30-day window → due");
assert(REFRESH_WITHIN_DAYS === 10, `default window is 10 days (got ${REFRESH_WITHIN_DAYS})`);

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll ig-token-refresh assertions passed");
