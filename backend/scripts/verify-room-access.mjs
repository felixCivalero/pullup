// verify-room-access.mjs — proves the room-access capability chain end-to-end
// against the REAL services + DB: host config → stored grid → time-phased gate
// → seeWho roster. Creates test-prefixed fixtures, asserts the matrix, cleans up.
// Run from backend/: node --env-file=.env scripts/verify-room-access.mjs
import { supabase } from "../src/supabase.js";
import { resolveEventAccess, getRoomAccess, getRoomRoster } from "../src/services/pullupService.js";
import { sanitizePermissions, resolveCapabilities } from "../src/services/roomPermissions.js";

const TAG = `room-access-verify-${Date.now()}`;
let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log(`  ✓ ${label}`); } else { fail++; console.log(`  ✗ FAIL ${label}`); } };

const ids = { people: [], events: [] };
async function makePerson(name) {
  const { data, error } = await supabase.from("people").insert({ name, email: `${name.toLowerCase()}.${TAG}@example.com` }).select("id").single();
  if (error) throw error;
  ids.people.push(data.id);
  return data.id;
}

async function main() {
  console.log(`fixtures: ${TAG}`);
  const future = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
  const { data: ev, error: evErr } = await supabase.from("events")
    .insert({ title: TAG, slug: TAG, status: "PUBLISHED", starts_at: future, timezone: "Europe/Stockholm" })
    .select("id").single();
  if (evErr) throw evErr;
  ids.events.push(ev.id);

  const rsvper = await makePerson("Rsvper");
  const other = await makePerson("Other");
  const waitlister = await makePerson("Waitlister");
  const pulled = await makePerson("Pulled");
  const stranger = await makePerson("Stranger");

  await supabase.from("rsvps").insert([
    { event_id: ev.id, person_id: rsvper, status: "confirmed", booking_status: "CONFIRMED", party_size: 1, slug: `${TAG}-r1` },
    { event_id: ev.id, person_id: other, status: "confirmed", booking_status: "CONFIRMED", party_size: 1, slug: `${TAG}-r2` },
    { event_id: ev.id, person_id: waitlister, status: "waitlist", booking_status: "WAITLIST", party_size: 1, slug: `${TAG}-r3` },
    { event_id: ev.id, person_id: pulled, status: "confirmed", pulled_up: true, booking_status: "CONFIRMED", party_size: 1, slug: `${TAG}-r4` },
  ]).throwOnError();

  console.log("\n1. Default permissions (nothing configured)");
  let a = await resolveEventAccess({ personId: rsvper, eventId: ev.id });
  ok(a.level === "guest_rsvp", `RSVP'd before start → guest_rsvp (got ${a.level})`);
  ok(a.permissions?.seeWho === true, "default lobby seeWho = true");
  ok(a.permissions?.read === true && a.permissions?.post === true, "default lobby read+post = true");
  ok(a.permissions?.upload === false, "default lobby upload = false");
  a = await resolveEventAccess({ personId: waitlister, eventId: ev.id });
  ok(a.level === "guest_waitlist", `waitlist → guest_waitlist (got ${a.level})`);
  ok(a.permissions?.post === false && a.permissions?.seeWho === true, "default waitlist: peek yes, post no");
  a = await resolveEventAccess({ personId: stranger, eventId: ev.id });
  ok(a.level === "no_access", `stranger → no_access (got ${a.level})`);

  console.log("\n2. seeWho roster for an RSVP'd guest (the user's exact case)");
  const roster = await getRoomRoster(ev.id);
  const hereIds = new Set(roster.here.map((p) => p.id));
  ok(roster.phase === "upcoming", `phase upcoming (got ${roster.phase})`);
  ok(hereIds.has(other) && hereIds.has(pulled), "lobby roster includes other coming + pulled-up");
  ok(!hereIds.has(waitlister), "waitlister not in 'here' (peek ≠ presence)");

  console.log("\n3. Host flips lobby seeWho OFF (the settings write path shape)");
  const grid = sanitizePermissions({
    waitlist: { read: true, seeWho: true },
    rsvp: { read: true, post: true, seeWho: false },
    pulledup: { read: true, post: true, seeWho: true, upload: true, download: true },
  });
  await supabase.from("events").update({ room_permissions: grid }).eq("id", ev.id).throwOnError();
  a = await resolveEventAccess({ personId: rsvper, eventId: ev.id });
  ok(a.permissions?.seeWho === false, "lobby seeWho now false");
  ok(a.permissions?.read === true, "lobby read still true");
  a = await resolveEventAccess({ personId: pulled, eventId: ev.id });
  ok(a.permissions?.seeWho === true, "pulled-up seeWho unaffected");

  console.log("\n4. Host closes lobby read entirely");
  const closed = sanitizePermissions({ rsvp: { read: false }, pulledup: {} });
  await supabase.from("events").update({ room_permissions: closed }).eq("id", ev.id).throwOnError();
  a = await resolveEventAccess({ personId: rsvper, eventId: ev.id });
  ok(a.permissions?.read === false, "lobby read off");
  const pulledCaps = resolveCapabilities({ room_permissions: closed }, "pulledup");
  ok(pulledCaps.read === true, "pulled-up read is inviolable even when config says off");

  console.log("\n5. Time phase: doors open (event started)");
  const started = new Date(Date.now() - 3600 * 1000).toISOString();
  await supabase.from("events").update({ starts_at: started, room_permissions: {} }).eq("id", ev.id).throwOnError();
  a = await resolveEventAccess({ personId: rsvper, eventId: ev.id });
  ok(a.level === "no_access" && a.reason === "event_started_no_pullup", `RSVP'd-never-showed after start → locked (got ${a.level}/${a.reason})`);
  a = await resolveEventAccess({ personId: pulled, eventId: ev.id });
  ok(a.level === "guest_pullup", `pulled-up after start → guest_pullup (got ${a.level})`);
  const roster2 = await getRoomRoster(ev.id);
  const here2 = new Set(roster2.here.map((p) => p.id));
  ok(here2.has(pulled) && !here2.has(rsvper), "ongoing roster narrows to pulled-up only");

  console.log("\n6. getRoomAccess wiring (what /p/:id/interior gates on)");
  const g = await getRoomAccess(pulled, ev.id);
  ok(g.access === "pulledup" && g.permissions?.seeWho === true, "interior gate: pulled-up + seeWho true");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}

async function cleanup() {
  for (const e of ids.events) {
    await supabase.from("rsvps").delete().eq("event_id", e);
    await supabase.from("events").delete().eq("id", e);
  }
  if (ids.people.length) await supabase.from("people").delete().in("id", ids.people);
  console.log("fixtures cleaned");
}

main().catch((e) => { console.error("ERROR:", e.message || e); process.exitCode = 1; }).finally(cleanup);
