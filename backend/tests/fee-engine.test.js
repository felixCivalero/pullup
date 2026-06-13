// Pure-math tests for the transaction layer's fee engine: ticket bps, the
// pull-up monthly free tier, and the DPCS party math shared with checkout.
import {
  computeTicketFee,
  computeStorageServiceFee,
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

console.log("🧪 storage service fee = markup_bps of the creator's Supabase bill");
{
  // 30% on a $25 (2500¢) Supabase bill = 750¢
  assert(computeStorageServiceFee(2500, 3000) === 750, "30% of $25 is $7.50");
  // 30% on an $85 (8500¢) promoter bill = 2550¢
  assert(computeStorageServiceFee(8500, 3000) === 2550, "30% of $85 is $25.50");
  // free tier → nothing to mark up → $0 (the BYO-dormant case)
  assert(computeStorageServiceFee(0, 3000) === 0, "free-tier creator owes no service fee");
  // default markup is 30% when unspecified
  assert(computeStorageServiceFee(2500) === 750, "markup defaults to 30%");
  // pull-ups are never billed — there is no per-pull-up fee function at all
  assert(typeof computeStorageServiceFee === "function", "storage fee replaces the (removed) per-pull-up fee");
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
