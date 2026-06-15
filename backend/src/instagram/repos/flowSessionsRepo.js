// backend/src/instagram/repos/flowSessionsRepo.js
//
// The "awaiting their reply" state for conversational comment→DM flows
// (migration 075). When a flow trigger fires, the opener goes out as the
// comment's one private reply and we write an `awaiting` session here; the next
// inbound DM from that person is matched to it (the answer), branched, and the
// session is completed. One-shot per opener.

import { supabase } from "../../supabase.js";
import { logger } from "../../logger.js";

// A reply older than this is treated as a normal DM, not an answer — Meta's
// private-reply eligibility is 7 days, so an opener can't realistically be
// answered after that anyway.
const AWAIT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Open an awaiting session. Returns the new row id, or null on failure. */
export async function createFlowSession({
  hostProfileId, personId, triggerId = null, eventId = null,
  eventSlug = null, eventKind = "event", openerCommentId = null, flow,
}) {
  if (!hostProfileId || !personId || !flow) return null;
  const { data, error } = await supabase
    .from("ig_flow_sessions")
    .insert({
      host_profile_id: hostProfileId,
      person_id: personId,
      trigger_id: triggerId,
      event_id: eventId,
      event_slug: eventSlug,
      event_kind: eventKind || "event",
      opener_comment_id: openerCommentId,
      flow,
      status: "awaiting",
    })
    .select("id")
    .single();
  if (error) {
    logger?.error?.("[flowSessionsRepo] create failed", { error: error.message });
    return null;
  }
  return data.id;
}

/**
 * The most recent still-awaiting session for this (host, person) — i.e. "did we
 * ask them something and are waiting on the answer?". Null if none / expired.
 */
export async function getAwaitingSession({ hostProfileId, personId }) {
  if (!hostProfileId || !personId) return null;
  const sinceIso = new Date(Date.now() - AWAIT_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("ig_flow_sessions")
    .select("*")
    .eq("host_profile_id", hostProfileId)
    .eq("person_id", personId)
    .eq("status", "awaiting")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logger?.warn?.("[flowSessionsRepo] getAwaiting failed", { error: error.message });
    return null;
  }
  return data || null;
}

/** Close a session once their answer has been handled. */
export async function completeFlowSession({ id, replyText = null, branch = null }) {
  if (!id) return;
  const { error } = await supabase
    .from("ig_flow_sessions")
    .update({
      status: "completed",
      reply_text: replyText ? String(replyText).slice(0, 900) : null,
      branch: branch || null,
      responded_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) logger?.warn?.("[flowSessionsRepo] complete failed", { error: error.message });
}
