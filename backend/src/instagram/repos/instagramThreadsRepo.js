// backend/src/instagram/repos/instagramThreadsRepo.js
//
// Per-(person, host) Instagram DM conversation header — mirror of
// whatsappThreadsRepo, keyed by the guest's IGSID. Drives the 24h window that
// gates free-text IG replies (Meta allows outbound IG DMs only inside the window
// opened by an inbound message; there is no IG template path).

import { supabase } from "../../supabase.js";

const HOURS_24 = 24 * 60 * 60 * 1000;
const DAYS_7 = 7 * 24 * 60 * 60 * 1000;

export async function fetchByPair({ personId, hostProfileId }) {
  const { data, error } = await supabase
    .from("instagram_threads")
    .select("*")
    .eq("person_id", personId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[instagramThreadsRepo] fetchByPair error", error);
  }
  return data || null;
}

/**
 * Upsert a thread row from a new IG DM. Inbound opens/refreshes the 24h window
 * + bumps unread; outbound resets unread and clears an expired window.
 */
export async function upsertThreadFromMessage({
  personId,
  hostProfileId,
  igUserId,
  direction,
  preview,
  at = new Date(),
}) {
  if (!personId || !hostProfileId) return null;

  const existing = await fetchByPair({ personId, hostProfileId });
  const isInbound = direction === "inbound";

  let conversation_window_opens_at = existing?.conversation_window_opens_at ?? null;
  let conversation_window_expires_at = existing?.conversation_window_expires_at ?? null;
  // Never cleared — only an inbound advances it. This anchors the 7-day
  // human-agent window (see getWindowState), which must survive past the 24h
  // standard window's expiry.
  let last_inbound_at = existing?.last_inbound_at ?? null;

  if (isInbound) {
    conversation_window_opens_at = at.toISOString();
    conversation_window_expires_at = new Date(at.getTime() + HOURS_24).toISOString();
    last_inbound_at = at.toISOString();
  } else if (conversation_window_expires_at && new Date(conversation_window_expires_at) < at) {
    conversation_window_opens_at = null;
    conversation_window_expires_at = null;
  }

  const payload = {
    person_id: personId,
    host_profile_id: hostProfileId,
    ig_user_id: igUserId,
    last_message_at: at.toISOString(),
    last_message_preview: preview ? String(preview).slice(0, 280) : null,
    last_message_direction: direction,
    conversation_window_opens_at,
    conversation_window_expires_at,
    last_inbound_at,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const nextUnread = isInbound ? (existing.unread_count ?? 0) + 1 : 0;
    const { data, error } = await supabase
      .from("instagram_threads")
      .update({ ...payload, unread_count: nextUnread })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(`[instagramThreadsRepo] update: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from("instagram_threads")
    .insert({ ...payload, unread_count: isInbound ? 1 : 0 })
    .select()
    .single();
  if (error) throw new Error(`[instagramThreadsRepo] insert: ${error.message}`);
  return data;
}

export async function markRead({ threadId }) {
  const { error } = await supabase
    .from("instagram_threads").update({ unread_count: 0 }).eq("id", threadId);
  if (error) throw new Error(`[instagramThreadsRepo] markRead: ${error.message}`);
}

export async function isConversationWindowOpen({ personId, hostProfileId }) {
  const t = await fetchByPair({ personId, hostProfileId });
  if (!t?.conversation_window_expires_at) return false;
  return new Date(t.conversation_window_expires_at) > new Date();
}

/**
 * The IG send eligibility for this pair, measured from the guest's last inbound:
 *   'standard'     — within 24h: any free-text reply is allowed.
 *   'human_agent'  — 24h–7d: a reply is allowed ONLY with the HUMAN_AGENT tag,
 *                    and ONLY for a human-composed message (Meta policy).
 *   'expired'      — beyond 7d (or never any inbound): no IG send is legal.
 * dispatch() reads this to choose the IG path or fall to the email floor.
 */
export async function getWindowState({ personId, hostProfileId }) {
  const t = await fetchByPair({ personId, hostProfileId });
  if (!t?.last_inbound_at) return "expired";
  const elapsed = Date.now() - new Date(t.last_inbound_at).getTime();
  if (elapsed <= HOURS_24) return "standard";
  if (elapsed <= DAYS_7) return "human_agent";
  return "expired";
}
