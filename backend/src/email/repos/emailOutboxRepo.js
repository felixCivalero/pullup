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
  category = "transactional",
  campaignTag = null,
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
    category,
    status: "queued",
    ...(campaignTag ? { campaign_tag: campaignTag } : {}),
  };

  // No idempotency key → every call is a distinct send. Plain insert.
  // (NULL idempotency_key never collides on the unique index anyway, but
  // being explicit keeps the conflict path below purely about real keys.)
  if (!idempotencyKey) {
    const { data, error } = await supabase
      .from("email_outbox")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("[emailOutboxRepo] insertOutboxRow error", error);
      throw new Error(`Failed to insert into email_outbox: ${error.message}`);
    }
    return data;
  }

  // Idempotency key present → the row for this key must be written AT MOST
  // ONCE and never overwritten. The previous code upserted with
  // status:"queued", so a repeated enqueue (e.g. the every-15-min reminder
  // cron re-running across its 25h window) reset an already-sent row back to
  // "queued" and the worker re-sent it — verified in prod as 14–16 duplicate
  // 24h reminders per guest. ON CONFLICT DO NOTHING (ignoreDuplicates) makes
  // the repeat a true no-op; we then load and return the untouched existing
  // row so callers still receive it.
  const { data: inserted, error } = await supabase
    .from("email_outbox")
    .upsert(payload, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select();

  if (error) {
    console.error("[emailOutboxRepo] insertOutboxRow error", error);
    throw new Error(`Failed to insert into email_outbox: ${error.message}`);
  }

  // A fresh insert returns the new row; a conflict (DO NOTHING) returns [].
  if (inserted && inserted.length) return inserted[0];

  const { data: existing, error: fetchError } = await supabase
    .from("email_outbox")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (fetchError) {
    console.error("[emailOutboxRepo] insertOutboxRow fetch-existing error", fetchError);
    throw new Error(`Failed to load existing email_outbox row: ${fetchError.message}`);
  }

  return existing;
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

// Count of rows sent today (UTC midnight to UTC midnight). Used by the
// outbox worker to enforce a daily provider quota. Returns 0 if the
// query fails so a transient DB error never blocks sending.
export async function countSentSinceUtc(sinceIso) {
  const { count, error } = await supabase
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .in("status", ["sent", "delivered"])
    .gte("sent_at", sinceIso);
  if (error) {
    console.error("[emailOutboxRepo] countSentSinceUtc error", error);
    return 0;
  }
  return count ?? 0;
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

