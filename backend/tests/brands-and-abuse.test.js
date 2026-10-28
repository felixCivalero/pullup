// Brands under one login (lib/brands.js) and the guards against bots and
// people using PullUp to mail strangers (lib/abuse.js). Pure parts only.
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_KEY ||= "test-service-key";
const { cleanBrandName, pickBrand } = await import("../src/lib/brands.js");
const { over, mayConfirm, resetCounters, humanCheck, CONFIRMATIONS_PER_ADDRESS, CONFIRMATIONS_PER_ACCOUNT } = await import("../src/lib/abuse.js");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

// ── brand names ──
assert(cleanBrandName("  Aperol  ") === "Aperol", "trimmed");
assert(cleanBrandName("Hendrick's Gin") === "Hendrick's Gin", "an apostrophe stays");
assert(!/[\r\n"<>]/.test(cleanBrandName('Evil"\r\nBcc: x@y.se <a>')), "no quotes, angle brackets or line breaks (it becomes a mail sender name)");
assert(cleanBrandName("x".repeat(200)).length === 80, "at most 80 characters");
assert(cleanBrandName("   ") === "" && cleanBrandName(null) === "" && cleanBrandName(42) === "", "empty or not text → empty");

// ── which brand a request works in ──
const brands = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Aperol" },
  { id: "22222222-2222-4222-8222-222222222222", name: "Hendrick's" },
];
assert(pickBrand([], "anything") === null, "no brands → none");
assert(pickBrand(brands, null).name === "Aperol", "nothing asked → the first");
assert(pickBrand(brands, brands[1].id).name === "Hendrick's", "by id");
assert(pickBrand(brands, "hendrick's").name === "Hendrick's", "by name, any case");
assert(pickBrand(brands, "33333333-3333-4333-8333-333333333333").name === "Aperol", "someone else's brand id is ignored → the first, never theirs");
assert(pickBrand(brands, "' or 1=1 --").name === "Aperol", "junk is ignored");

// ── counters ──
resetCounters();
const t = Date.parse("2026-10-28T10:00:00Z");
let blocked = 0;
for (let i = 0; i < 5; i += 1) if (over("k", 3, 1000, t)) blocked += 1;
assert(blocked === 2, "over: the 4th and 5th hit in the window are over");
assert(!over("k", 3, 1000, t + 1001), "a new window starts fresh");

// ── free confirmation mails ──
resetCounters();
let sent = 0;
for (let i = 0; i < CONFIRMATIONS_PER_ADDRESS + 4; i += 1) if (mayConfirm({ email: "victim@example.com", hostId: "h1" }, t)) sent += 1;
assert(sent === CONFIRMATIONS_PER_ADDRESS, `one address gets at most ${CONFIRMATIONS_PER_ADDRESS} confirmations an hour`);
assert(mayConfirm({ email: "victim@example.com", hostId: "h1" }, t + 3600_001), "…and again an hour later");

resetCounters();
sent = 0;
for (let i = 0; i < CONFIRMATIONS_PER_ACCOUNT + 50; i += 1) if (mayConfirm({ email: `p${i}@example.com`, hostId: "spammer" }, t)) sent += 1;
assert(sent === CONFIRMATIONS_PER_ACCOUNT, `one account's events send at most ${CONFIRMATIONS_PER_ACCOUNT} confirmations an hour`);
assert(mayConfirm({ email: "someone@example.com", hostId: "other-host" }, t), "another organiser is not affected");

// ── Turnstile ──
delete process.env.TURNSTILE_SECRET_KEY;
assert(await humanCheck(undefined, "1.2.3.4") === true, "no Turnstile keys: the check passes (rate limits still hold)");
process.env.TURNSTILE_SECRET_KEY = "secret";
assert(await humanCheck(undefined, "1.2.3.4") === false, "keys set, no token → refused");
assert(await humanCheck("x".repeat(5000), "1.2.3.4") === false, "keys set, absurd token → refused without asking Cloudflare");
delete process.env.TURNSTILE_SECRET_KEY;

if (failures) { console.error(`\n${failures} brands/abuse test(s) failed`); process.exit(1); }
console.log("\nall brands-and-abuse tests passed");
