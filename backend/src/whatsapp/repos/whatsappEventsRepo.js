// backend/src/whatsapp/repos/whatsappEventsRepo.js

import { supabase } from "../../supabase.js";
import { interpretUpsert } from "../../lib/idempotency.js";

/**
 * Append a raw webhook event, AT MOST ONCE per (provider, message id, event
 * type). Meta retries events on any missed 200; without this a retry doubled
 * the audit trail (the old "duplicates are acceptable" comment was wishful — a
 * doubled trail makes delivery/read counts untrustworthy). The unique index
 * uniq_whatsapp_events_pmid (migration 065) is the arbiter; rows with a NULL
 * provider_message_id are distinct, so non-message events stay un-deduped.
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

  const row = {
    provider,
    provider_message_id: providerMessageId,
    event_type: eventType,
    whatsapp_outbox_id: whatsappOutboxId,
    recipient,
    payload,
  };

  // A NULL provider_message_id can't dedupe (NULLs are distinct) — plain insert.
  if (!providerMessageId) {
    const { data, error } = await supabase
      .from("whatsapp_events").insert(row).select().single();
    if (error) {
      console.error("[whatsappEventsRepo] recordEvent error", error);
      throw new Error(`Failed to insert whatsapp_events row: ${error.message}`);
    }
    return data;
  }

  const { data, error } = await supabase
    .from("whatsapp_events")
    .upsert(row, {
      onConflict: "provider,provider_message_id,event_type",
      ignoreDuplicates: true,
    })
    .select();

  if (error) {
    console.error("[whatsappEventsRepo] recordEvent error", error);
    throw new Error(`Failed to insert whatsapp_events row: ${error.message}`);
  }
  // On a duplicate redelivery nothing is written; callers don't use the row.
  return interpretUpsert(data).row;
}
