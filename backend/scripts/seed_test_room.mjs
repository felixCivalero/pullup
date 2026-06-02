// backend/scripts/seed_test_room.mjs
//
// DEV-ONLY test-world seeder. Builds one isolated "⚑ TEST — Pull Up Room" event
// with people at every stage so you can walk all the personas:
//   • RSVP-only (intent, no key)         → sees the locked door
//   • pulled-up                          → in the room, can re-enter by identity
//   • a second pulled-up                 → co-presence + the mesh conversation
//   • a walk-in (pull-up, never RSVP'd)
//
// ⚠️  This writes FAKE pull-ups — exactly the "couch-fake" the live product
// forbids. It is a sibling of the host manual override, more dangerous in bulk.
// So it is a MANUAL OPERATOR SCRIPT, never an HTTP route, and refuses to run
// without an explicit opt-in flag:
//
//   PULLUP_SEED=1 node scripts/seed_test_room.mjs          # seed
//   PULLUP_SEED=1 node scripts/seed_test_room.mjs --clean  # remove everything it made
//
// All data lives under @pullup.test + slug `test-pull-up-room`, so it's trivial
// to find and delete.

import { supabase } from "../src/supabase.js";
import { recordPullUp, postSpaceMessage } from "../src/services/pullupService.js";

if (process.env.PULLUP_SEED !== "1") {
  console.error("Refusing to run. This seeds fake pull-ups — set PULLUP_SEED=1 to confirm you mean it.");
  process.exit(1);
}

const HOST_ID = "f3394b03-c5a0-4e8a-b001-8ae2175c85ff"; // felix.civalero@gmail.com
const SLUG = "test-pull-up-room";
const PEOPLE = [
  { email: "rsvp@pullup.test",      name: "Riley RSVP",      rsvp: true,  pullup: false },
  { email: "pulledup@pullup.test",  name: "Pia PulledUp",    rsvp: true,  pullup: true  },
  { email: "copresent@pullup.test", name: "Cole CoPresent",  rsvp: true,  pullup: true  },
  { email: "walkin@pullup.test",    name: "Nadia WalkIn",    rsvp: false, pullup: true  },
];
const TEST_EMAILS = PEOPLE.map((p) => p.email);

async function findEvent() {
  const { data } = await supabase.from("events").select("id").eq("slug", SLUG).maybeSingle();
  return data?.id || null;
}

async function clean() {
  const eventId = await findEvent();
  if (eventId) await supabase.from("events").delete().eq("id", eventId); // cascades pullups + space messages + rsvps
  // Deleting the people cascades their pullups / person_events / rsvps too.
  await supabase.from("people").delete().in("email", TEST_EMAILS);
  console.log("🧹 cleaned: test event + people removed.");
}

async function seed() {
  await clean(); // idempotent — start fresh

  const startsAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const { data: ev, error: evErr } = await supabase
    .from("events")
    .insert({ slug: SLUG, title: "⚑ TEST — Pull Up Room", host_id: HOST_ID, starts_at: startsAt, timezone: "Europe/Stockholm", status: "PUBLISHED", location: "The Test Venue" })
    .select("id")
    .single();
  if (evErr) { console.error("event insert failed:", evErr.message); process.exit(1); }
  const eventId = ev.id;

  const ids = {};
  for (const p of PEOPLE) {
    const { data: person } = await supabase.from("people").insert({ email: p.email, name: p.name }).select("id").single();
    ids[p.email] = person.id;
    if (p.rsvp) {
      await supabase.from("rsvps").insert({ person_id: person.id, event_id: eventId, slug: SLUG, booking_status: "CONFIRMED", status: "attending", party_size: 1 });
    }
    if (p.pullup) {
      await recordPullUp({ personId: person.id, eventId, method: "scan", hostId: HOST_ID });
    }
  }

  // A little life in the mesh.
  await postSpaceMessage({ eventId, personId: ids["pulledup@pullup.test"], authorName: "Pia PulledUp", body: "made it — this room is unreal" });
  await postSpaceMessage({ eventId, personId: ids["copresent@pullup.test"], authorName: "Cole CoPresent", body: "who's still here after?" });

  console.log("\n✅ Seeded the test world.\n");
  console.log("   Event id:", eventId);
  console.log("   Slug:    ", SLUG, "\n");
  console.log("   Walk it:");
  console.log("   • HOST room (login as felix):     /app/events/" + eventId + "/room   (real space + messages)");
  console.log("   • HOST live QR:                   /app/events/" + eventId + "/checkin");
  console.log("   • HOST global room:               /room");
  console.log("   • RSVP sees the LOCKED door:      /p/" + eventId + "   → enter rsvp@pullup.test");
  console.log("   • PULLED-UP re-enters (no code):  /p/" + eventId + "   → enter pulledup@pullup.test");
  console.log("   • CO-PRESENT sees the others:     /p/" + eventId + "   → enter copresent@pullup.test");
  console.log("   • Pull up for real: open the live QR, scan with your phone, enter any email.\n");
  process.exit(0);
}

if (process.argv.includes("--clean")) { await clean(); process.exit(0); }
await seed();
