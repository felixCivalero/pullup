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
    // The guest's scanner opens this path on pullup.se. Public landing.
    path: `/p/${eventId}?w=${win}&s=${sig}`,
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

// ── Recording a pull-up ─────────────────────────────────────────────────────
// Idempotent: a re-scan (same person, same event) is a no-op, not a duplicate.
// On the FIRST pull-up we append an `attended` beat to the person's timeline.
export async function recordPullUp({ personId, eventId, method = "scan", hostId = null, createdBy = null }) {
  if (!personId || !eventId) return { ok: false, reason: "missing_ids" };

  // Already pulled up? Idempotent short-circuit.
  const { data: existing } = await supabase
    .from("pullups")
    .select("id")
    .eq("person_id", personId)
    .eq("event_id", eventId)
    .maybeSingle();
  if (existing) return { ok: true, alreadyPresent: true, pullupId: existing.id };

  const { data, error } = await supabase
    .from("pullups")
    .insert({ person_id: personId, event_id: eventId, method, created_by: createdBy })
    .select("id")
    .single();

  // A concurrent scan may have inserted first — treat unique-violation as success.
  if (error) {
    if (error.code === "23505") return { ok: true, alreadyPresent: true };
    return { ok: false, reason: error.message };
  }

  // Resolve the owning host for the timeline beat if not provided.
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

  return { ok: true, alreadyPresent: false, pullupId: data.id };
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
