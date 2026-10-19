// HTTP probes for the deploy gate — run against a booted copy of the new code.
//   API_BASE=http://127.0.0.1:3299 node scripts/verify-site.mjs
const BASE = (process.env.API_BASE || "http://127.0.0.1:3001").replace(/\/$/, "");

let failures = 0;
async function probe(name, path, init, expect) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual", ...init });
    const ok = expect(res);
    console.log(`${ok ? "✅" : "❌"} ${name} (${res.status})`);
    if (!ok) failures += 1;
  } catch (err) {
    failures += 1;
    console.log(`❌ ${name} — ${err.message}`);
  }
}
const json = (body) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

await probe("health", "/health", {}, (r) => r.status === 200);
await probe("admin refuses no session", "/admin/me", {}, (r) => r.status === 401);
await probe("admin refuses a bad token", "/admin/me", { headers: { Authorization: "Bearer nope" } }, (r) => r.status === 401);
await probe("request form rejects an empty body", "/agency-requests", json({}), (r) => r.status === 400);
await probe("booklet form rejects an empty body", "/deck-downloads", json({}), (r) => r.status === 400);
await probe("old event links go to the front page", "/e/some-old-event", {}, (r) => r.status === 302);
await probe("unknown route is a 404", "/events", {}, (r) => r.status === 404);

if (failures) { console.error(`\n${failures} probe(s) failed`); process.exit(1); }
console.log("\nall probes green");
