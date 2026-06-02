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
import { recordPullUp, postSpaceMessage, getOrCreateMainChannel, createChannel } from "../src/services/pullupService.js";

if (process.env.PULLUP_SEED !== "1") {
  console.error("Refusing to run. This seeds fake pull-ups — set PULLUP_SEED=1 to confirm you mean it.");
  process.exit(1);
}

const HOST_ID = "f3394b03-c5a0-4e8a-b001-8ae2175c85ff"; // felix.civalero@gmail.com

// Two events on the lifecycle: one UPCOMING (teaser + pull-up live), one PASSED
// (pulled-up keep the room forever; RSVP-only who never showed get the
// "you didn't pull up" door).
const UPCOMING = {
  slug: "test-pull-up-room",
  title: "⚑ TEST — Pull Up Room (upcoming)",
  startsAt: () => new Date(Date.now() + 2 * 3600 * 1000).toISOString(),
  endsAt: () => null,
  people: [
    { email: "rsvp@pullup.test",      name: "Riley RSVP",     rsvp: true,  pullup: false },
    { email: "pulledup@pullup.test",  name: "Pia PulledUp",   rsvp: true,  pullup: true  },
    { email: "copresent@pullup.test", name: "Cole CoPresent", rsvp: true,  pullup: true  },
    { email: "walkin@pullup.test",    name: "Nadia WalkIn",   rsvp: false, pullup: true  },
  ],
};
const PASSED = {
  slug: "test-pull-up-room-past",
  title: "⚑ TEST — Pull Up Room (already happened)",
  startsAt: () => new Date(Date.now() - 26 * 3600 * 1000).toISOString(),
  endsAt: () => new Date(Date.now() - 22 * 3600 * 1000).toISOString(),
  people: [
    { email: "pastrsvp@pullup.test",     name: "Sam NoShow",    rsvp: true, pullup: false }, // → rejection
    { email: "pastpulledup@pullup.test", name: "Eve Showed",    rsvp: true, pullup: true  }, // → still in, forever
  ],
};
const EVENTS = [UPCOMING, PASSED];
const TEST_EMAILS = EVENTS.flatMap((e) => e.people.map((p) => p.email));
const TEST_SLUGS = EVENTS.map((e) => e.slug);

async function clean() {
  const { data: evs } = await supabase.from("events").select("id").in("slug", TEST_SLUGS);
  for (const e of evs || []) await supabase.from("events").delete().eq("id", e.id); // cascades pullups + space + rsvps
  await supabase.from("people").delete().in("email", TEST_EMAILS); // cascades their pullups / person_events / rsvps
  console.log("🧹 cleaned: test events + people removed.");
}

async function seedEvent(cfg) {
  const { data: ev, error: evErr } = await supabase
    .from("events")
    .insert({ slug: cfg.slug, title: cfg.title, host_id: HOST_ID, starts_at: cfg.startsAt(), ends_at: cfg.endsAt(), timezone: "Europe/Stockholm", status: "PUBLISHED", location: "The Test Venue" })
    .select("id")
    .single();
  if (evErr) { console.error(`event insert failed (${cfg.slug}):`, evErr.message); process.exit(1); }
  const eventId = ev.id;
  const ids = {};
  for (const p of cfg.people) {
    const { data: person } = await supabase.from("people").insert({ email: p.email, name: p.name }).select("id").single();
    ids[p.email] = person.id;
    if (p.rsvp) await supabase.from("rsvps").insert({ person_id: person.id, event_id: eventId, slug: cfg.slug, booking_status: "CONFIRMED", status: "attending", party_size: 1 });
    if (p.pullup) await recordPullUp({ personId: person.id, eventId, method: "scan", hostId: HOST_ID });
  }
  return { eventId, ids };
}

async function seed() {
  await clean(); // idempotent — start fresh

  const up = await seedEvent(UPCOMING);
  const upMain = await getOrCreateMainChannel(up.eventId);
  await postSpaceMessage({ eventId: up.eventId, channelId: upMain.id, personId: up.ids["pulledup@pullup.test"], authorName: "Pia PulledUp", body: "made it — this room is unreal" });
  await postSpaceMessage({ eventId: up.eventId, channelId: upMain.id, personId: up.ids["copresent@pullup.test"], authorName: "Cole CoPresent", body: "who's still here after?" });
  // A host-curated topic, with a beat in it.
  const groupShot = await createChannel({ eventId: up.eventId, name: "Group shot", createdBy: HOST_ID });
  if (groupShot.ok) await postSpaceMessage({ eventId: up.eventId, channelId: groupShot.channel.id, personId: up.ids["copresent@pullup.test"], authorName: "Cole CoPresent", body: "did anyone get the one on the stairs?" });

  const past = await seedEvent(PASSED);
  const pastMain = await getOrCreateMainChannel(past.eventId);
  await postSpaceMessage({ eventId: past.eventId, channelId: pastMain.id, personId: past.ids["pastpulledup@pullup.test"], authorName: "Eve Showed", body: "still thinking about last night" });

  console.log("\n✅ Seeded the test world (2 events on the lifecycle).\n");
  console.log("   UPCOMING event id:", up.eventId);
  console.log("   PASSED   event id:", past.eventId, "\n");
  console.log("   Walk it (login as felix for HOST views):");
  console.log("   • HOST event room:        /app/events/" + up.eventId + "/room   (real space + messages)");
  console.log("   • HOST live QR:           /app/events/" + up.eventId + "/checkin");
  console.log("   • HOST global Room:       /room\n");
  console.log("   UPCOMING — /p/" + up.eventId);
  console.log("     · RSVP → locked door:        rsvp@pullup.test");
  console.log("     · pulled-up re-enters:       pulledup@pullup.test");
  console.log("     · co-present sees others:    copresent@pullup.test");
  console.log("     · pull up for real: open the live QR, scan with your phone, any email\n");
  console.log("   PASSED — /p/" + past.eventId);
  console.log("     · RSVP-only → REJECTION:     pastrsvp@pullup.test   (\"you didn't pull up\")");
  console.log("     · pulled-up → STILL IN:      pastpulledup@pullup.test   (the bead persists)\n");
  process.exit(0);
}

if (process.argv.includes("--clean")) { await clean(); process.exit(0); }
await seed();
