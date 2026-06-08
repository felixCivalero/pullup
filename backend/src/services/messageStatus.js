// backend/src/services/messageStatus.js
//
// Delivery-status write-back onto the spine. When a channel webhook learns a
// Room message moved sent → delivered → read (or failed), it calls one of these
// to upgrade the matching outbound person_events bubble. The UPDATE makes
// Supabase Realtime fire, so the tick in the host's open thread animates up
// without a refetch. All best-effort: a status hiccup never breaks a webhook.
//
// The actual monotonic logic (never downgrade a tick) lives in the SQL
// functions from migration 071 — these are thin, safe wrappers.

import { supabase } from "../supabase.js";
import { logger } from "../logger.js";

/**
 * Bump the outbound bubble(s) whose metadata[key] === value.
 *   - WhatsApp: key 'provider_mid', value the Meta message id (status webhook)
 *   - Email:    key 'tracking_id',  value the outbox tracking_id (SES/Resend/pixel)
 * @param {{key:string, value:string, status:'sent'|'delivered'|'read'|'failed', at?:Date|string}} a
 */
export async function bumpMessageStatus({ key, value, status, at = new Date() }) {
  if (!key || !value || !status) return;
  try {
    const { error } = await supabase.rpc("bump_room_message_status", {
      p_key: key,
      p_val: String(value),
      p_status: status,
      p_at: new Date(at).toISOString(),
    });
    if (error) logger?.warn?.("[messageStatus] bump failed", { key, status, error: error.message });
  } catch (err) {
    logger?.warn?.("[messageStatus] bump threw", { key, status, error: err?.message });
  }
}

/**
 * Bump every still-behind outbound bubble for a (person, host) on one channel —
 * for read receipts that arrive as a per-thread watermark (Instagram), not per
 * message.
 * @param {{personId:string, hostId?:string, channel:string, status:'delivered'|'read', at?:Date|string}} a
 */
export async function bumpMessageStatusForPerson({ personId, hostId = null, channel, status, at = new Date() }) {
  if (!personId || !channel || !status) return;
  try {
    const { error } = await supabase.rpc("bump_room_message_status_person", {
      p_person: personId,
      p_host: hostId,
      p_channel: channel,
      p_status: status,
      p_at: new Date(at).toISOString(),
    });
    if (error) logger?.warn?.("[messageStatus] bump-person failed", { channel, status, error: error.message });
  } catch (err) {
    logger?.warn?.("[messageStatus] bump-person threw", { channel, status, error: err?.message });
  }
}
