// The paywall decision table: free to be a guest, paid to be a host.
// computeEntitlement is pure — every branch of the tier/status matrix here.
import { computeEntitlement } from "../src/services/billing/entitlements.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const plan = (p, s) => ({ plan: p, subscriptionStatus: s });

console.log("🧪 deployment not configured → hosting open for everyone");
{
  assert(computeEntitlement(plan("creator", "none"), false).canHost === true, "unconfigured: unsubscribed host may host");
  assert(computeEntitlement(null, false).canHost === true, "unconfigured: even a missing plan hosts");
  assert(computeEntitlement(plan("creator", "canceled"), false).reason === "open", "unconfigured reason is 'open'");
}

console.log("🧪 founding hosts ('early') host free forever, whatever Stripe says");
{
  assert(computeEntitlement(plan("early", "none"), true).canHost === true, "early + never subscribed → hosts");
  assert(computeEntitlement(plan("early", "canceled"), true).canHost === true, "early + canceled sub → still hosts");
  assert(computeEntitlement(plan("early", "none"), true).reason === "early", "early reason surfaces for the badge");
}

console.log("🧪 an early member may upgrade to paying — the gift survives");
{
  const founding = (p, s) => ({ plan: p, subscriptionStatus: s, founding: true });
  assert(computeEntitlement(founding("creator", "active"), true).reason === "subscribed", "founder paying → labeled subscribed");
  assert(computeEntitlement(founding("agency", "active"), true).canHost === true, "founder on agency hosts");
  assert(computeEntitlement(founding("creator", "canceled"), true).canHost === true, "founder cancels the upgrade → still hosts");
  assert(computeEntitlement(founding("creator", "canceled"), true).reason === "early", "…and is early again");
  assert(computeEntitlement(founding("early", "none"), true).canHost === true, "plain founder unchanged");
}

console.log("🧪 creator tier follows the subscription");
{
  assert(computeEntitlement(plan("creator", "active"), true).canHost === true, "active → hosts");
  assert(computeEntitlement(plan("creator", "past_due"), true).canHost === true, "past_due → grace, still hosts");
  assert(computeEntitlement(plan("creator", "past_due"), true).reason === "grace", "grace is named so the banner can show");
  assert(computeEntitlement(plan("creator", "none"), true).canHost === false, "never subscribed → paywall");
  assert(computeEntitlement(plan("creator", "canceled"), true).canHost === false, "canceled (period ended) → paywall");
  assert(computeEntitlement(plan("creator", "none"), true).reason === "subscription_required", "refusal is typed");
  assert(computeEntitlement(null, true).canHost === false, "no plan row at all → paywall (the new-host default)");
}

console.log("🧪 agency + future tiers slot in without a rewrite");
{
  // any paid tier behaves like creator: the subscription decides
  assert(computeEntitlement(plan("agency", "active"), true).canHost === true, "agency + active hosts");
  assert(computeEntitlement(plan("agency", "past_due"), true).reason === "grace", "agency gets the same grace");
  assert(computeEntitlement(plan("agency", "none"), true).canHost === false, "agency unsubscribed paywalls");
  assert(computeEntitlement(plan("organisation", "active"), true).canHost === true, "unknown future tier + active hosts");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll entitlements tests passed");
