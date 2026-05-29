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

  const existing = await fetchByPair({ personId, hostProfileId });
  const isInbound = direction === "inbound";

  let conversation_window_opens_at = existing?.conversation_window_opens_at ?? null;
  let conversation_window_expires_at = existing?.conversation_window_expires_at ?? null;

  if (isInbound) {
    // Inbound message opens / refreshes the 24h freeform window.
    conversation_window_opens_at = at.toISOString();
    conversation_window_expires_at = new Date(at.getTime() + HOURS_24).toISOString();
  } else if (
    conversation_window_expires_at &&
    new Date(conversation_window_expires_at) < at
  ) {
    // Window has expired — clear.
    conversation_window_opens_at = null;
    conversation_window_expires_at = null;
  }

  const payload = {
    person_id: personId,
    host_profile_id: hostProfileId,
    phone_e164: phoneE164,
    last_message_at: at.toISOString(),
    last_message_preview: preview ? String(preview).slice(0, 280) : null,
    last_message_direction: direction,
    last_outbox_id: outboxId ?? null,
    conversation_window_opens_at,
    conversation_window_expires_at,
  };

  if (existing) {
    const nextUnread = isInbound ? (existing.unread_count ?? 0) + 1 : 0;
    const { data, error } = await supabase
      .from("whatsapp_threads")
      .update({ ...payload, unread_count: nextUnread })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) throw new Error(`[whatsappThreadsRepo] update: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from("whatsapp_threads")
    .insert({ ...payload, unread_count: isInbound ? 1 : 0 })
    .select()
    .single();
  if (error) throw new Error(`[whatsappThreadsRepo] insert: ${error.message}`);
  return data;
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
