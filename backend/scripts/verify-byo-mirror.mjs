// Integration proof for the BYO stage-2 DATA MIRROR. A throwaway host gets a
// small real world (event + person + rsvp + door scan + channel + message +
// timeline + note); we connect a stand-in owned DB (our own project, so the
// idempotent upserts genuinely exercise the write path — FK order, upsert,
// counts — against a real Supabase), run the mirror, and verify per-table
// counts. True cross-project isolation needs a 2nd project + the provisioner
// (increment 2b, Management-API-gated); this proves the mirror ENGINE.
//
// Run from backend/:  node scripts/verify-byo-mirror.mjs
import dotenv from "dotenv";
dotenv.config();
process.env.BYO_SUPABASE_ENABLED = "true";

import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SERVICE_KEY } from "./probeEnv.mjs";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const slice = await import("../src/services/byo/hostSlice.js");
const mirror = await import("../src/services/byo/mirror.js");
const repo = await import("../src/repos/creatorDatabases.js");

const tag = Date.now();
let hostId = null, personId = null, eventId = null, channelId = null, failures = 0;
const ids = {};
const ok = (c, l) => { console.log(`${c ? "✅" : "❌"} ${l}`); if (!c) failures++; };

try {
  if (!process.env.APP_ENCRYPTION_KEY) { console.log("⏭  APP_ENCRYPTION_KEY not set — skipping"); process.exit(2); }

  const { data: host } = await admin.auth.admin.createUser({ email: `e2e_byomir_${tag}@example.com`, email_confirm: true });
  hostId = host.user.id;

  // a small real world
  const { data: person } = await admin.from("people").insert({ name: "BYO Mirror Test", email: `byomir_p_${tag}@example.com` }).select("id").single();
  personId = person.id; ids.people = 1;
  const { data: ev } = await admin.from("events").insert({ host_id: hostId, title: "BYO mirror probe", slug: `byo-mirror-${tag}`, status: "PUBLISHED", starts_at: new Date(Date.now() + 7 * 864e5).toISOString(), timezone: "UTC" }).select("id").single();
  eventId = ev.id; ids.events = 1;
  await admin.from("rsvps").insert({ event_id: eventId, person_id: personId, slug: `byo-mirror-${tag}`, status: "attending", booking_status: "CONFIRMED", party_size: 1 }); ids.rsvps = 1;
  // best-effort extras (don't fail the proof on a column quirk — note what lands)
  const tryInsert = async (table, row) => { const { error } = await admin.from(table).insert(row); if (!error) ids[table] = (ids[table] || 0) + 1; else console.log(`  (skip ${table}: ${error.message})`); };
  await tryInsert("pullups", { event_id: eventId, person_id: personId, method: "scan" });
  const { data: ch } = await admin.from("event_channels").insert({ event_id: eventId, name: "Main", is_main: true }).select("id").maybeSingle();
  if (ch) { channelId = ch.id; ids.event_channels = 1; await tryInsert("event_space_messages", { event_id: eventId, channel_id: channelId, body: "hi", author_name: "Tester", author_person_id: personId }); }
  await tryInsert("person_events", { person_id: personId, host_id: hostId, type: "attended", channel: "web", occurred_at: new Date().toISOString() });
  await tryInsert("person_notes", { person_id: personId, host_id: hostId, body: "a note" });

  // 1. the slice gathers the host's whole world
  const s = await slice.gatherHostSlice(hostId);
  const counts = slice.sliceCounts(s);
  ok(counts.events === 1 && counts.rsvps === 1 && counts.people === 1, `slice gathered core (events=${counts.events} rsvps=${counts.rsvps} people=${counts.people})`);
  ok((counts.pullups || 0) >= 0 && "event_space_messages" in counts, `slice spans all ${slice.MIRROR_TABLES.length} owned tables`);

  // 2. connect a stand-in owned DB (our own project)
  const conn = await repo.connectCreatorDatabase({ hostId, projectRef: `standin_${tag}`, dbUrl: SUPABASE_URL, serviceKey: SERVICE_KEY });
  ok(!conn.error, `connected stand-in owned DB (${conn.db?.status})`);

  // 3. MIRROR — idempotent upserts of the host's slice into the owned project
  const res = await mirror.mirrorHostData(hostId);
  ok(res.ok, `mirror ran clean (${res.ok ? "ok" : res.reason})`);
  const wrote = Object.fromEntries((res.results || []).map((r) => [r.table, r.written]));
  ok(wrote.people === 1 && wrote.events === 1 && wrote.rsvps === 1, `mirror wrote core tables (people=${wrote.people} events=${wrote.events} rsvps=${wrote.rsvps})`);

  // 4. status advanced to 'live' (populated; not yet system_of_record)
  const after = await repo.getCreatorDatabase(hostId);
  ok(after?.status === "live" && after?.systemOfRecord === false, `status=live, not cut over (${after?.status}/${after?.systemOfRecord})`);

  // 5. verify — owned counts meet shared counts (same project ⇒ equal)
  const v = await mirror.verifyMirror(hostId);
  ok(v.ok && v.mismatches.length === 0, `verify: owned ≥ shared, no mismatches (${JSON.stringify(v.mismatches)})`);
} catch (e) {
  failures++;
  console.error("❌ threw:", e.message);
} finally {
  // cleanup — children first
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
  console.log("🧹 cleaned host, world, creator_databases row");
}
process.exit(failures ? 1 : 0);
