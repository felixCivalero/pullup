// Browser-bound sign-in (lib/deviceLogin.js): the code or link alone never
// signs anyone in; only together with the secret of the browser that asked.
process.env.SUPABASE_SERVICE_KEY ||= "test-service-key";
const { checkAttempt, codeHash, describeDevice, isDeviceHash, newCode, newSecret, open, seal, sha256, MAX_TRIES } = await import("../src/lib/deviceLogin.js");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const secret = newSecret();
const link = newSecret();
const now = Date.parse("2026-10-26T08:00:00Z");
const attempt = {
  id: "96b5176c-3db2-4cec-953b-7fe091fb67e0",
  device_hash: sha256(secret),
  code_hash: codeHash("96b5176c-3db2-4cec-953b-7fe091fb67e0", "123456"),
  link_hash: sha256(link),
  tries: 0,
  used_at: null,
  expires_at: new Date(now + 15 * 60_000).toISOString(),
};

assert(checkAttempt(attempt, { secret, code: "123456" }, now) === "ok", "right code in the browser that asked → ok");
assert(checkAttempt(attempt, { secret, code: "123 456" }, now) === "ok", "spaces in the code don't matter");
assert(checkAttempt(attempt, { secret, link }, now) === "ok", "the mail's link in the browser that asked → ok");
assert(checkAttempt(attempt, { secret: newSecret(), code: "123456" }, now) === "other_device", "right code, another browser → refused");
assert(checkAttempt(attempt, { secret: newSecret(), link }, now) === "other_device", "the link, another browser → refused");
assert(checkAttempt(attempt, { secret: "", code: "123456" }, now) === "other_device", "no secret at all → refused");
assert(checkAttempt(attempt, { secret, code: "654321" }, now) === "wrong_code", "wrong code → refused");
assert(checkAttempt(attempt, { secret, link: newSecret() }, now) === "wrong_code", "a made-up link → refused");
assert(checkAttempt(attempt, { secret }, now) === "missing", "neither code nor link → asks for the code");
assert(checkAttempt({ ...attempt, used_at: new Date(now).toISOString() }, { secret, code: "123456" }, now) === "used", "works once");
assert(checkAttempt(attempt, { secret, code: "123456" }, now + 16 * 60_000) === "expired", "dead after 15 minutes");
assert(checkAttempt({ ...attempt, tries: MAX_TRIES }, { secret, code: "123456" }, now) === "locked", `locked after ${MAX_TRIES} wrong tries, even with the right code`);
assert(checkAttempt(null, { secret, code: "123456" }, now) === "expired", "unknown attempt → expired");
assert(codeHash("a", "123456") !== codeHash("b", "123456"), "the same code hashes differently per attempt");

assert(/^\d{6}$/.test(newCode()) && new Set(Array.from({ length: 50 }, newCode)).size > 40, "codes are six random digits");
assert(newSecret().length >= 43 && newSecret() !== newSecret(), "secrets are 256-bit and fresh");
assert(isDeviceHash(sha256("x")) && !isDeviceHash("abc") && !isDeviceHash(sha256("x").toUpperCase()), "the device field must be a SHA-256 hex digest");

const sealed = seal("supabase-token-hash");
assert(open(sealed) === "supabase-token-hash" && !sealed.includes("supabase-token-hash"), "Supabase's token waits encrypted and opens again");
assert(seal("x") !== seal("x"), "sealing is randomised");
let tampered = false;
try { const [iv, tag, body] = sealed.split("."); open([iv, tag, body.slice(0, -2) + (body.endsWith("A") ? "BB" : "AA")].join(".")); } catch { tampered = true; }
assert(tampered, "a changed ciphertext doesn't open");

assert(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36") === "Chrome på macOS", "Chrome on a Mac");
assert(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1") === "Safari på iOS", "Safari on an iPhone");
assert(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36 Edg/141.0") === "Edge på Windows", "Edge on Windows");
assert(describeDevice("") === "en webbläsare", "unknown → a browser");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall device-login tests passed");
