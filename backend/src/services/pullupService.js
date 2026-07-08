// backend/src/services/pullupService.js
//
// The PullUp core: verified physical presence, and everything derived from it
// (room membership, co-presence). This module owns the integrity-critical
// verification mechanism — the one thing the whole relational model rests on.
//
// THE MECHANISM (rotating QR, authenticator-style):
//   - Each event holds a server-only `qr_rotating_secret` (minted lazily).
//   - Time is sliced into fixed STEP-second windows. The current check-in code
//     is HMAC(secret, `${eventId}:${window}`) for the current window.
//   - The host's live check-in screen renders that code as a QR and refreshes
//     it every window. The code is valid only for the current window (plus one
//     window of grace for clock skew / scan latency).
//   - A guest scans the host's LIVE screen in person. A screenshot is stale
//     within ~STEP seconds — there is no static code to forward. "Pulled up
//     from the couch" is structurally impossible.
//   - The secret never leaves the server; clients only ever see short-lived
//     signatures, which reveal nothing and expire.
//
// Self-serve by default (guest registers their own pull-up). Manual override
// exists for no-phone / dead-battery cases: the host vouches, making them the
// trust-root for their own room — faking only pollutes their own room.

import crypto from "node:crypto";
import { supabase } from "../supabase.js";
import { logPersonEvent } from "./personTimeline.js";
import { resolveCapabilities } from "./roomPermissions.js";
import { isUserEventHost } from "../data.js";
import { generateWaitlistToken, verifyWaitlistToken } from "../utils/waitlistTokens.js";

// Window length for the rotating code. Short enough that a screenshot is
// useless within seconds; long enough to absorb scan latency. One window of
// grace (PREVIOUS window also accepted) covers the hand-off / clock skew.
export const STEP_SECONDS = 15;
const SIG_LEN = 20; // hex chars of the HMAC kept in the code — plenty of entropy

function windowFor(ms) {
  return Math.floor(ms / 1000 / STEP_SECONDS);
}

function signWindow(secret, eventId, win) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${eventId}:${win}`)
    .digest("hex")
    .slice(0, SIG_LEN);
}

function constantTimeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ── Per-event rotating secret ──────────────────────────────────────────────
// Minted lazily the first time a host opens the check-in screen. Stored on the
// event, never sent to a client.
export async function getOrCreateEventSecret(eventId) {
  const { data, error } = await supabase
    .from("events")
    .select("qr_rotating_secret, host_id")
    .eq("id", eventId)
    .single();
  if (error || !data) throw new Error(`event_not_found: ${eventId}`);
  if (data.qr_rotating_secret) return { secret: data.qr_rotating_secret, hostId: data.host_id };

  const secret = crypto.randomBytes(32).toString("base64url");
  const { error: upErr } = await supabase
    .from("events")
    .update({ qr_rotating_secret: secret })
    .eq("id", eventId)
    .is("qr_rotating_secret", null); // don't clobber a racing mint
  if (upErr) throw new Error(`secret_mint_failed: ${upErr.message}`);

  // Re-read in case a concurrent request won the mint race.
  const { data: fresh } = await supabase
    .from("events")
    .select("qr_rotating_secret, host_id")
    .eq("id", eventId)
    .single();
  return { secret: fresh?.qr_rotating_secret || secret, hostId: fresh?.host_id || data.host_id };
}

// The code the host's live screen should display right now. Returns the
// relative scan path + when this code expires so the client knows when to
// refresh. nowMs is injectable for testing.
export async function currentCheckinCode(eventId, nowMs = Date.now()) {
  const { secret, hostId } = await getOrCreateEventSecret(eventId);
  const win = windowFor(nowMs);
  const sig = signWindow(secret, eventId, win);
  const expiresAtMs = (win + 1) * STEP_SECONDS * 1000;
  return {
    eventId,
    hostId,
    window: win,
    sig,
    // The guest's scanner opens this path on pullup.se. Public landing: the one
    // event Room, with the rotating code as proof so they pull up on arrival.
    path: `/events/${eventId}/room?w=${win}&s=${sig}`,
    stepSeconds: STEP_SECONDS,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresInMs: expiresAtMs - nowMs,
  };
}

// Validate a scanned code. Accepts the current window and the immediately
// previous one (grace for the scan/clock gap). Returns { valid, reason }.
export async function verifyCheckinCode(eventId, scannedWindow, scannedSig, nowMs = Date.now()) {
  const win = Number(scannedWindow);
  if (!Number.isFinite(win) || !scannedSig) return { valid: false, reason: "malformed" };

  const nowWin = windowFor(nowMs);
  // Accept the current window + the two prior (~45s total) — enough for the
  // guest to scan and type the email they RSVP'd with, still stale within
  // seconds so a forwarded screenshot is dead. Anything older → expired.
  if (win > nowWin || win < nowWin - 2) return { valid: false, reason: "expired" };

  const { secret } = await getOrCreateEventSecret(eventId);
  const expected = signWindow(secret, eventId, win);
  if (!constantTimeEqual(scannedSig, expected)) return { valid: false, reason: "bad_signature" };
  return { valid: true };
}

// ── Presence pass ───────────────────────────────────────────────────────────
// THE fix for the 45s-vs-sign-in race: the rotating code lives ~45 seconds, but
// a walk-in with no session must sign in first (email magic-link / OAuth — far
// longer than 45s), so the code was always dead by the time the pull-up posted.
// Zero scans ever recorded in prod because of this.
//
// A presence pass decouples the two factors. It is minted ONLY after a live
// code verifies (so the anti-screenshot property holds — you still need a fresh
// scan to get one), then certifies "presence proven at the door for THIS event"
// for a window long enough to outlast the sign-in detour. Identity is still
// proven separately by the session; the pass never says WHO, only "was here".
//
// Reuses the short-lived host-action JWT family (waitlist/VIP/media) so no new
// secret is needed on the box — gated by a dedicated `type` so a leaked VIP or
// media token can never double as a fake door pass.
const PRESENCE_PASS_TYPE = "presence_pass";
const PRESENCE_PASS_TTL = "15m";

export function mintPresencePass(eventId) {
  return generateWaitlistToken(
    { type: PRESENCE_PASS_TYPE, eventId },
    { expiresIn: PRESENCE_PASS_TTL },
  );
}

export function verifyPresencePass(eventId, pass) {
  if (!pass) return { valid: false, reason: "missing" };
  let decoded;
  try {
    decoded = verifyWaitlistToken(pass);
  } catch (err) {
    return { valid: false, reason: err.message === "Token expired" ? "expired" : "bad_pass" };
  }
  if (decoded?.type !== PRESENCE_PASS_TYPE) return { valid: false, reason: "wrong_type" };
  if (decoded?.eventId !== eventId) return { valid: false, reason: "wrong_event" };
  return { valid: true };
}

// ── Recording a pull-up ─────────────────────────────────────────────────────
// Idempotent: a re-scan (same person, same event) is a no-op, not a duplicate.
// On the FIRST pull-up we append an `attended` beat to the person's timeline.
export async function recordPullUp({ personId, eventId, method = "scan", hostId = null, createdBy = null }) {
  if (!personId || !eventId) return { ok: false, reason: "missing_ids" };

  // Already pulled up? Idempotent — but still mirror to rsvps below (self-heals
  // a pull-up recorded before the write-through existed).
  const { data: existing } = await supabase
    .from("pullups")
    .select("id")
    .eq("person_id", personId)
    .eq("event_id", eventId)
    .maybeSingle();

  let pullupId = existing?.id || null;
  let isNew = false;
  if (!existing) {
    const { data, error } = await supabase
      .from("pullups")
      .insert({ person_id: personId, event_id: eventId, method, created_by: createdBy })
      .select("id")
      .single();
    if (error) {
      // A concurrent scan may have inserted first — unique-violation = success.
      if (error.code !== "23505") return { ok: false, reason: error.message };
    } else {
      pullupId = data.id;
      isNew = true;
    }
  }

  // SINGLE SOURCE OF TRUTH: mirror the pull-up onto rsvps.pulled_up. The room's
  // read path was unified earlier (hasPulledUp / getRoomRoster read pullups ∪
  // rsvps.pulled_up), but analytics, the /r world graph, and pull-up counts read
  // ONLY rsvps.pulled_up — so a QR-door pull-up that wrote only the pullups table
  // was invisible to them. This closes the write side. Best-effort.
  await mirrorPullUpToRsvp(personId, eventId);

  // First pull-up → append the timeline beat (only on a genuinely new record).
  if (isNew) {
    let resolvedHost = hostId;
    if (!resolvedHost) {
      const { data: ev } = await supabase.from("events").select("host_id").eq("id", eventId).single();
      resolvedHost = ev?.host_id || null;
    }
    await logPersonEvent({
      personId,
      type: "attended",
      hostId: resolvedHost,
      eventId,
      channel: "web",
      body: method === "manual" ? "Pulled up (checked in by host)" : "Pulled up",
      metadata: { method },
    });

    // Meter the motion on the transaction ledger (flag-gated inside, never
    // throws). A pull-up is THE billable unit of the free-event business
    // model; the dedupe key makes a re-scan a metering no-op too.
    try {
      const { meterPullup } = await import("./billing/feeEngine.js");
      await meterPullup({ hostId: resolvedHost, eventId, personId });
    } catch (meterErr) {
      console.error("[pullup] metering failed (non-blocking):", meterErr?.message);
    }
  }

  return { ok: true, alreadyPresent: !isNew, pullupId };
}

// Mirror a pull-up onto rsvps.pulled_up (the canonical signal every analytics /
// world-graph / count reader keys off). If the person RSVP'd, flip the flag on
// their row; if they walked in with no RSVP (QR door allows it), create the
// minimal attending+pulled_up row so they're counted like everyone who showed.
// No rsvps trigger fires anything but updated_at, so this is side-effect-free.
async function mirrorPullUpToRsvp(personId, eventId) {
  try {
    const { data: rows } = await supabase
      .from("rsvps")
      .select("id, pulled_up")
      .eq("event_id", eventId)
      .eq("person_id", personId)
      .order("created_at", { ascending: true })
      .limit(1);
    const rs = rows?.[0];
    if (rs) {
      if (rs.pulled_up !== true) {
        await supabase.from("rsvps").update({ pulled_up: true }).eq("id", rs.id);
      }
      return;
    }
    // Walk-in (no RSVP) — mint the minimal confirmed+pulled_up row.
    const { data: ev } = await supabase.from("events").select("slug").eq("id", eventId).maybeSingle();
    const { error } = await supabase.from("rsvps").insert({
      event_id: eventId,
      person_id: personId,
      slug: ev?.slug || null,
      booking_status: "CONFIRMED",
      party_size: 1,
      status: "attending",
      pulled_up: true,
    });
    if (error) {
      // A concurrent path (a parallel scan, or an RSVP landing the same instant)
      // created the row first — rsvps now has UNIQUE(event_id, person_id), so this
      // is a benign race: just make sure the flag is set.
      if (error.code === "23505") {
        await supabase.from("rsvps").update({ pulled_up: true }).eq("event_id", eventId).eq("person_id", personId);
      } else {
        console.error("[pullup] rsvp mirror insert failed:", error.message);
      }
    }
  } catch (e) {
    console.error("[pullup] rsvp mirror failed:", e?.message);
  }
}

// ── Derived relations (computed, never stored) ──────────────────────────────

// pullup_count — how many events this person has pulled up to.
export async function getPullupCount(personId) {
  const { count } = await supabase
    .from("pullups")
    .select("id", { count: "exact", head: true })
    .eq("person_id", personId);
  return count || 0;
}

// created_count — how many events this node has hosted (by host profile id).
export async function getCreatedCount(hostProfileId) {
  if (!hostProfileId) return 0;
  const { count } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("host_id", hostProfileId);
  return count || 0;
}

// The two-count identity signal for a profile card. hostProfileId is the
// person's own host account, when they have one.
export async function getProfileCounts({ personId, hostProfileId = null }) {
  const [pullupCount, createdCount] = await Promise.all([
    getPullupCount(personId),
    getCreatedCount(hostProfileId),
  ]);
  return { pullupCount, createdCount };
}

// Membership: a person is "in a host's room" once they've pulled up to ANY
// event that host owns. Returns the distinct set of host ids whose rooms this
// person belongs to.
export async function getRoomHostIdsForPerson(personId) {
  const { data, error } = await supabase
    .from("pullups")
    .select("events:event_id ( host_id )")
    .eq("person_id", personId);
  if (error || !data) return [];
  return [...new Set(data.map((r) => r.events?.host_id).filter(Boolean))];
}

export async function isMemberOfRoom(personId, hostProfileId) {
  const ids = await getRoomHostIdsForPerson(personId);
  return ids.includes(hostProfileId);
}

// Co-presence is PER-EVENT: two people are co-present iff they share a pull-up
// on the SAME event. This is the only thing that switches on lateral comms —
// people who attended *different* events of the same host are NOT connected.
// Returns the person ids co-present with `personId` at `eventId` (empty unless
// `personId` themselves pulled up to that event — you can't see a room you
// didn't enter).
// Did this person pull up to this event? The durable gate for room access and
// for the event space. A pull-up = proof of presence, and it can be recorded by
// EITHER path: the rotating-QR door scan (the `pullups` table) or a host
// check-in (`rsvps.pulled_up = true`). Both mean "they showed and earned the
// room", so the gate honours whichever recorded it — otherwise a guest the host
// checked in is wrongly locked out once the doors open. (In prod today 100% of
// pull-ups live on rsvps.pulled_up; the pullups table is the newer QR path.)
export async function hasPulledUp(personId, eventId) {
  if (!personId || !eventId) return false;
  const { data: up } = await supabase
    .from("pullups").select("id").eq("person_id", personId).eq("event_id", eventId).maybeSingle();
  if (up) return true;
  const { data: rs } = await supabase
    .from("rsvps").select("id").eq("person_id", personId).eq("event_id", eventId).eq("pulled_up", true).maybeSingle();
  return !!rs;
}

// ── The time-phased room gate ───────────────────────────────────────────────
// An RSVP is a key that ONLY works before the doors open. Until starts_at the
// room is a lobby: anyone who RSVP'd can walk in to prep. At starts_at the event
// goes "ongoing" and the lobby closes — from then on a PullUp (proof of physical
// presence) is the only key. RSVP'd-but-never-pulled-up after start is locked
// out of the event room and falls back to the host's profile. Pulled up = in
// forever (the bead is earned, never expires).
export function computeEventPhase(startsAt, endsAt, nowMs = Date.now()) {
  const starts = startsAt ? new Date(startsAt).getTime() : null;
  // No explicit end → treat the night as ~12h from the start (matches teaser).
  const end = endsAt ? new Date(endsAt).getTime() : (starts != null ? starts + 12 * 3600 * 1000 : null);
  if (starts == null) return "upcoming";        // no date set → forever-upcoming (lobby open)
  if (nowMs < starts) return "upcoming";
  if (end != null && nowMs > end) return "ended";
  return "ongoing";
}

// Returns { access, phase, reason? }.
//   access "pulledup" → showed up; full + permanent.
//   access "lobby"    → before start + RSVP'd; prep access (closes at start).
//   access "locked"   → reason "event_started_no_pullup" (RSVP'd, missed the
//                       pull-up — stuck at the profile) | "not_invited" |
//                       "no_identity".
export async function getRoomAccess(personId, eventId, nowMs = Date.now()) {
  if (!personId || !eventId) return { access: "locked", reason: "no_identity", phase: "upcoming" };

  const { data: ev } = await supabase
    .from("events").select("starts_at, ends_at, room_permissions").eq("id", eventId).maybeSingle();
  const phase = computeEventPhase(ev?.starts_at, ev?.ends_at, nowMs);

  // Pulled up → in, always (earned, never expires). Capabilities = host's
  // pulled-up config (read is always on for the pulled-up state).
  if (await hasPulledUp(personId, eventId)) {
    return { access: "pulledup", phase, permissions: resolveCapabilities(ev, "pulledup") };
  }

  // Not pulled up — does an active RSVP let them in?
  const { data: rs } = await supabase
    .from("rsvps").select("id, status, booking_status").eq("person_id", personId).eq("event_id", eventId).maybeSingle();
  const rsvped = !!rs && rs.status !== "cancelled";
  // Waitlist is still "in" before the event — just a lower-key state the host
  // configures separately (peek, not take part, by default).
  const isWaitlist = rsvped && (rs.status === "waitlist" || rs.booking_status === "WAITLIST");

  // doors not open yet → the lobby (or the waitlist peek), with the host's
  // capabilities for that state.
  if (rsvped && phase === "upcoming") {
    const state = isWaitlist ? "waitlist" : "lobby";
    return { access: state, phase, permissions: resolveCapabilities(ev, state) };
  }
  if (rsvped) return { access: "locked", reason: "event_started_no_pullup", phase }; // started/over, never showed
  return { access: "locked", reason: "not_invited", phase };
}

// ── THE permission gate ──────────────────────────────────────────────────
// One resolver for "what can this viewer do in this event," reused across the
// whole platform. It collapses host-ownership + the time-phased room gate into
// a single level vocabulary the frontend reads everywhere:
//   host         → owns the event (gets Guests / Insights / Edit + the room)
//   guest_pullup → pulled up; full + permanent room access
//   guest_rsvp   → RSVP'd, doors not open yet (the pre-event lobby)
//   no_access    → not in; `reason` says why (not_invited / event_started_no_pullup
//                  / no_identity) so the UI can say it nicely and point the way in.
// `permissions` carries the host's per-state capability config for the room.
export async function resolveEventAccess({ userId = null, personId = null, eventId, nowMs = Date.now() }) {
  if (!eventId) return { level: "no_access", reason: "no_event" };
  // Ownership trumps presence — a host is a host even before anyone pulls up.
  // We carry the SUB-ROLE (owner / co_host / editor / reception / analytics) so
  // the UI can show the right chrome (analytics ≠ full host) instead of flattening.
  if (userId) {
    const { isHost, role } = await isUserEventHost(userId, eventId);
    if (isHost) return { level: "host", role: role || "owner", reason: null };
  }
  if (!personId) {
    // No verified session. A browser only holds one by proving the inbox
    // (magic link) or logging in, so "no session" == "unverified". Offer a
    // READ-ONLY PREVIEW of the room shell — but only when the room's lobby is
    // readable; a host who closed lobby read wants a hard verify wall, not a
    // peek. Preview NEVER carries a social capability: post/seeWho/upload/
    // download all require a verified session, enforced by the state machine
    // AND the write routes (which reject a request with no resolved person).
    if (!userId) {
      const { data: pv } = await supabase
        .from("events").select("status, room_permissions").eq("id", eventId).maybeSingle();
      // Never preview a draft — its shell (title/cover) isn't public yet. Only
      // a PUBLISHED room, and only when its lobby is readable, gets the peek.
      const published = String(pv?.status || "").toUpperCase() === "PUBLISHED";
      if (published && resolveCapabilities(pv, "lobby").read === true) {
        return {
          level: "preview",
          reason: "unverified",
          permissions: { read: true, post: false, seeWho: false, upload: false, download: false },
        };
      }
    }
    return { level: "no_access", reason: "no_identity" };
  }
  const room = await getRoomAccess(personId, eventId, nowMs);
  if (room.access === "pulledup") return { level: "guest_pullup", reason: null, phase: room.phase, permissions: room.permissions };
  if (room.access === "lobby") return { level: "guest_rsvp", reason: null, phase: room.phase, permissions: room.permissions };
  if (room.access === "waitlist") return { level: "guest_waitlist", reason: null, phase: room.phase, permissions: room.permissions };
  return { level: "no_access", reason: room.reason || "locked", phase: room.phase };
}

// Non-cancelled RSVP count — the "coming" number the lobby shows (before anyone
// has pulled up, "coming" is the honest signal, not "0 inside").
export async function getComingCount(eventId) {
  // "Coming" = confirmed attendance only. Waitlisters are NOT coming (they're
  // peeking) — excluding them keeps this in step with getRoomRoster below, so
  // the lobby/teaser never advertises more "coming" than the event can hold.
  const { data } = await supabase
    .from("rsvps").select("status, booking_status")
    .eq("event_id", eventId).neq("status", "cancelled");
  return (data || []).filter((r) => r.status !== "waitlist" && r.booking_status !== "WAITLIST").length;
}

// ── The LIVE room roster: who's actually IN the room ────────────────────────
// This is what the "see who's here" capability surfaces and what the host's
// roster strip shows — the people present at THIS event, on the lifecycle:
//   pulledUp = showed up (pullups) — in forever, ordered by when they arrived.
//   coming   = confirmed RSVPs (non-cancelled, non-waitlist) not yet pulled up
//              — intent, still pending presence.
// A waitlister is "hoping for a spot", not "coming", so they're not counted here
// (peek ≠ presence); a cancelled RSVP is gone. This is DELIBERATELY NOT
// getCoPresentAtEvent — that one is the durable, pull-up-keyed connection mesh
// (lateral comms across a host's events) and is empty before anyone pulls up.
//
// Returns { phase, pulledUp, coming, here }:
//   pulledUp = showed up (pullups) — in forever, ordered by arrival.
//   coming   = confirmed RSVPs not yet pulled up — full list (the host strip
//              shows who said yes even after the night).
//   here     = who is ACTUALLY in the room right now, narrowed by the REAL event
//              phase: before the doors the lobby is open (coming + pulledUp);
//              once the event starts the lobby closes and only pulledUp remain
//              (mirrors getRoomAccess locking out RSVP'd-but-never-showed). This
//              is keyed off the true phase, never the viewer's state, so the
//              admin "view as RSVP'd" lens resolves the same population.
export async function getRoomRoster(eventId, nowMs = Date.now()) {
  if (!eventId) return { phase: "upcoming", pulledUp: [], coming: [], here: [] };
  const [{ data: ev }, { data: rsvpRows }, { data: pullRows }] = await Promise.all([
    supabase.from("events").select("starts_at, ends_at").eq("id", eventId).maybeSingle(),
    supabase.from("rsvps")
      .select("person_id, status, booking_status, pulled_up, people:person_id ( name, instagram )")
      .eq("event_id", eventId),
    supabase.from("pullups")
      .select("person_id, verified_at, people:person_id ( name, instagram )")
      .eq("event_id", eventId).order("verified_at"),
  ]);
  const phase = computeEventPhase(ev?.starts_at, ev?.ends_at, nowMs);

  // Pulled up = proof of presence from EITHER path, deduped by person: the
  // rotating-QR door scan (pullups, kept in arrival order) first, then host
  // check-ins (rsvps.pulled_up). Same union the access gate uses, so the roster
  // and the gate never disagree about who's in.
  const pulledUp = [];
  const pulledIds = new Set();
  const addPulled = (r) => {
    if (!r.person_id || pulledIds.has(r.person_id)) return;
    pulledIds.add(r.person_id);
    pulledUp.push({ id: r.person_id, name: r.people?.name || "Someone", instagram: r.people?.instagram || null });
  };
  (pullRows || []).forEach(addPulled);
  (rsvpRows || []).filter((r) => r.pulled_up === true).forEach(addPulled);

  // Coming = confirmed RSVPs (non-cancelled, non-waitlist) not yet pulled up.
  const coming = (rsvpRows || [])
    .filter((r) => r.status !== "cancelled" && r.status !== "waitlist" && r.booking_status !== "WAITLIST")
    .filter((r) => !pulledIds.has(r.person_id))
    .map((r) => ({ id: r.person_id, name: r.people?.name || "Someone", instagram: r.people?.instagram || null }));

  const here = phase === "upcoming" ? [...pulledUp, ...coming] : [...pulledUp];
  return { phase, pulledUp, coming, here };
}

// ── The event space (the room's conversation, organised into TOPICS) ────────
// Read/write is gated by a pull-up (mesh) or by being the host. No DM
// primitive — everything lives in shared, event-scoped channels. Topics are
// host-curated (the host holds the pen); the always-on "Main" is created
// lazily so every room has somewhere to talk from the first message.

export async function getOrCreateMainChannel(eventId) {
  const { data: existing } = await supabase
    .from("event_channels").select("id, name, is_main, sort").eq("event_id", eventId).eq("is_main", true).maybeSingle();
  if (existing) return existing;
  const { data, error } = await supabase
    .from("event_channels").insert({ event_id: eventId, name: "Main", is_main: true, sort: 0 }).select("id, name, is_main, sort").single();
  if (error) {
    // lost a race — re-read
    const { data: again } = await supabase.from("event_channels").select("id, name, is_main, sort").eq("event_id", eventId).eq("is_main", true).maybeSingle();
    return again || null;
  }
  return data;
}

export async function listChannels(eventId) {
  await getOrCreateMainChannel(eventId); // guarantee Main exists
  const { data } = await supabase
    .from("event_channels").select("id, name, is_main, sort").eq("event_id", eventId).order("is_main", { ascending: false }).order("sort").order("created_at");
  return (data || []).map((c) => ({ id: c.id, name: c.name, isMain: !!c.is_main }));
}

export async function createChannel({ eventId, name, createdBy = null }) {
  const clean = (name || "").toString().trim().slice(0, 40);
  if (!eventId || !clean) return { ok: false, reason: "empty" };
  const { data: peers } = await supabase.from("event_channels").select("id").eq("event_id", eventId);
  const { data, error } = await supabase
    .from("event_channels").insert({ event_id: eventId, name: clean, is_main: false, sort: (peers?.length || 1), created_by: createdBy }).select("id, name, is_main").single();
  if (error) return { ok: false, reason: error.message };
  return { ok: true, channel: { id: data.id, name: data.name, isMain: false } };
}

// One SUBJECT's flowing feed: the room can hold several subjects (channels);
// "Room chat" is the always-on default (the Main channel). We return every
// message in the requested subject (default Main), each carrying its reply
// parent, attached media, and pinned flag — the frontend nests replies and
// lifts pinned posts into the top strip.
export async function listSpaceMessages(eventId, { channelId = null, limit = 500 } = {}) {
  let chId = channelId;
  if (!chId) { const main = await getOrCreateMainChannel(eventId); chId = main?.id || null; }
  let q = supabase
    .from("event_space_messages")
    .select("id, body, author_name, is_host, author_person_id, parent_id, media, pinned, channel_id, created_at, edited_at, deleted_at")
    .eq("event_id", eventId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (chId) q = q.eq("channel_id", chId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.map((m) => {
    const deleted = !!m.deleted_at;
    return {
      id: m.id,
      // A soft-deleted post (kept only to hold its reply thread together) carries
      // no content — the frontend renders a "message deleted" tombstone.
      body: deleted ? "" : (m.body || ""),
      authorName: m.author_name || "Someone",
      isHost: !!m.is_host,
      personId: m.author_person_id || null,
      parentId: m.parent_id || null,
      media: deleted ? [] : (Array.isArray(m.media) ? m.media : []),
      pinned: !deleted && !!m.pinned,
      channelId: m.channel_id || null,
      at: m.created_at,
      editedAt: m.edited_at || null,
      deleted,
    };
  });
}

// Edit a post's TEXT. Author-only (the caller authorises). Media is left as-is —
// this fixes what you said, it doesn't re-attach. Stamps edited_at so the room
// can show a quiet "· edited". You can't blank a text-only post (that'd be an
// empty post) or edit one that's already been deleted.
export async function editSpaceMessage({ eventId, messageId, body }) {
  if (!eventId || !messageId) return { ok: false, reason: "empty" };
  const { data: row } = await supabase
    .from("event_space_messages").select("id, media, deleted_at").eq("id", messageId).eq("event_id", eventId).maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };
  if (row.deleted_at) return { ok: false, reason: "deleted" };
  const text = (body || "").toString().trim();
  const hasMedia = Array.isArray(row.media) && row.media.length > 0;
  if (!text && !hasMedia) return { ok: false, reason: "empty" };
  const { error } = await supabase
    .from("event_space_messages")
    .update({ body: text.slice(0, 4000), edited_at: new Date().toISOString() })
    .eq("id", messageId).eq("event_id", eventId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Remove a post. A leaf is HARD-deleted (clean, no ghost). A post that has
// replies is SOFT-deleted instead — parent_id is ON DELETE CASCADE, so a hard
// delete would take everyone's replies with it; soft-delete keeps the row (body/
// media cleared, unpinned) so the thread underneath survives as a tombstone.
// Authorisation (author, or host moderating) is the caller's job.
export async function deleteSpaceMessage({ eventId, messageId }) {
  if (!eventId || !messageId) return { ok: false, reason: "empty" };
  const { data: kids } = await supabase
    .from("event_space_messages").select("id").eq("parent_id", messageId).limit(1);
  if (Array.isArray(kids) && kids.length > 0) {
    const { error } = await supabase
      .from("event_space_messages")
      .update({ deleted_at: new Date().toISOString(), body: "", media: [], pinned: false })
      .eq("id", messageId).eq("event_id", eventId);
    if (error) return { ok: false, reason: error.message };
    return { ok: true, soft: true };
  }
  const { error } = await supabase
    .from("event_space_messages").delete().eq("id", messageId).eq("event_id", eventId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true, soft: false };
}

// A post is text, media, or both — and may reply to another post (parentId) and
// be born pinned. A media-only post is fine (an upload IS a post now); a post
// with neither text nor media is rejected.
export async function postSpaceMessage({ eventId, channelId = null, personId = null, profileId = null, isHost = false, authorName = null, body, parentId = null, media = [], pinned = false }) {
  const text = (body || "").toString().trim();
  const mediaArr = Array.isArray(media) ? media.filter((m) => m && typeof m.url === "string") : [];
  if (!eventId || (!text && mediaArr.length === 0)) return { ok: false, reason: "empty" };
  let chId = channelId;
  if (!chId) { const main = await getOrCreateMainChannel(eventId); chId = main?.id || null; }
  const { data, error } = await supabase
    .from("event_space_messages")
    .insert({
      event_id: eventId,
      channel_id: chId,
      author_person_id: personId,
      author_profile_id: profileId,
      is_host: isHost,
      author_name: authorName,
      body: text.slice(0, 4000),
      parent_id: parentId || null,
      media: mediaArr.slice(0, 10).map((m) => ({ url: String(m.url), type: m.type === "video" ? "video" : "image" })),
      pinned: !!pinned,
    })
    .select("id")
    .single();
  if (error) return { ok: false, reason: error.message };
  return { ok: true, id: data.id, channelId: chId };
}

// "Attach to the top" / take it back down. Caller has already authorised that
// this person may pin this post (host = any post, guest = their own).
export async function setMessagePinned({ eventId, messageId, pinned }) {
  if (!eventId || !messageId) return { ok: false, reason: "empty" };
  const { error } = await supabase
    .from("event_space_messages")
    .update({ pinned: !!pinned })
    .eq("id", messageId)
    .eq("event_id", eventId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// Read one message's owner/event/subject — used to authorise a pin/unpin
// request and to return the right subject's feed afterwards.
export async function getSpaceMessage(messageId) {
  const { data } = await supabase
    .from("event_space_messages")
    .select("id, event_id, author_person_id, is_host, channel_id")
    .eq("id", messageId)
    .maybeSingle();
  return data || null;
}

export async function getCoPresentAtEvent(personId, eventId) {
  const { data: self } = await supabase
    .from("pullups")
    .select("id")
    .eq("person_id", personId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (!self) return []; // didn't pull up here → no co-presence visibility

  const { data, error } = await supabase
    .from("pullups")
    .select("person_id")
    .eq("event_id", eventId)
    .neq("person_id", personId);
  if (error || !data) return [];
  return data.map((r) => r.person_id);
}
