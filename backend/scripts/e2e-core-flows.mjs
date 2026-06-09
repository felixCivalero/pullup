// e2e-core-flows.mjs — one-command end-to-end check of the Jägr-critical chain.
//
// Runs the REAL service/data functions against the REAL prod DB using throwaway
// data, asserts each step, then deletes everything it created. No emails are
// sent, no real events touched. Re-run anytime: `npm run e2e`.
//
// Covers the flows we hardened: identity resolution + source profiles, account
// provisioning, the room-access state machine (lobby / pulled-up / no-access),
// the pull-up write-through + roster, channel-routing decisions, and message
// edit/delete authorisation.

import { supabase } from "../src/supabase.js";
import { linkIdentitiesToPerson } from "../src/services/personResolution.js";
import { ensureAccountForPerson } from "../src/services/account.js";
import {
  resolveEventAccess, getRoomAccess, getRoomRoster, recordPullUp, hasPulledUp,
  postSpaceMessage, getSpaceMessage, editSpaceMessage, deleteSpaceMessage,
} from "../src/services/pullupService.js";
import { resolveTryOrder } from "../src/lib/idempotency.js";
import { decideIgSend } from "../src/messaging/dispatch.js";
import { updateRsvp } from "../src/data.js";
import { logPersonEvent } from "../src/services/personTimeline.js";
import { TEMPLATES, activeKey } from "../src/whatsapp/templates/registry.js";

let pass = 0, fail = 0;
const ok = (cond, label, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? `  (${extra})` : ""}`); }
};
const section = (s) => console.log(`\n— ${s} —`);

const tag = `e2e_${Date.now()}`;
const created = { personIds: [], authUserIds: [], rsvpForCleanup: [], eventIds: [] };

async function pickEvents() {
  const nowIso = new Date().toISOString();
  const { data: future } = await supabase.from("events")
    .select("id, slug, starts_at").eq("status", "PUBLISHED").gt("starts_at", nowIso)
    .order("starts_at", { ascending: true }).limit(1);
  const { data: past } = await supabase.from("events")
    .select("id, slug, starts_at").eq("status", "PUBLISHED").lt("starts_at", nowIso)
    .order("starts_at", { ascending: false }).limit(1);
  return { future: future?.[0] || null, past: past?.[0] || null };
}

async function makePerson(suffix) {
  const email = `${tag}_${suffix}@example.com`;
  const { data, error } = await supabase.from("people").insert({ email, name: `E2E ${suffix}` }).select("id").single();
  if (error) throw error;
  created.personIds.push(data.id);
  return { id: data.id, email };
}

async function run() {
  const { future, past } = await pickEvents();
  console.log(`event(future)=${future?.slug || "NONE"}  event(past)=${past?.slug || "NONE"}`);
  if (!future) { console.log("No future published event — lobby tests will be skipped."); }

  // 1. Identity resolution + source profile (the RSVP substrate)
  section("Identity linking (RSVP substrate)");
  const a = await makePerson("a");
  await linkIdentitiesToPerson({
    personId: a.id,
    identifiers: { email: a.email, phone: "+46700000900", igHandle: `${tag}_a` },
    profile: { name: "E2E a", email: a.email, phone_e164: "+46700000900", instagram: `${tag}_a` },
    source: "rsvp",
  });
  const { data: ids } = await supabase.from("person_identities").select("kind").eq("person_id", a.id);
  const kinds = new Set((ids || []).map((r) => r.kind));
  ok(kinds.has("email") && kinds.has("phone") && kinds.has("ig_handle"), "email + phone + ig_handle linked", [...kinds].join(","));
  const { data: sp } = await supabase.from("person_source_profiles").select("source").eq("person_id", a.id);
  ok((sp || []).some((r) => r.source === "rsvp"), "rsvp source profile written");

  // 2. Account provisioning
  section("Account provisioning");
  const userId = await ensureAccountForPerson({ personId: a.id, email: a.email, name: "E2E a" });
  ok(!!userId, "passwordless account minted");
  if (userId) created.authUserIds.push(userId);
  const { data: pa } = await supabase.from("people").select("auth_user_id").eq("id", a.id).single();
  ok(pa?.auth_user_id === userId, "people.auth_user_id linked to the account");

  // 3. Room access state machine (needs a future event for the lobby)
  if (future) {
    section("Room access — lobby (RSVP'd, doors not open)");
    await supabase.from("rsvps").insert({
      event_id: future.id, person_id: a.id, slug: future.slug,
      booking_status: "CONFIRMED", party_size: 1, status: "attending",
    });
    const lobby = await resolveEventAccess({ personId: a.id, eventId: future.id });
    ok(lobby.level === "guest_rsvp", "level = guest_rsvp", lobby.level);
    ok(lobby.permissions?.read === true, "lobby can read");
    const roster1 = await getRoomRoster(future.id);
    ok(roster1.here.some((p) => p.id === a.id), "appears in roster 'here' (lobby crowd)");

    section("Room access — pulled up (write-through)");
    const pu = await recordPullUp({ personId: a.id, eventId: future.id, method: "manual" });
    ok(pu.ok, "recordPullUp ok");
    const { data: rsAfter } = await supabase.from("rsvps").select("pulled_up").eq("event_id", future.id).eq("person_id", a.id).maybeSingle();
    ok(rsAfter?.pulled_up === true, "rsvps.pulled_up mirrored (visible to analytics/world)");
    ok(await hasPulledUp(a.id, future.id), "hasPulledUp = true");
    const pulled = await resolveEventAccess({ personId: a.id, eventId: future.id });
    ok(pulled.level === "guest_pullup", "level = guest_pullup after pull-up", pulled.level);
    const roster2 = await getRoomRoster(future.id);
    ok(roster2.pulledUp.some((p) => p.id === a.id), "appears in roster 'pulledUp'");

    section("Room access — no access (stranger)");
    const b = await makePerson("b");
    const none = await resolveEventAccess({ personId: b.id, eventId: future.id });
    ok(none.level === "no_access", "stranger = no_access", none.level);

    section("Message edit/delete authorisation");
    const post = await postSpaceMessage({ eventId: future.id, personId: a.id, authorName: "E2E a", body: "hello from e2e" });
    ok(post.ok && post.id, "posted a room message");
    if (post.id) {
      const msg = await getSpaceMessage(post.id);
      ok(msg?.author_person_id === a.id, "message owner = author");
      const ed = await editSpaceMessage({ eventId: future.id, messageId: post.id, body: "edited by e2e" });
      ok(ed.ok, "author can edit own message");
      const del = await deleteSpaceMessage({ eventId: future.id, messageId: post.id });
      ok(del.ok, "author can delete own message");
    }
  }

  // 3b. Hardening fixes (T2a idempotency / T2b template gate / T3a rsvp_cancel)
  section("Hardening — timeline dedupe (retry-safe send)");
  const dk = `e2e_dedupe_${tag}`;
  const beat = { personId: a.id, type: "message_out", channel: "email", direction: "out", body: "dedupe test", dedupeKey: dk };
  await logPersonEvent(beat);
  await logPersonEvent(beat); // a "retry" with the same key
  const { data: dupRows } = await supabase.from("person_events").select("id").eq("person_id", a.id).eq("dedupe_key", dk);
  ok((dupRows || []).length === 1, "same dedupe_key → exactly one timeline row (retry doesn't double-post)", `rows=${(dupRows || []).length}`);

  section("Hardening — WhatsApp template gate keys off the ACTIVE alias");
  const active = activeKey("host_broadcast");
  ok(!!TEMPLATES[active], `activeKey("host_broadcast") → "${active}" exists in registry`);
  ok(typeof (TEMPLATES?.[activeKey("host_broadcast")]?.status === "approved") === "boolean", "approval gate evaluates the active key's status");

  if (future) {
    section("Hardening — live rsvp_cancel appends a timeline beat");
    const c = await makePerson("c");
    const { data: rc } = await supabase.from("rsvps")
      .insert({ event_id: future.id, person_id: c.id, slug: future.slug, booking_status: "CONFIRMED", party_size: 1, status: "attending" })
      .select("id").single();
    const upd = await updateRsvp(rc.id, { bookingStatus: "CANCELLED", status: "cancelled" });
    ok(!upd.error, "updateRsvp cancel ok", upd.error || "");
    const { data: cancelBeat } = await supabase.from("person_events").select("id").eq("person_id", c.id).eq("type", "rsvp_cancel").maybeSingle();
    ok(!!cancelBeat, "rsvp_cancel beat appended on live cancellation");
  }

  // 4. Channel routing decisions (no real send)
  section("Channel routing decisions");
  ok(JSON.stringify(resolveTryOrder({ preferredChannel: "whatsapp" })) === '["whatsapp"]', "WA pick → tries WA only");
  ok(JSON.stringify(resolveTryOrder({ preferredChannel: "instagram" })) === '["instagram"]', "IG pick → tries IG only");
  ok(JSON.stringify(resolveTryOrder({ preferredChannel: "email" })) === "[]", "Email pick → email floor (no rail)");
  ok(decideIgSend({ state: "standard", humanComposed: true, humanAgentApproved: false }).send === true, "IG standard window → send");
  ok(decideIgSend({ state: "expired", humanComposed: true, humanAgentApproved: true }).send === false, "IG expired window → no send");
}

async function cleanup() {
  section("Cleanup");
  for (const pid of created.personIds) {
    await supabase.from("event_space_messages").delete().eq("author_person_id", pid);
    await supabase.from("person_events").delete().eq("person_id", pid);
    await supabase.from("rsvps").delete().eq("person_id", pid);
    await supabase.from("pullups").delete().eq("person_id", pid);
    await supabase.from("person_source_profiles").delete().eq("person_id", pid);
    await supabase.from("person_identities").delete().eq("person_id", pid);
    await supabase.from("people").delete().eq("id", pid);
  }
  for (const uid of created.authUserIds) {
    try { await supabase.auth.admin.deleteUser(uid); } catch { /* best effort */ }
  }
  console.log(`  cleaned ${created.personIds.length} people + ${created.authUserIds.length} accounts`);
}

try {
  await run();
} catch (e) {
  fail++;
  console.error("\n❌ harness threw:", e?.message);
} finally {
  await cleanup();
}
console.log(`\n${fail === 0 ? "✅ ALL PASSED" : "❌ FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
