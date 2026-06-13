// THE LIVE ROUND-TRIP — the proof that "creators own their data" is real, not
// architecture. Uses a genuine SECOND Supabase project (TEST_BYO_* in .env):
//   1. clean-slate the second project (drop owned tables)
//   2. create a throwaway host + small world in PullUp's shared DB
//   3. connect the real second project (encrypted service key + mgmt PAT)
//   4. PROVISION the owned schema into it via the Management API
//   5. MIRROR the host's slice across
//   6. independently query the SECOND project and confirm the rows are there
//   7. verify per-table counts match, then tear the second project back down
//
// Run from backend/:  node scripts/verify-byo-live.mjs
import dotenv from "dotenv";
dotenv.config();
process.env.BYO_SUPABASE_ENABLED = "true";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY } from "./probeEnv.mjs";

// Derive ref/url from whatever was pasted (full URL or bare ref).
function deriveRef(raw) {
  let r = (raw || "").trim();
  const m = r.match(/^https?:\/\/([a-z0-9]+)\.supabase\.(co|in)/i);
  if (m) return m[1];
  return r.replace(/^https?:\/\//, "").replace(/\.supabase\..*$/, "");
}
const REF = deriveRef(process.env.TEST_BYO_PROJECT_REF);
const OWNED_URL = `https://${REF}.supabase.co`;
const OWNED_KEY = process.env.TEST_BYO_SERVICE_KEY;
const PAT = process.env.TEST_BYO_MGMT_PAT;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const owned = createClient(OWNED_URL, OWNED_KEY, { auth: { persistSession: false } }); // independent client on the OTHER db

const repo = await import("../src/repos/creatorDatabases.js");
const prov = await import("../src/services/byo/provisioner.js");
const mir = await import("../src/services/byo/mirror.js");
const { runProjectSql } = await import("../src/services/byo/managementApi.js");

const OWNED_TABLES = ["event_space_messages", "person_notes", "person_events", "pullups", "rsvps", "event_channels", "events", "people"];
const tag = Date.now();
let hostId = null, personId = null, eventId = null, channelId = null, failures = 0;
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  if (!REF || !OWNED_KEY || !PAT) { console.log("⏭  TEST_BYO_* not all set — skipping"); process.exit(2); }

  // 1. clean slate on the second project
  await runProjectSql(REF, PAT, `DROP TABLE IF EXISTS ${OWNED_TABLES.join(", ")} CASCADE;`);
  console.log("· cleaned the second project");

  // 2. a small real world in the shared DB
  const { data: host } = await admin.auth.admin.createUser({ email: `e2e_byolive_${tag}@example.com`, email_confirm: true });
  hostId = host.user.id;
  const { data: person } = await admin.from("people").insert({ name: "BYO Live", email: `byolive_p_${tag}@example.com` }).select("id").single();
  personId = person.id;
  const { data: ev } = await admin.from("events").insert({ host_id: hostId, title: "BYO live probe", slug: `byo-live-${tag}`, status: "PUBLISHED", starts_at: new Date(Date.now() + 7 * 864e5).toISOString(), timezone: "UTC" }).select("id").single();
  eventId = ev.id;
  await admin.from("rsvps").insert({ event_id: eventId, person_id: personId, slug: `byo-live-${tag}`, status: "attending", booking_status: "CONFIRMED", party_size: 1 });
  await admin.from("pullups").insert({ event_id: eventId, person_id: personId, method: "scan" });
  const { data: ch } = await admin.from("event_channels").insert({ event_id: eventId, name: "Main", is_main: true }).select("id").single();
  channelId = ch.id;
  await admin.from("event_space_messages").insert({ event_id: eventId, channel_id: channelId, body: "live test", author_name: "Tester", author_person_id: personId });
  await admin.from("person_events").insert({ person_id: personId, host_id: hostId, type: "attended", channel: "web", occurred_at: new Date().toISOString() });
  await admin.from("person_notes").insert({ person_id: personId, host_id: hostId, content: "a live note" });
  console.log("· seeded host world in shared DB");

  // 3. connect the real second project
  const conn = await repo.connectCreatorDatabase({ hostId, projectRef: REF, dbUrl: OWNED_URL, serviceKey: OWNED_KEY, mgmtToken: PAT });
  ok(!conn.error, `connected the real second project (${conn.db?.status})`);

  // 4. PROVISION the owned schema into the second project (Management API)
  const pr = await prov.provisionOwnedProject(hostId);
  ok(pr.ok && pr.schemaVersion === 87, `provisioned owned schema (${pr.ok ? "v" + pr.schemaVersion : pr.reason})`);

  // 5. tables really exist on the OTHER database
  const { error: tblErr } = await owned.from("people").select("id", { count: "exact", head: true });
  ok(!tblErr, `owned tables exist on the second project (${tblErr?.message || "people table queryable"})`);

  // 6. MIRROR across
  const mr = await mir.mirrorHostData(hostId);
  ok(mr.ok, `mirror ran (${mr.ok ? "ok" : mr.reason})`);

  // 7. THE PROOF — independently read the second project; the rows are there
  const { data: oPeople } = await owned.from("people").select("id").eq("id", personId);
  ok(oPeople?.length === 1, `person row landed in the creator's OWN database (${oPeople?.length})`);
  const { data: oEvents } = await owned.from("events").select("id,title").eq("id", eventId);
  ok(oEvents?.length === 1 && oEvents[0].title === "BYO live probe", `event row landed on the other db (${oEvents?.[0]?.title})`);
  const { count: oRsvps } = await owned.from("rsvps").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  ok(oRsvps === 1, `rsvp landed on the other db (${oRsvps})`);
  const { count: oMsgs } = await owned.from("event_space_messages").select("id", { count: "exact", head: true }).eq("event_id", eventId);
  ok(oMsgs === 1, `room message landed on the other db (${oMsgs})`);

  // 8. verify counts match shared ↔ owned
  const v = await mir.verifyMirror(hostId);
  ok(v.ok && v.mismatches.length === 0, `verify: owned matches shared, no mismatches (${JSON.stringify(v.mismatches)})`);

  console.log(`\n🎉 A creator's world now lives in a database they own (${REF}). Ownership is physics.`);
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  // tear the second project back down + clean shared
  try { await runProjectSql(REF, PAT, `DROP TABLE IF EXISTS ${OWNED_TABLES.join(", ")} CASCADE;`); } catch { /* */ }
  if (eventId) {
    await admin.from("person_notes").delete().eq("host_id", hostId);
    await admin.from("person_events").delete().eq("host_id", hostId);
    await admin.from("event_space_messages").delete().eq("event_id", eventId);
    await admin.from("event_channels").delete().eq("event_id", eventId);
    await admin.from("pullups").delete().eq("event_id", eventId);
    await admin.from("rsvps").delete().eq("event_id", eventId);
    await admin.from("events").delete().eq("id", eventId);
  }
  if (personId) await admin.from("people").delete().eq("id", personId);
  if (hostId) {
    await admin.from("creator_databases").delete().eq("host_id", hostId);
    await admin.auth.admin.deleteUser(hostId).catch(() => {});
  }
  console.log("🧹 cleaned the second project + shared fixtures");
}
process.exit(failures ? 1 : 0);
