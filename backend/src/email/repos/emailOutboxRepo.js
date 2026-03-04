// backend/src/email/repos/emailOutboxRepo.js

import { supabase } from "../../supabase.js";

export async function insertOutboxRow({
  fromEmail,
  toEmail,
  subject,
  htmlBody,
  textBody,
  campaignSendId = null,
  idempotencyKey = null,
  provider = "ses",
}) {
  const payload = {
    from_email: fromEmail,
    to_email: toEmail,
    subject,
    html_body: htmlBody ?? null,
    text_body: textBody ?? null,
    campaign_send_id: campaignSendId,
    idempotency_key: idempotencyKey,
    provider,
    status: "queued",
  };

  const { data, error } = await supabase
    .from("email_outbox")
    .upsert(payload, { onConflict: "idempotency_key" })
    .select()
    .single();

  if (error) {
    console.error("[emailOutboxRepo] insertOutboxRow error", error);
    throw new Error(`Failed to insert into email_outbox: ${error.message}`);
  }

  return data;
}

export async function findById(id) {
  if (!id) return null;
  const { data, error } = await supabase
    .from("email_outbox")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error("[emailOutboxRepo] findById error", error);
  }

  return data || null;
}

export async function claimOutboxBatch({ workerId, batchSize, now = new Date() }) {
  const { data, error } = await supabase.rpc(
    "claim_email_outbox_batch",
    {
      p_worker_id: workerId,
      p_batch_size: batchSize,
    },
  );

  if (error) {
    console.error("[emailOutboxRepo] claimOutboxBatch error", error);
    throw new Error(`Failed to claim email_outbox batch: ${error.message}`);
  }

  return data || [];
}

async function updateOutbox(id, fields) {
  const { data, error } = await supabase
    .from("email_outbox")
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("[emailOutboxRepo] updateOutbox error", error);
    throw new Error(`Failed to update email_outbox: ${error.message}`);
  }

  return data;
}

export function markSent(id, { providerMessageId }) {
  return updateOutbox(id, {
    status: "sent",
    provider_message_id: providerMessageId ?? null,
  });
}

export function markDelivered(id) {
  return updateOutbox(id, {
    status: "delivered",
  });
}

export function markBounced(id, { errorCode = null, errorMessage = null } = {}) {
  return updateOutbox(id, {
    status: "bounced",
    last_error_code: errorCode,
    last_error_message: errorMessage,
  });
}

export function markComplaint(id, { errorCode = null, errorMessage = null } = {}) {
  return updateOutbox(id, {
    status: "complaint",
    last_error_code: errorCode,
    last_error_message: errorMessage,
  });
}

export function markFailed(id, { errorCode = null, errorMessage = null } = {}) {
  return updateOutbox(id, {
    status: "failed",
    last_error_code: errorCode,
    last_error_message: errorMessage,
  });
}

export function markSuppressed(id) {
  return updateOutbox(id, {
    status: "suppressed",
  });
}

export function markRetrying(
  id,
  { attempts, sendAfter, errorCode = null, errorMessage = null },
) {
  return updateOutbox(id, {
    status: "retrying",
    attempts,
    send_after: sendAfter,
    last_error_code: errorCode,
    last_error_message: errorMessage,
  });
}

export async function findByProviderMessageId(providerMessageId) {
  if (!providerMessageId) return null;
  const { data, error } = await supabase
    .from("email_outbox")
    .select("*")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    console.error(
      "[emailOutboxRepo] findByProviderMessageId error",
      error,
    );
  }

  return data || null;
}

