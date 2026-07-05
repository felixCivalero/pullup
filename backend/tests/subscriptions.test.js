// Pure parts of the Creator-tier subscription service: the Stripe→ours status
// map, checkout return-path hygiene (open-redirect guard), and query splicing
// around #fragments (the router loses params placed after the hash).
import { mapStripeStatus, sanitizeReturnPath, appendQuery } from "../src/services/billing/subscriptions.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

console.log("🧪 Stripe status → subscription_status");
{
  assert(mapStripeStatus("active") === "active", "active → active");
  assert(mapStripeStatus("trialing") === "active", "trialing hosts (if a trial is ever added)");
  assert(mapStripeStatus("past_due") === "past_due", "past_due → grace");
  assert(mapStripeStatus("incomplete") === "none", "incomplete checkout never subscribed");
  assert(mapStripeStatus("canceled") === "canceled", "canceled → canceled");
  assert(mapStripeStatus("unpaid") === "canceled", "unpaid (retries exhausted) → canceled");
  assert(mapStripeStatus("incomplete_expired") === "canceled", "expired incomplete → canceled");
  assert(mapStripeStatus("paused") === "canceled", "paused → not hosting");
}

console.log("🧪 return paths stay inside the app");
{
  assert(sanitizeReturnPath("/create?draft=9#publish") === "/create?draft=9#publish", "app path passes through");
  assert(sanitizeReturnPath("https://evil.example") === "/settings#billing", "absolute URL → default");
  assert(sanitizeReturnPath("//evil.example") === "/settings#billing", "protocol-relative → default");
  assert(sanitizeReturnPath(undefined) === "/settings#billing", "missing → default");
  assert(sanitizeReturnPath("") === "/settings#billing", "empty → default");
}

console.log("🧪 query params splice BEFORE the #fragment");
{
  assert(
    appendQuery("/settings#billing", { subscribed: "1" }) === "/settings?subscribed=1#billing",
    "param lands before the hash",
  );
  assert(
    appendQuery("/create?draft=9", { subscribed: "1", session_id: "{CHECKOUT_SESSION_ID}" }) ===
      "/create?draft=9&subscribed=1&session_id={CHECKOUT_SESSION_ID}",
    "existing query appends with & and the Stripe template survives unencoded",
  );
  assert(appendQuery("/settings", { subscribed: "0" }) === "/settings?subscribed=0", "bare path gets ?");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll subscriptions tests passed");
