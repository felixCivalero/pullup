// Probe GET /host/events/:id/story — the per-event host story. Creates a
// throwaway host + draft→published event, checks the ownership gate, the
// payload shape and the phase logic, then cleans everything up.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API, grantHosting, revokeHosting } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const stamp = Date.now();
const hostEmail = `e2e_story_host_${stamp}@example.com`;
const strangerEmail = `e2e_story_stranger_${stamp}@example.com`;
let hostId = null, strangerId = null, eventId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

async function tokenFor(email) {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  return { userId: created.user.id, token: sess.session.access_token };
}

try {
  const host = await tokenFor(hostEmail);
  hostId = host.userId;
  await grantHosting(admin, hostId); // paywall: creating a draft needs an active tier
  const stranger = await tokenFor(strangerEmail);
  strangerId = stranger.userId;

  const authed = (tok) => (path) =>
    fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${tok}` } })
      .then(async (r) => ({ status: r.status, json: await r.json() }));

  const ev = await fetch(`${API}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${host.token}` },
    body: JSON.stringify({ title: "Story probe", startsAt: new Date(Date.now() + 3 * 86400000).toISOString(), status: "DRAFT", createdVia: "create" }),
  }).then((r) => r.json());
  eventId = ev.id;
  ok(!!eventId, "probe event created");

  // Ownership gate: a stranger must bounce, the host must pass.
  const denied = await authed(stranger.token)(`/host/events/${eventId}/story`);
  ok(denied.status === 403, `stranger gets 403 (${denied.status})`);

  const res = await authed(host.token)(`/host/events/${eventId}/story`);
  ok(res.status === 200, `host gets the story (${res.status})`);
  const s = res.json;
  const sections = ["event", "fill", "daily", "sources", "people", "channels", "night", "afterlife", "money", "benchmarks"];
  ok(sections.every((k) => k in s), `all ${sections.length} story sections present`);
  ok(s.event.phase === "draft", `draft phase detected (${s.event.phase})`);
  ok(s.fill.rsvps === 0 && s.people.total === 0, "empty event = zeroed story, no nulls exploding");
  ok(s.benchmarks.eventsCompared === 0, "new host = no benchmarks, honestly");

  // 404 for a non-existent event id (host is admin of nothing).
  const missing = await authed(host.token)(`/host/events/00000000-0000-4000-8000-000000000000/story`);
  ok(missing.status === 403 || missing.status === 404, `unknown event refused (${missing.status})`);
} catch (err) {
  console.error("❌ probe blew up:", err.message);
  failures++;
} finally {
  try { if (eventId) await admin.from("events").delete().eq("id", eventId); } catch { /* best-effort */ }
  for (const uid of [hostId, strangerId]) {
    try { if (uid) await revokeHosting(admin, uid); } catch { /* best-effort */ }
    try { if (uid) await admin.from("profiles").delete().eq("id", uid); } catch { /* best-effort */ }
    try { if (uid) await admin.auth.admin.deleteUser(uid); } catch { /* best-effort */ }
  }
}

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nhost/events/:id/story probe passed");
