// backend/src/whatsapp/repos/whatsappOutboxRepo.js

import { supabase } from "../../supabase.js";
import { interpretUpsert } from "../../lib/idempotency.js";

/**
 * Insert a new row into whatsapp_outbox. Idempotent on `idempotency_key`
 * if one is supplied — re-calling with the same key returns the original
 * row instead of inserting a duplicate.
 */
export async function insertOutboxRow({
  personId = null,
  profileId = null,
  toPhoneE164,
  fromPhoneNumberId,
  hostProfileId = null,
  direction = "outbound",
  templateKey = null,
  templateLocale = null,
  templateVariables = null,
  bodyText = null,
  bodyMedia = null,
  category = "utility",
  conversationWindowOpen = false,
  provider = "meta_cloud",
  country = null,
  costMicros = null,
  sandboxMode = false,
  campaignSendId = null,
  campaignTag = null,
  legalBasis = null,
  idempotencyKey = null,
  sendAfter = null,
  replyToMessageId = null,
}) {
  if (!toPhoneE164) throw new Error("[whatsappOutboxRepo] toPhoneE164 required");
  if (!fromPhoneNumberId)
    throw new Error("[whatsappOutboxRepo] fromPhoneNumberId required");

  const payload = {
    person_id: personId,
    profile_id: profileId,
    to_phone_e164: toPhoneE164,
    from_phone_number_id: fromPhoneNumberId,
    host_profile_id: hostProfileId,
    direction,
    template_key: templateKey,
    template_locale: templateLocale,
    template_variables: templateVariables,
    body_text: bodyText,
    body_media: bodyMedia,
    category,
    conversation_window_open: conversationWindowOpen,
    provider,
    country,
    cost_micros: costMicros,
    sandbox_mode: sandboxMode,
    campaign_send_id: campaignSendId,
    campaign_tag: campaignTag,
    legal_basis: legalBasis,
    idempotency_key: idempotencyKey,
    send_after: sendAfter,
    reply_to_message_id: replyToMessageId,
    status: "queued",
  };

  // No idempotency key → every call is a distinct send. Plain insert.
  if (!idempotencyKey) {
    const { data, error } = await supabase
      .from("whatsapp_outbox")
      .insert(payload)
      .select()
      .single();
    if (error) {
      console.error("[whatsappOutboxRepo] insertOutboxRow error", error);
      throw new Error(`Failed to insert into whatsapp_outbox: ${error.message}`);
    }
    return data;
  }

  // Idempotency key present → write AT MOST ONCE, never overwrite. The previous
  // code upserted WITHOUT ignoreDuplicates, so a repeat (e.g. a reminder cron
  // re-running across its window, or a Meta webhook redelivering an inbound)
  // reset an already-queued/sent row back to status:"queued" and the worker
  // re-sent it — the exact duplicate-send bug email already fixed (see
  // emailOutboxRepo.js). ON CONFLICT DO NOTHING makes the repeat a true no-op;
  // we then load and return the untouched existing row so callers still get it.
  const { data: inserted, error } = await supabase
    .from("whatsapp_outbox")
    .upsert(payload, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select();

  if (error) {
    console.error("[whatsappOutboxRepo] insertOutboxRow error", error);
    throw new Error(`Failed to insert into whatsapp_outbox: ${error.message}`);
  }

  const { row, deduped } = interpretUpsert(inserted);
  if (!deduped) return row;

  const { data: existing, error: fetchError } = await supabase
    .from("whatsapp_outbox")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (fetchError) {
    console.error("[whatsappOutboxRepo] insertOutboxRow fetch-existing error", fetchError);
    throw new Error(`Failed to load existing whatsapp_outbox row: ${fetchError.message}`);
  }
  return existing;
}

export async function findById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from("whatsapp_outbox")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[whatsappOutboxRepo] findById error", error);
  }
  return data || null;
}

export async function findByProviderMessageId({ provider, providerMessageId }) {
  if (!providerMessageId) return null;
  const { data, error } = await supabase
    .from("whatsapp_outbox")
    .select("*")
    .eq("provider", provider)
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("[whatsappOutboxRepo] findByProviderMessageId error", error);
  }
  return data || null;
}

export async function markSent({
  id,
  providerMessageId,
  providerConversationId = null,
  costMicros = null,
  sentAt = new Date(),
}) {
  const update = {
    status: "sent",
    provider_message_id: providerMessageId,
    provider_conversation_id: providerConversationId,
    sent_at: sentAt.toISOString(),
    locked_at: null,
    locked_by: null,
    last_error_code: null,
    last_error_message: null,
  };
  if (costMicros != null) update.cost_micros = costMicros;

  const { data, error } = await supabase
    .from("whatsapp_outbox")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`[whatsappOutboxRepo] markSent: ${error.message}`);
  return data;
}

export async function markStatus({ id, status, eventAt = new Date(), extra = {} }) {
  const update = { status, ...extra };
  if (status === "delivered") update.delivered_at = eventAt.toISOString();
  if (status === "read") update.read_at = eventAt.toISOString();
  if (status === "replied") update.replied_at = eventAt.toISOString();
  if (status === "failed") update.failed_at = eventAt.toISOString();

  const { data, error } = await supabase
    .from("whatsapp_outbox")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`[whatsappOutboxRepo] markStatus: ${error.message}`);
  return data;
}

export async function markFailed({ id, errorCode, errorMessage }) {
  const { data, error } = await supabase
    .from("whatsapp_outbox")
    .update({
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error_code: errorCode || "unknown",
      last_error_message: errorMessage || null,
      locked_at: null,
      locked_by: null,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`[whatsappOutboxRepo] markFailed: ${error.message}`);
  return data;
}
