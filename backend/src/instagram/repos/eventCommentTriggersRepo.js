// backend/src/instagram/repos/eventCommentTriggersRepo.js
//
// Data access for event_comment_triggers (migration 068) — the per-event
// Instagram comment→DM model. A trigger is anchored to an event and is only
// "LIVE" while that event hasn't ended:
//
//     effectiveEnd(event) = event.ends_at ?? event.starts_at
//     live = trigger.enabled && effectiveEnd > now()
//
// Expiry is computed here (not stored), so a finished event's trigger goes
// silent on its own with no cron. Keyword uniqueness is enforced only among
// LIVE triggers (see findLiveKeywordConflict) — which is what lets a keyword
// free itself up for the next event automatically.

import { supabase } from "../../supabase.js";

const EVENT_COLS = "id, title, slug, starts_at, ends_at, status";

/** event_comment_triggers + its embedded event, in one round-trip. */
const SELECT_WITH_EVENT =
  `id, event_id, host_profile_id, keyword, match_type, reply_text, enabled, media_id, created_at, updated_at, event:event_id ( ${EVENT_COLS} )`;

/** ends_at if set, else starts_at. ISO string or null. */
function effectiveEnd(ev) {
  return ev?.ends_at || ev?.starts_at || null;
}

/** A trigger is live when enabled AND its event hasn't passed. */
function isLive(row, nowMs) {
  if (!row?.enabled) return false;
  const end = effectiveEnd(row.event);
  if (!end) return false;
  const t = Date.parse(end);
  return Number.isFinite(t) && t > nowMs;
}

/** Shape a DB row + embedded event into the API/UI view, with computed state. */
function toView(row, nowMs) {
  const end = effectiveEnd(row.event);
  const expired = !end || !(Date.parse(end) > nowMs);
  return {
    id: row.id,
    eventId: row.event_id,
    eventTitle: row.event?.title || "(untitled event)",
    eventSlug: row.event?.slug || null,
    eventStatus: row.event?.status || null,
    startsAt: row.event?.starts_at || null,
    endsAt: row.event?.ends_at || null,
    expiresAt: end,
    keyword: row.keyword,
    match: row.match_type,
    replyText: row.reply_text || "",
    enabled: !!row.enabled,
    mediaId: row.media_id || null,
    // For the UI: 'active' (firing), 'paused' (toggled off but event still live),
    // 'expired' (event ended — never fires regardless of toggle).
    status: expired ? "expired" : row.enabled ? "active" : "paused",
    createdAt: row.created_at,
  };
}

/** All of a host's triggers (any state), newest first, with computed status. */
export async function listTriggersForHost(hostProfileId, nowMs = Date.now()) {
  const { data, error } = await supabase
    .from("event_comment_triggers")
    .select(SELECT_WITH_EVENT)
    .eq("host_profile_id", hostProfileId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((r) => toView(r, nowMs));
}

/**
 * A host's LIVE triggers, shaped for the comment engine and sorted by soonest
 * effective end — so when the engine takes the first keyword match, ties break
 * deterministically toward the most imminent event.
 */
export async function getLiveTriggersForHost(hostProfileId, nowMs = Date.now()) {
  const { data, error } = await supabase
    .from("event_comment_triggers")
    .select(SELECT_WITH_EVENT)
    .eq("host_profile_id", hostProfileId)
    .eq("enabled", true);
  if (error) throw error;
  return (data || [])
    .filter((r) => isLive(r, nowMs))
    .map((r) => ({
      id: r.id,
      keyword: r.keyword,
      match: r.match_type,
      media_id: r.media_id || null,
      event_slug: r.event?.slug || null,
      reply_text: r.reply_text || "",
      enabled: true,
      _end: Date.parse(effectiveEnd(r.event)) || Infinity,
    }))
    .sort((a, b) => a._end - b._end);
}

/**
 * Return an existing LIVE trigger that already owns this keyword (case-
 * insensitive) for the host, excluding `excludeId`. Used to enforce
 * one-live-keyword-at-a-time at create/enable time. Returns the view or null.
 */
export async function findLiveKeywordConflict(hostProfileId, keyword, excludeId = null, nowMs = Date.now()) {
  const kw = String(keyword || "").trim().toLowerCase();
  if (!kw) return null;
  const { data, error } = await supabase
    .from("event_comment_triggers")
    .select(SELECT_WITH_EVENT)
    .eq("host_profile_id", hostProfileId)
    .eq("enabled", true);
  if (error) throw error;
  const hit = (data || []).find(
    (r) =>
      r.id !== excludeId &&
      String(r.keyword || "").trim().toLowerCase() === kw &&
      isLive(r, nowMs)
  );
  return hit ? toView(hit, nowMs) : null;
}

export async function getTriggerById(id, hostProfileId, nowMs = Date.now()) {
  const { data, error } = await supabase
    .from("event_comment_triggers")
    .select(SELECT_WITH_EVENT)
    .eq("id", id)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (error) throw error;
  return data ? toView(data, nowMs) : null;
}

export async function createTrigger({ eventId, hostProfileId, keyword, match, replyText, mediaId = null, enabled = true }) {
  const { data, error } = await supabase
    .from("event_comment_triggers")
    .insert({
      event_id: eventId,
      host_profile_id: hostProfileId,
      keyword: String(keyword).trim().slice(0, 80),
      match_type: match === "exact" ? "exact" : "contains",
      reply_text: replyText ? String(replyText).slice(0, 900) : null,
      media_id: mediaId ? String(mediaId).slice(0, 64) : null,
      enabled: enabled !== false,
    })
    .select(SELECT_WITH_EVENT)
    .single();
  if (error) throw error;
  return toView(data, Date.now());
}

export async function updateTrigger(id, hostProfileId, patch) {
  const row = {};
  if (patch.keyword !== undefined) row.keyword = String(patch.keyword).trim().slice(0, 80);
  if (patch.match !== undefined) row.match_type = patch.match === "exact" ? "exact" : "contains";
  if (patch.replyText !== undefined) row.reply_text = patch.replyText ? String(patch.replyText).slice(0, 900) : null;
  if (patch.enabled !== undefined) row.enabled = patch.enabled !== false;
  if (patch.mediaId !== undefined) row.media_id = patch.mediaId ? String(patch.mediaId).slice(0, 64) : null;
  row.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("event_comment_triggers")
    .update(row)
    .eq("id", id)
    .eq("host_profile_id", hostProfileId)
    .select(SELECT_WITH_EVENT)
    .maybeSingle();
  if (error) throw error;
  return data ? toView(data, Date.now()) : null;
}

export async function deleteTrigger(id, hostProfileId) {
  const { error } = await supabase
    .from("event_comment_triggers")
    .delete()
    .eq("id", id)
    .eq("host_profile_id", hostProfileId);
  if (error) throw error;
  return true;
}

/**
 * The host's events eligible to attach a trigger to: published and not yet
 * ended (the /e/:slug link must resolve to something live). Sorted soonest
 * first for the picker.
 */
export async function getEligibleEventsForHost(hostProfileId, nowMs = Date.now()) {
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLS)
    .eq("host_id", hostProfileId)
    .eq("status", "PUBLISHED")
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((ev) => {
      const end = effectiveEnd(ev);
      return end && Date.parse(end) > nowMs;
    })
    .map((ev) => ({
      id: ev.id,
      title: ev.title || "(untitled event)",
      slug: ev.slug,
      startsAt: ev.starts_at,
      endsAt: ev.ends_at,
    }));
}
