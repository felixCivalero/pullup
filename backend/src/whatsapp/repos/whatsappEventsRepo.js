// backend/src/whatsapp/repos/whatsappEventsRepo.js

import { supabase } from "../../supabase.js";

/**
 * Append a raw webhook event. Idempotency-tolerant: Meta retries events
 * on missing 200s and we want the audit trail without exploding duplicates.
 * (No unique constraint by design — duplicates are acceptable; the source
 * of truth is whatsapp_outbox status, which uses idempotent state
 * transitions.)
 */
export async function recordEvent({
  provider = "meta_cloud",
  providerMessageId = null,
  eventType,
  whatsappOutboxId = null,
  recipient = null,
  payload,
}) {
  if (!eventType) throw new Error("[whatsappEventsRepo] eventType required");
  if (!payload) throw new Error("[whatsappEventsRepo] payload required");

  const { data, error } = await supabase
    .from("whatsapp_events")
    .insert({
      provider,
      provider_message_id: providerMessageId,
      event_type: eventType,
      whatsapp_outbox_id: whatsappOutboxId,
      recipient,
      payload,
    })
    .select()
    .single();

  if (error) {
    console.error("[whatsappEventsRepo] recordEvent error", error);
    throw new Error(`Failed to insert whatsapp_events row: ${error.message}`);
  }
  return data;
}
