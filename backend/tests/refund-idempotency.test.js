// Refunds move real money. Two concurrent refund calls for the SAME intended
// refund (e.g. two AI sessions both firing refund_payment) must not both go
// through. A deterministic Stripe idempotency key derived from the payment +
// amount lets Stripe dedupe the duplicate server-side, the same discipline the
// campaign sender uses for its atomic claim.

import { refundIdempotencyKey } from "../src/stripe.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

console.log("🧪 same payment + same amount → identical key (a retry/double-fire is deduped)");
{
  const a = refundIdempotencyKey("pi_123", 500);
  const b = refundIdempotencyKey("pi_123", 500);
  assert(a === b, `expected stable key, got ${a} vs ${b}`);
}

console.log("🧪 same payment, different amount → different key (a legit second partial refund is allowed)");
{
  const a = refundIdempotencyKey("pi_123", 500);
  const b = refundIdempotencyKey("pi_123", 250);
  assert(a !== b, `expected different keys for different amounts, both were ${a}`);
}

console.log("🧪 different payment → different key (one payer's refund never blocks another's)");
{
  const a = refundIdempotencyKey("pi_123", 500);
  const b = refundIdempotencyKey("pi_999", 500);
  assert(a !== b, `expected different keys for different payments, both were ${a}`);
}

console.log("🧪 full refund (amount null) → stable, non-empty key");
{
  const a = refundIdempotencyKey("pi_123", null);
  const b = refundIdempotencyKey("pi_123", null);
  assert(a === b, `expected stable full-refund key, got ${a} vs ${b}`);
  assert(typeof a === "string" && a.length > 0, `expected non-empty string, got ${JSON.stringify(a)}`);
}

console.log("🧪 a full refund and a partial refund of the same payment get different keys");
{
  const full = refundIdempotencyKey("pi_123", null);
  const partial = refundIdempotencyKey("pi_123", 500);
  assert(full !== partial, `expected full vs partial to differ, both were ${full}`);
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll refund-idempotency tests passed");
