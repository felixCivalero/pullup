// Pure-math tests for the transaction layer's fee engine: ticket bps, the
// pull-up monthly free tier, and the DPCS party math shared with checkout.
import {
  computeTicketFee,
  computePullupFee,
  computePartySize,
  computeTicketAmounts,
} from "../src/services/billing/feeEngine.js";
import { STARTER_PLAN } from "../src/repos/billing.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

console.log("🧪 ticket fee = bps of gross, rounded");
{
  // 2.5% of 10000 = 250
  assert(computeTicketFee(10000, STARTER_PLAN) === 250, "2.5% of 100.00 is 2.50");
  // rounding: 2.5% of 333 = 8.325 → 8
  assert(computeTicketFee(333, STARTER_PLAN) === 8, "fee rounds to nearest cent");
  assert(computeTicketFee(0, STARTER_PLAN) === 0, "zero amount → zero fee");
  assert(computeTicketFee(-500, STARTER_PLAN) === 0, "negative amount → zero fee");
  assert(computeTicketFee(10000, { ticketFeeBps: 0 }) === 0, "0 bps concierge plan → zero fee");
}

console.log("🧪 pull-up fee respects the monthly free tier");
{
  assert(computePullupFee(0, STARTER_PLAN) === 0, "first pull-up of the month is free");
  assert(computePullupFee(499, STARTER_PLAN) === 0, "499th this month still free");
  assert(computePullupFee(500, STARTER_PLAN) === 5, "501st pull-up bills 5¢");
  assert(computePullupFee(10, { pullupFreeMonthly: 0, pullupFeeCents: 10 }) === 10, "no free tier → plan rate");
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
  const a = computeTicketAmounts({ event, rsvp, plan: STARTER_PLAN });
  assert(a.partySize === 2, "party of 2");
  assert(a.ticketAmount === 30000, "gross = 300 kr");
  assert(a.feeAmount === 750, "fee = 7.50 kr (2.5%)");
  assert(a.totalAmount === 30750, "guest pays 307.50 kr");
  assert(a.currency === "sek", "currency normalized lowercase");
}

console.log("🧪 invalid ticket price throws (money-hole guard)");
{
  let threw = false;
  try {
    computeTicketAmounts({ event: { ticketPrice: 0 }, rsvp: {}, plan: STARTER_PLAN });
  } catch { threw = true; }
  assert(threw, "zero-price paid event refuses to price");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll fee-engine tests passed");
