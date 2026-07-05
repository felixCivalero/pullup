// Pure-math tests for the fee engine: ticket bps (3% flat) and the DPCS party
// math shared with checkout. Storage is never billed — there is no storage fee
// function to test, by design.
import {
  computeTicketFee,
  computePartySize,
  computeTicketAmounts,
} from "../src/services/billing/feeEngine.js";
import { DEFAULT_PLAN } from "../src/repos/billing.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

console.log("🧪 ticket fee = bps of gross, rounded (3% flat)");
{
  // 3% of 10000 = 300
  assert(computeTicketFee(10000, DEFAULT_PLAN) === 300, "3% of 100.00 is 3.00");
  // rounding: 3% of 333 = 9.99 → 10
  assert(computeTicketFee(333, DEFAULT_PLAN) === 10, "fee rounds to nearest cent");
  assert(computeTicketFee(0, DEFAULT_PLAN) === 0, "zero amount → zero fee");
  assert(computeTicketFee(-500, DEFAULT_PLAN) === 0, "negative amount → zero fee");
  assert(computeTicketFee(10000, { ticketFeeBps: 0 }) === 0, "0 bps concierge plan → zero fee");
  // no plan at all falls back to the same 3% — displayed and charged agree
  assert(computeTicketFee(10000, null) === 300, "missing plan defaults to 3%");
}

console.log("🧪 the plan's only revenue knobs are subscription + ticket fee");
{
  assert(DEFAULT_PLAN.ticketFeeBps === 300, "default ticket fee is 300 bps (3%)");
  assert(!("markupBps" in DEFAULT_PLAN), "storage markup is gone from the plan");
  assert(!("storageTierCents" in DEFAULT_PLAN), "storage tier is gone from the plan");
  assert(DEFAULT_PLAN.subscriptionStatus === "none", "default plan starts unsubscribed");
  assert(DEFAULT_PLAN.plan === "creator", "default plan is the creator tier");
}

console.log("🧪 DPCS party math matches the legacy Stripe path");
{
  assert(computePartySize({}) === 1, "bare RSVP = 1");
  assert(computePartySize({ plusOnes: 2 }) === 3, "booker + 2 friends = 3");
  assert(
    computePartySize({ wantsDinner: true, dinnerPartySize: 4, plusOnes: 1 }) === 5,
    "dinner 4 (incl booker) + 1 cocktail = 5"
  );
  assert(
    computePartySize({ wantsDinner: true, dinnerPartySize: null, plusOnes: 2 }) === 3,
    "dinner toggled but no party size → falls back to 1 + plusOnes"
  );
}

console.log("🧪 full booking pricing: guest pays ticket + fee, host receives ticket");
{
  const event = { ticketPrice: 15000, ticketCurrency: "SEK" }; // 150 kr in öre
  const rsvp = { plusOnes: 1 }; // 2 people
  const a = computeTicketAmounts({ event, rsvp, plan: DEFAULT_PLAN });
  assert(a.partySize === 2, "party of 2");
  assert(a.ticketAmount === 30000, "gross = 300 kr");
  assert(a.feeAmount === 900, "fee = 9 kr (3%)");
  assert(a.totalAmount === 30900, "guest pays 309 kr");
  assert(a.currency === "sek", "currency normalized lowercase");
}

console.log("🧪 invalid ticket price throws (money-hole guard)");
{
  let threw = false;
  try {
    computeTicketAmounts({ event: { ticketPrice: 0 }, rsvp: {}, plan: DEFAULT_PLAN });
  } catch { threw = true; }
  assert(threw, "zero-price paid event refuses to price");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll fee-engine tests passed");
