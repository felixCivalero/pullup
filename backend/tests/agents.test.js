// Assistants on PullUp: the action registry's rules, OAuth redirect URIs,
// the SSRF guard on image URLs and wall-clock times. Pure; no network.
process.env.SUPABASE_URL ||= "http://localhost";
process.env.SUPABASE_SERVICE_KEY ||= "test";
const { z } = await import("zod");
const { defineAction, canRun, mcpAnnotations, webmcpAnnotations, describe, runAction } = await import("../src/actions/registry.js");
const { ACTIONS, actionsFor } = await import("../src/actions/index.js");
const { allowedRedirectUri } = await import("../src/agents/oauthProvider.js");
const { isPublicAddress } = await import("../src/lib/remoteImage.js");
const { toUtcIso, isValidTimeZone } = await import("../src/lib/zonedTime.js");
const { ActionError } = await import("../src/lib/actionError.js");

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}
async function rejects(promise, code, msg) {
  try {
    await promise;
    assert(false, msg);
  } catch (err) {
    assert(err instanceof ActionError && err.code === code, `${msg} (${err.code})`);
  }
}

// ── who may run what ──
const owner = { userId: "o", isOwner: true, hostId: "h-o" };
const organiser = { userId: "u", isOwner: false, hostId: "u" };
const names = (caller) => actionsFor(caller).map((a) => a.name);
assert(names(null).sort().join() === "about_pullup,get_event,request_meeting,rsvp_to_event", "signed out: the four public actions");
assert(names(organiser).length === 18 && !names(organiser).some((n) => ["site_stats", "sales_pipeline", "list_meeting_requests"].includes(n)), "an organiser: 18, none of the owner's");
assert(names(owner).length === ACTIONS.size, "the owner: everything");
for (const a of ACTIONS.values()) {
  const schema = describe(a).inputSchema;
  if (schema.type !== "object" || schema.additionalProperties !== false) assert(false, `${a.name}: input is a closed object`);
  if (a.description.length < 40) assert(false, `${a.name}: description says enough for an AI`);
}
assert(true, "every action: closed JSON Schema object and a real description");
const sends = [...ACTIONS.values()].filter((a) => a.effect === "send").map((a) => a.name).sort();
assert(sends.join() === "publish_event,request_meeting,rsvp_to_event,send_mail", "what reaches the world is marked as such: " + sends.join(", "));
assert(mcpAnnotations(ACTIONS.get("send_mail")).destructiveHint && webmcpAnnotations(ACTIONS.get("send_mail")).consequentialHint, "sending mail is flagged consequential in both vocabularies");
assert(mcpAnnotations(ACTIONS.get("list_people")).readOnlyHint && webmcpAnnotations(ACTIONS.get("list_people")).untrustedContentHint, "the CRM is read-only and flagged as untrusted content");

// ── defineAction refuses sloppy definitions ──
const base = { name: "do_thing", title: "Do", description: "Does the thing for the person, carefully.", access: "user", effect: "write", input: z.object({}), run: async () => ({}) };
let threw = false;
try { defineAction({ ...base, name: "Do-Thing" }); } catch { threw = true; }
assert(threw, "names must be snake_case");
threw = false;
try { defineAction({ ...base, access: "admin" }); } catch { threw = true; }
assert(threw, "access must be public, user or owner");

// ── runAction: the gate every door goes through ──
const echo = defineAction({ ...base, name: "echo_it", input: z.object({ n: z.number().int().min(1) }), run: async ({ n }, ctx) => ({ n, who: ctx.caller.userId }) });
const boom = defineAction({ ...base, name: "boom_it", run: async () => { throw new Error("db password is hunter2"); } });
const ownerOnly = defineAction({ ...base, name: "secret_it", access: "owner", effect: "read" });
const map = new Map([echo, boom, ownerOnly].map((a) => [a.name, a]));
const http = (caller) => ({ caller, door: "http", ip: `ip-${Math.random()}` });
assert((await runAction(map, "echo_it", { n: 2 }, http(organiser))).who === "u", "runs as the caller");
await rejects(runAction(map, "echo_it", { n: 2 }, http(null)), "unauthenticated", "signed out → sign in first");
await rejects(runAction(map, "secret_it", {}, http(organiser)), "forbidden", "an organiser can't run the owner's");
await rejects(runAction(map, "echo_it", { n: 0 }, http(organiser)), "invalid", "input is validated");
await rejects(runAction(map, "echo_it", { n: 1, admin: true }, http(organiser)), "invalid", "unknown fields are refused");
await rejects(runAction(map, "nope", {}, http(organiser)), "not_found", "an unknown action");
try {
  await runAction(map, "boom_it", {}, http(organiser));
} catch (err) {
  assert(err.code === "failed" && !err.message.includes("hunter2") && /ref [0-9a-f]{8}/.test(err.message), "internal errors never leak; they carry a reference");
}
const flood = http(organiser);
let limited = false;
for (let i = 0; i < 45 && !limited; i++) {
  try { await runAction(map, "echo_it", { n: 1 }, { ...flood, caller: { ...organiser, userId: "flood" } }); } catch (err) { limited = err.code === "rate_limited"; }
}
assert(limited, "a runaway loop hits the per-minute limit");
assert(canRun(ownerOnly, owner) && !canRun(ownerOnly, null), "canRun matches access");

// ── OAuth redirect URIs ──
for (const ok of ["https://claude.ai/api/mcp/auth_callback", "http://127.0.0.1:33418/callback", "http://localhost:6274/oauth/callback", "cursor://anysphere.cursor-retrieval/oauth/callback", "vscode://vscode.mcp/callback"]) {
  if (!allowedRedirectUri(ok)) assert(false, `allowed: ${ok}`);
}
assert(true, "https, loopback and app schemes are allowed");
for (const bad of ["http://evil.example/cb", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://ok.example/cb#frag", "not a url"]) {
  if (allowedRedirectUri(bad)) assert(false, `refused: ${bad}`);
}
assert(true, "plain http, javascript:, data:, file: and fragments are refused");

// ── image URLs can't reach inside ──
for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"]) {
  if (isPublicAddress(ip)) assert(false, `blocked: ${ip}`);
}
assert(true, "loopback, private, link-local (cloud metadata) and mapped addresses are blocked");
assert(isPublicAddress("151.101.1.140") && isPublicAddress("2a04:4e42::396"), "public v4 and v6 pass");

// ── times as the clock shows them ──
assert(toUtcIso("2026-11-07T19:00", "Europe/Stockholm") === "2026-11-07T18:00:00.000Z", "19:00 in Stockholm in November = 18:00 UTC");
assert(toUtcIso("2026-07-07T19:00", "Europe/Stockholm") === "2026-07-07T17:00:00.000Z", "…and 17:00 UTC in summer");
assert(toUtcIso("2026-11-07T19:00", "America/New_York") === "2026-11-08T00:00:00.000Z", "another zone");
assert(toUtcIso("2026-11-07T19:00:00+01:00") === "2026-11-07T18:00:00.000Z" && toUtcIso("2026-11-07T18:00:00Z") === "2026-11-07T18:00:00.000Z", "a time with its own offset is kept");
assert(toUtcIso("2026-03-29T02:30", "Europe/Stockholm") !== null, "a time in the spring-forward gap still resolves");
assert(toUtcIso("next friday") === null && toUtcIso("") === null, "words aren't times");
assert(isValidTimeZone("Europe/Stockholm") && !isValidTimeZone("Mars/Base"), "time zones are checked");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall agents tests passed");
process.exit(0);
