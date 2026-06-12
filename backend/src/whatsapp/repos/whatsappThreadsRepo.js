// backend/src/whatsapp/repos/whatsappThreadsRepo.js
//
// Per-(person, host) conversation header. Touched on every outbound +
// inbound message so the inbox UI has a fast, sorted, unread-aware view
// without scanning whatsapp_outbox.

import { supabase } from "../../supabase.js";

const HOURS_24 = 24 * 60 * 60 * 1000;

/**
 * Upsert a thread row from a new message. Drives:
 *   * last_message_at / preview / direction
 *   * unread_count (++ on inbound, reset on outbound)
 *   * conversation_window_opens_at + expires_at (set on inbound; preserved if still valid)
 */
export async function upsertThreadFromMessage({
  personId,
  hostProfileId,
  phoneE164,
  direction,
  preview,
  outboxId,
  at = new Date(),
}) {
  if (!personId || !hostProfileId) return null;

  // Atomic: one INSERT ... ON CONFLICT computed in the database (see migration
  // atomic_whatsapp_thread_upsert). The old JS read-modify-write lost updates
  // under concurrency — two near-simultaneous messages both read the stale row
  // and the loser's write wiped the winner's unread bump / 24h window.
  const { data, error } = await supabase.rpc("upsert_whatsapp_thread", {
    p_person_id: personId,
    p_host_profile_id: hostProfileId,
    p_phone_e164: phoneE164 ?? null,
    p_direction: direction,
    p_preview: preview ? String(preview).slice(0, 280) : null,
    p_outbox_id: outboxId ?? null,
    p_at: (at instanceof Date ? at : new Date(at)).toISOString(),
  });
  if (error) throw new Error(`[whatsappThreadsRepo] upsert rpc: ${error.message}`);
  return Array.isArray(data) ? data[0] ?? null : data;
}

export async function fetchByPair({ personId, hostProfileId }) {
  const { data, error } = await supabase
    .from("whatsapp_threads")
    .select("*")
    .eq("person_id", personId)
    .eq("host_profile_id", hostProfileId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[whatsappThreadsRepo] fetchByPair error", error);
  }
  return data || null;
}

export async function markRead({ threadId }) {
  const { data, error } = await supabase
    .from("whatsapp_threads")
    .update({ unread_count: 0 })
    .eq("id", threadId)
    .select()
    .single();
  if (error) throw new Error(`[whatsappThreadsRepo] markRead: ${error.message}`);
  return data;
}

export async function isConversationWindowOpen({ personId, hostProfileId }) {
  const t = await fetchByPair({ personId, hostProfileId });
  if (!t?.conversation_window_expires_at) return false;
  return new Date(t.conversation_window_expires_at) > new Date();
}
