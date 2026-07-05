// Pure parts of the subscription service: the Stripe→ours status map, checkout
// return-path hygiene (open-redirect guard), query splicing around #fragments
// (the router loses params placed after the hash), and the tier↔price mapping
// that keeps creator (125) and agency (450) on one set of rails.
import { mapStripeStatus, sanitizeReturnPath, appendQuery } from "../src/services/billing/subscriptions.js";
import { TIERS, tierForPlan, priceIdForTier, planFromPriceId } from "../src/config/subscriptions.js";

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

console.log("🧪 tiers: creator 125, agency 450, one set of rails");
{
  assert(TIERS.creator.priceSek === 125, "creator tier is 125 SEK");
  assert(TIERS.agency.priceSek === 450, "agency tier is 450 SEK");
  assert(tierForPlan("agency").priceSek === 450, "agency plan → agency tier");
  assert(tierForPlan("creator").priceSek === 125, "creator plan → creator tier");
  assert(tierForPlan("early").priceSek === 125, "early is creator-shaped (free anyway)");
  assert(tierForPlan("something_future").priceSek === 125, "unknown plan falls back to creator");

  process.env.STRIPE_CREATOR_PRICE_ID = "price_creator_test";
  process.env.STRIPE_AGENCY_PRICE_ID = "price_agency_test";
  assert(priceIdForTier("creator") === "price_creator_test", "creator tier → creator price id");
  assert(priceIdForTier("agency") === "price_agency_test", "agency tier → agency price id");
  assert(planFromPriceId("price_agency_test") === "agency", "agency price on the webhook → plan 'agency'");
  assert(planFromPriceId("price_creator_test") === "creator", "creator price on the webhook → plan 'creator'");
  assert(planFromPriceId("price_unknown") === null, "unknown price stamps nothing");
  delete process.env.STRIPE_AGENCY_PRICE_ID;
  assert(priceIdForTier("agency") === null, "agency unconfigured → no price id (checkout answers 503)");
  delete process.env.STRIPE_CREATOR_PRICE_ID;
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll subscriptions tests passed");
