// Contract probe: the publish flow — draft is invisible to the public,
// PUT /host/events/:id/publish flips it live, public page appears. Throwaway
// host + event, full cleanup, runs anywhere (dev or the deploy gate).
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const email = `e2e_publish_${Date.now()}@example.com`;
let userId = null, eventId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  const { data: created } = await admin.auth.admin.createUser({ email, email_confirm: true });
  userId = created.user.id;
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const token = sess.session.access_token;
  const authed = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const ev = await fetch(`${API}/events`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({ title: "Publish probe", startsAt: new Date(Date.now() + 7 * 86400000).toISOString(), status: "DRAFT", createdVia: "create" }),
  }).then((r) => r.json());
  eventId = ev.id;
  ok(ev.status === "DRAFT", `draft created (${ev.slug})`);

  // drafts must be invisible to the public
  const anonGet = await fetch(`${API}/events/${ev.slug}`);
  ok(anonGet.status === 404, `draft hidden from public (${anonGet.status})`);

  // ...but visible to the host
  const hostGet = await fetch(`${API}/events/${ev.slug}`, { headers: authed });
  ok(hostGet.status === 200, `draft visible to its host (${hostGet.status})`);

  // publish
  const pub = await fetch(`${API}/host/events/${eventId}/publish`, { method: "PUT", headers: authed });
  const pubBody = await pub.json().catch(() => ({}));
  ok(pub.ok && (pubBody.status === "PUBLISHED" || pubBody.event?.status === "PUBLISHED"), `publish flips to PUBLISHED (${pub.status})`);

  // now public
  const liveGet = await fetch(`${API}/events/${ev.slug}`);
  const liveBody = await liveGet.json().catch(() => ({}));
  ok(liveGet.status === 200 && liveBody.title === "Publish probe", "published event publicly visible");

  // a stranger must NOT be able to publish someone else's draft
  const ev2 = await fetch(`${API}/events`, {
    method: "POST",
    headers: authed,
    body: JSON.stringify({ title: "Publish probe 2", startsAt: new Date(Date.now() + 7 * 86400000).toISOString(), status: "DRAFT", createdVia: "create" }),
  }).then((r) => r.json());
  const strangerPub = await fetch(`${API}/host/events/${ev2.id}/publish`, { method: "PUT" });
  ok(strangerPub.status === 401 || strangerPub.status === 403, `unauthenticated publish blocked (${strangerPub.status})`);
  await admin.from("event_channels").delete().eq("event_id", ev2.id);
  await admin.from("events").delete().eq("id", ev2.id);
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  if (eventId) {
    await admin.from("event_channels").delete().eq("event_id", eventId);
    await admin.from("events").delete().eq("id", eventId);
  }
  await admin.from("people").delete().eq("email", email.toLowerCase());
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => {});
  console.log("🧹 cleaned host + events");
}
process.exit(failures ? 1 : 0);
