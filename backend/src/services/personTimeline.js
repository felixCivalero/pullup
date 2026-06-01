// backend/src/services/personTimeline.js
//
// THE BRAIN'S MEMORY — the append-only per-person timeline.
//
// Every touchpoint with a person lands here as one immutable row in
// `person_events` (migration 048). The Room is a READ over this stream: the
// brief, the warmth, the "who needs you" ranking, and each person's unified
// cross-channel thread are all computed from it. Nothing is ever updated in
// place — a correction is a new row, not an edit.
//
// Two surfaces:
//   logPersonEvent(...)  — append one event. Best-effort: a failed timeline
//                          write must NEVER break the parent action (an RSVP
//                          still succeeds even if logging hiccups). Mirrors the
//                          intentLog.js contract.
//   backfillFromRsvps()  — one-time seed of history from existing rsvps so the
//                          Room isn't blank on day one. Idempotent via a
//                          metadata marker; safe to re-run.
//
// This module writes only to person_events. It does not resolve identity
// (that's personResolution.js) and does not touch channel code.

import { supabase } from "../supabase.js";
import { logger } from "../logger.js";

// The vocabulary, kept in sync with the migration-048 CHECK constraint so a
// typo fails loudly here instead of as a DB error deep in a request.
export const PERSON_EVENT_TYPES = new Set([
  "page_view", "rsvp", "rsvp_cancel", "waitlist_join", "attended", "payment",
  "message_in", "message_out", "auto_dm_sent", "host_logged",
  "identity_linked", "acquired", "note",
]);

const CHANNELS = new Set(["instagram", "whatsapp", "email", "web", "phone", "system"]);

/**
 * Append one event to a person's timeline. Never throws.
 *
 * @param {object} e
 * @param {string} e.personId      Required. The person this happened to.
 * @param {string} e.type          One of PERSON_EVENT_TYPES.
 * @param {string} [e.hostId]      Whose world it happened in.
 * @param {string} [e.eventId]     The capital-E Event it relates to, if any.
 * @param {string} [e.channel]     instagram|whatsapp|email|web|phone|system
 * @param {string} [e.direction]   'in' | 'out' (for messages)
 * @param {string} [e.body]        human-readable summary or message text
 * @param {object} [e.metadata]    structured extras (idempotency keys, ids…)
 * @param {string|Date} [e.occurredAt]  when it actually happened (defaults now)
 * @returns {Promise<{ ok: boolean, id?: string }>}
 */
export async function logPersonEvent({
  personId, type, hostId = null, eventId = null,
  channel = null, direction = null, body = null,
  metadata = {}, occurredAt = null,
} = {}) {
  if (!personId || !type) {
    logger?.warn?.("[personTimeline] skipped (missing personId/type)", { personId, type });
    return { ok: false };
  }
  if (!PERSON_EVENT_TYPES.has(type)) {
    logger?.warn?.("[personTimeline] skipped (unknown type)", { type });
    return { ok: false };
  }
  if (channel && !CHANNELS.has(channel)) {
    logger?.warn?.("[personTimeline] bad channel, nulling", { channel });
    channel = null;
  }
  try {
    const row = {
      person_id: personId,
      type,
      host_id: hostId,
      event_id: eventId,
      channel,
      direction,
      body,
      metadata: metadata || {},
    };
    if (occurredAt) row.occurred_at = new Date(occurredAt).toISOString();
    const { data, error } = await supabase
      .from("person_events").insert(row).select("id").single();
    if (error) {
      logger?.warn?.("[personTimeline] insert failed", { error: error.message });
      return { ok: false };
    }
    return { ok: true, id: data.id };
  } catch (err) {
    logger?.warn?.("[personTimeline] unexpected error", { error: err?.message });
    return { ok: false };
  }
}

/**
 * Read a person's timeline, newest first. The Room's thread view.
 */
export async function getPersonTimeline(personId, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("person_events")
    .select("*")
    .eq("person_id", personId)
    .order("occurred_at", { ascending: false })
    .limit(limit);
  if (error) {
    logger?.warn?.("[personTimeline] read failed", { error: error.message });
    return [];
  }
  return data || [];
}

// ── Backfill ────────────────────────────────────────────────────────
// Seed person_events from existing rsvps so the Room has real history on day
// one. Idempotent: each backfilled row carries metadata.backfill_src =
// 'rsvp:<rsvpId>'; we skip rsvps already represented. Re-runnable safely.
export async function backfillFromRsvps({ batchSize = 1000 } = {}) {
  // What's already backfilled, so a re-run is a no-op for done rows. Must
  // cover ALL backfilled types (rsvp / waitlist_join / rsvp_cancel / attended),
  // not just 'rsvp' — else attendance markers get re-inserted every run.
  const done = new Set();
  {
    const { data } = await supabase
      .from("person_events")
      .select("metadata")
      .not("metadata->>backfill_src", "is", null);
    for (const r of data || []) {
      const src = r.metadata?.backfill_src;
      if (src) done.add(src);
    }
  }

  // Pull rsvps that have a person, with their event's host + title.
  // Schema note: rsvps has NO checked_in_at/cancelled_at. Attendance is the
  // `pulled_up` flag; cancellation is status='cancelled'.
  const { data: rsvps, error } = await supabase
    .from("rsvps")
    .select("id, person_id, event_id, status, booking_status, pulled_up, created_at, updated_at, events!inner(host_id, title)")
    .not("person_id", "is", null)
    .limit(batchSize);
  if (error) {
    logger?.error?.("[personTimeline] backfill read failed", { error: error.message });
    return { inserted: 0, skipped: 0, error: error.message };
  }

  const rows = [];
  let skipped = 0;
  for (const r of rsvps || []) {
    const ev = r.events || {};
    const isWaitlist = (r.booking_status === "WAITLIST" || r.status === "waitlist");
    const isCancelled = r.status === "cancelled";
    const type = isCancelled ? "rsvp_cancel" : isWaitlist ? "waitlist_join" : "rsvp";
    const src = `rsvp:${r.id}`;
    if (done.has(src)) { skipped++; continue; }
    rows.push({
      person_id: r.person_id,
      host_id: ev.host_id || null,
      event_id: r.event_id || null,
      type,
      channel: "web",
      body: type === "rsvp"
        ? `RSVP'd to ${ev.title || "an event"}`
        : type === "waitlist_join"
          ? `Joined the waitlist for ${ev.title || "an event"}`
          : `Cancelled RSVP to ${ev.title || "an event"}`,
      metadata: { backfill_src: src, event_title: ev.title || null },
      occurred_at: r.created_at || null,
    });
    // A separate attendance event when they were pulled up (checked in).
    if (r.pulled_up) {
      const asrc = `rsvp_attended:${r.id}`;
      if (!done.has(asrc)) {
        rows.push({
          person_id: r.person_id,
          host_id: ev.host_id || null,
          event_id: r.event_id || null,
          type: "attended",
          channel: "web",
          body: `Attended ${ev.title || "an event"}`,
          metadata: { backfill_src: asrc, event_title: ev.title || null },
          occurred_at: r.updated_at || r.created_at || null,
        });
      }
    }
  }

  if (!rows.length) return { inserted: 0, skipped };

  // Insert in chunks to stay under payload limits.
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const { error: insErr } = await supabase.from("person_events").insert(chunk);
    if (insErr) {
      logger?.error?.("[personTimeline] backfill insert failed", { error: insErr.message });
      return { inserted, skipped, error: insErr.message };
    }
    inserted += chunk.length;
  }
  return { inserted, skipped };
}
