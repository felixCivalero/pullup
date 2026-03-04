// backend/src/email/repos/emailEventsRepo.js

import { supabase } from "../../supabase.js";

export async function insertEvent({
  provider,
  providerMessageId,
  eventType,
  emailOutboxId = null,
  recipient = null,
  payload,
}) {
  const { data, error } = await supabase
    .from("email_events")
    .insert({
      provider,
      provider_message_id: providerMessageId,
      event_type: eventType,
      email_outbox_id: emailOutboxId,
      recipient,
      payload,
    })
    .select()
    .single();

  if (error) {
    // Ignore unique constraint violations so we are idempotent on replays.
    if (error.code === "23505") {
      console.warn(
        "[emailEventsRepo] insertEvent duplicate ignored",
        {
          provider,
          providerMessageId,
          eventType,
        },
      );
      return null;
    }
    console.error("[emailEventsRepo] insertEvent error", error);
    throw new Error(`Failed to insert email_events: ${error.message}`);
  }

  return data;
}

