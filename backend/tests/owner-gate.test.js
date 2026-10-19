// The admin side belongs to one account. isOwnerEmail is the whole rule.
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_KEY ||= "test";
const { isOwnerEmail, OWNER_EMAIL } = await import("../src/middleware/requireOwner.js");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

assert(OWNER_EMAIL === (process.env.OWNER_EMAIL || "felix@pullup.se").toLowerCase(), "owner defaults to felix@pullup.se");
assert(isOwnerEmail("felix@pullup.se"), "owner email passes");
assert(isOwnerEmail("  Felix@PullUp.se "), "case and whitespace don't matter");
assert(!isOwnerEmail("hello@pullup.se"), "another @pullup.se address is refused");
assert(!isOwnerEmail("felix@pullup.se.evil.com"), "lookalike domain is refused");
assert(!isOwnerEmail(""), "empty is refused");
assert(!isOwnerEmail(null), "null is refused");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall owner-gate tests passed");
