// Presence pass: decouples proof-of-presence (the ≤45s rotating code) from
// proof-of-identity (the sign-in that follows). A pass is minted ONLY after a
// live code verifies, then survives the auth round-trip the 45s window can't.
// These are the integrity guarantees the door rests on, so they get pinned.

process.env.WAITLIST_TOKEN_SECRET ||= "test-presence-secret-do-not-use-in-prod-0123456789";

const { mintPresencePass, verifyPresencePass } = await import("../src/services/pullupService.js");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const EVENT_A = "11111111-1111-1111-1111-111111111111";
const EVENT_B = "22222222-2222-2222-2222-222222222222";

console.log("🧪 a freshly minted pass verifies for its own event");
{
  const pass = mintPresencePass(EVENT_A);
  assert(verifyPresencePass(EVENT_A, pass).valid === true, "valid for the event it was minted for");
}

console.log("🧪 a pass is bound to ONE event — it can't be replayed against another");
{
  const pass = mintPresencePass(EVENT_A);
  const r = verifyPresencePass(EVENT_B, pass);
  assert(r.valid === false && r.reason === "wrong_event", `rejected for a different event (got ${r.reason})`);
}

console.log("🧪 a missing pass is rejected, not thrown");
{
  const r = verifyPresencePass(EVENT_A, null);
  assert(r.valid === false && r.reason === "missing", `null pass → missing (got ${r.reason})`);
}

console.log("🧪 a tampered / garbage pass is rejected, not thrown");
{
  const r = verifyPresencePass(EVENT_A, "not.a.real.jwt");
  assert(r.valid === false && r.reason === "bad_pass", `garbage → bad_pass (got ${r.reason})`);
}

console.log("🧪 a wrong-type host token (waitlist/VIP/media) can't be used as a door pass");
{
  // A token signed with the SAME secret but a different `type` must not pass —
  // otherwise any leaked VIP/media link would double as a fake presence proof.
  const { generateWaitlistToken } = await import("../src/utils/waitlistTokens.js");
  const vip = generateWaitlistToken({ type: "vip_invite", eventId: EVENT_A }, { expiresIn: "15m" });
  const r = verifyPresencePass(EVENT_A, vip);
  assert(r.valid === false && r.reason === "wrong_type", `cross-type token rejected (got ${r.reason})`);
}

console.log("🧪 an expired pass is rejected with a distinct reason");
{
  // Mint already-expired by signing in the past via the raw generator.
  const { generateWaitlistToken } = await import("../src/utils/waitlistTokens.js");
  const stale = generateWaitlistToken({ type: "presence_pass", eventId: EVENT_A }, { expiresIn: -10 });
  const r = verifyPresencePass(EVENT_A, stale);
  assert(r.valid === false && r.reason === "expired", `expired pass → expired (got ${r.reason})`);
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll presence-pass assertions passed");
