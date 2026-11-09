// Account limits (lib/accountLimits.js, mig 163): the owner's patch is
// read safely, no row means no limits, and the owner is never limited.
import assert from "node:assert/strict";
import { NO_LIMITS, assertMayCreate, assertMayMail, assertMayPublish, limitsPatch, shapeLimits } from "../src/lib/accountLimits.js";

assert.deepEqual(limitsPatch({ mailBlocked: true, maxEvents: "5", note: "  spam  " }), { mail_blocked: true, max_events: 5, note: "spam" });
assert.deepEqual(limitsPatch({ maxEvents: "" }), { max_events: null });
assert.deepEqual(limitsPatch({ maxEvents: null, publishBlocked: false }), { publish_blocked: false, max_events: null });
assert.equal(limitsPatch({ maxEvents: "-1" }), null);
assert.equal(limitsPatch({ maxEvents: "abc" }), null);
assert.deepEqual(limitsPatch({ mailBlocked: "yes" }), {}, "only real booleans count");
assert.deepEqual(shapeLimits(null), NO_LIMITS);
assert.deepEqual(shapeLimits({ mail_blocked: true, publish_blocked: false, max_events: 0, note: "x", updated_at: "t" }), { mailBlocked: true, publishBlocked: false, maxEvents: 0, note: "x", updatedAt: "t" });

// The owner passes without a lookup.
const owner = { isOwner: true };
await assertMayMail(owner, "00000000-0000-0000-0000-000000000000");
await assertMayPublish(owner, "00000000-0000-0000-0000-000000000000");
await assertMayCreate(owner, "00000000-0000-0000-0000-000000000000");
console.log("account-limits: ok");
process.exit(0);
