// Contract probe: the host NOTIFICATIONS API over real HTTP.
//
// Throwaway host with a real session, then exercises the full contract:
//   GET  /host/notifications        → defaults (enabled:false, all cats true)
//   PUT  /host/notifications        → enable + flip a category, shape echoes back
//   GET  /host/notifications        → persisted
//   POST /host/notifications/test   → sends a digest (no activity → format preview)
//
// The host address is pre-suppressed so the test send never actually delivers
// (the enqueue path is exercised; delivery is suppressed by design).
//
// Run: node scripts/verify-notifications.js   (API_BASE defaults to :3210)
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY, ANON_KEY, API_BASE as API } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const tag = Date.now();
const hostEmail = `e2e_notif_host_${tag}@example.com`;
let hostUserId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  // throwaway host with a real session
  const { data: created } = await admin.auth.admin.createUser({ email: hostEmail, email_confirm: true });
  hostUserId = created.user.id;
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: hostEmail });
  const { data: sess } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  const token = sess.session.access_token;
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  // suppress the host address so the test send never actually delivers
  await admin.from("email_suppressions").insert({
    email: hostEmail.toLowerCase(), reason: "probe", source: "probe", details: "verify-notifications throwaway",
  }).then(() => {}, () => {});

  // 1. GET → defaults
  const g1 = await fetch(`${API}/host/notifications`, { headers: auth }).then((r) => r.json());
  ok(g1.enabled === false, `GET defaults to enabled:false (got ${g1.enabled})`);
  ok(g1.frequency === "daily" && g1.channel === "email", `frequency=daily channel=email`);
  ok(g1.lastSentAt === null, `lastSentAt null`);
  ok(g1.categories && Object.values(g1.categories).every((v) => v === true), `all categories default true`);
  ok(typeof g1.email === "string", `email present (${g1.email})`);

  // 2. PUT → enable + disable one category
  const put = await fetch(`${API}/host/notifications`, {
    method: "PUT", headers: auth,
    body: JSON.stringify({ enabled: true, categories: { messages: false } }),
  }).then((r) => r.json());
  ok(put.enabled === true, `PUT enabled:true echoes (got ${put.enabled})`);
  ok(put.categories.messages === false, `messages flipped off`);
  ok(put.categories.rsvps === true, `untouched categories stay true`);

  // 3. GET → persisted
  const g2 = await fetch(`${API}/host/notifications`, { headers: auth }).then((r) => r.json());
  ok(g2.enabled === true && g2.categories.messages === false, `prefs persisted across GET`);

  // 4. POST test → sends format preview (no activity)
  const t = await fetch(`${API}/host/notifications/test`, { method: "POST", headers: auth }).then((r) => r.json());
  ok(t.ok === true && typeof t.sentTo === "string", `test send ok → sentTo ${t.sentTo}`);

  // 4b. assert the digest was actually enqueued (to a suppressed address)
  const { data: outbox } = await admin
    .from("email_outbox")
    .select("subject, to_email")
    .eq("to_email", hostEmail.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(1);
  ok((outbox || []).length === 1 && /Your PullUp day/.test(outbox[0].subject), `digest enqueued (subject="${outbox?.[0]?.subject}")`);
} catch (e) {
  ok(false, `threw: ${e.message}`);
} finally {
  // cleanup
  if (hostUserId) {
    await admin.from("host_notification_prefs").delete().eq("host_id", hostUserId).then(() => {}, () => {});
    await admin.auth.admin.deleteUser(hostUserId).then(() => {}, () => {});
  }
  await admin.from("email_suppressions").delete().eq("email", hostEmail.toLowerCase()).then(() => {}, () => {});
}

if (failures) { console.error(`\n${failures} probe assertion(s) failed`); process.exit(1); }
console.log("\nAll notification probe assertions passed");
