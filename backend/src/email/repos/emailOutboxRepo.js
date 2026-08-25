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
  personId = null,
  hostProfileId = null,
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
    // Carried so an inbound reply (Reply-To token = tracking_id) can be mapped
    // back to this (person, host) and threaded into the host's Room inbox.
    ...(personId ? { person_id: personId } : {}),
    ...(hostProfileId ? { host_profile_id: hostProfileId } : {}),
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

// ─── Monotonic status transitions ──────────────────────────────────
//
// A row's lifecycle only ever moves FORWARD. Provider delivery webhooks race
// the worker's own bookkeeping: Resend's email.delivered for a Gmail address
// routinely lands within ~1s of the API call returning, i.e. before/while
// markSent writes. With plain last-write-wins updates, a late markSent
// overwrote an already-`delivered` row back to `sent`, and the send looked
// unconfirmed forever. Ranking the states and refusing to move backwards makes
// the two writers order-independent.
//
// Later-than-delivered failure states (bounce/complaint) still apply on top of
// delivered — a delayed hard bounce hours after acceptance is a real sequence.
// The reverse (bounced → delivered) is not, and is now rejected.
export const STATUS_RANK = {
  queued: 0,
  retrying: 1,
  sending: 2,
  sent: 3,
  delivered: 4,
  failed: 5,
  bounced: 5,
  complaint: 6,
  suppressed: 7,
};

// Statuses a row may currently be in for `target` to be a forward move.
export function statusesAdvanceableTo(target) {
  const rank = STATUS_RANK[target];
  if (rank === undefined) return Object.keys(STATUS_RANK);
  return Object.keys(STATUS_RANK).filter((s) => STATUS_RANK[s] <= rank);
}

// Apply `status` + fields only if it is a forward move. Returns the row either
// way (an already-past row is returned untouched, not an error) so callers keep
// the same shape as the old unconditional update.
async function advanceOutbox(id, status, fields = {}) {
  const { data, error } = await supabase
    .from("email_outbox")
    .update({
      ...fields,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .in("status", statusesAdvanceableTo(status))
    .select();

  if (error) {
    console.error("[emailOutboxRepo] advanceOutbox error", error);
    throw new Error(`Failed to update email_outbox: ${error.message}`);
  }

  if (data && data.length) return data[0];

  // No row matched → it already sits at a later status. Leave it alone.
  return findById(id);
}

export async function markSent(id, { providerMessageId }) {
  const row = await advanceOutbox(id, "sent", {
    provider_message_id: providerMessageId ?? null,
  });

  // The status may have been held back (a webhook already advanced this row),
  // but the provider message id MUST still land — it is the only key delivery
  // webhooks can match on, so dropping it would strand every later event.
  if (providerMessageId && row && !row.provider_message_id) {
    return updateOutbox(id, { provider_message_id: providerMessageId });
  }

  return row;
}

export function markDelivered(id) {
  return advanceOutbox(id, "delivered");
}

export function markBounced(id, { errorCode = null, errorMessage = null } = {}) {
  return advanceOutbox(id, "bounced", {
    last_error_code: errorCode,
    last_error_message: errorMessage,
  });
}

export function markComplaint(id, { errorCode = null, errorMessage = null } = {}) {
  return advanceOutbox(id, "complaint", {
    last_error_code: errorCode,
    last_error_message: errorMessage,
  });
}

export function markFailed(id, { errorCode = null, errorMessage = null } = {}) {
  return advanceOutbox(id, "failed", {
    last_error_code: errorCode,
    last_error_message: errorMessage,
  });
}

export function markSuppressed(id) {
  return advanceOutbox(id, "suppressed");
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
  // Count on updated_at, not the non-existent sent_at column (the old filter
  // errored → returned 0 → the quota never applied). A row's updated_at is
  // bumped when it transitions to sent/delivered, so it's a sound "sent today".
  const { count, error } = await supabase
    .from("email_outbox")
    .select("id", { count: "exact", head: true })
    .in("status", ["sent", "delivered"])
    .gte("updated_at", sinceIso);
  if (error) {
    console.error("[emailOutboxRepo] countSentSinceUtc error", error);
    return 0;
  }
  return count ?? 0;
}

// Lifetime bounce/delivery counts for one address. Feeds bouncePolicy: an
// address that has bounced repeatedly and never once landed is dead, whatever
// the provider labelled today's bounce. Counts are head-only (no rows pulled).
export async function getDeliveryHistoryFor(email) {
  if (!email) return { bounced: 0, delivered: 0 };
  // to_email is stored as the sender typed it, so the match has to be
  // case-insensitive — but ILIKE treats _ and % as wildcards and plenty of real
  // addresses contain an underscore (amandaa_1996@…), which would silently pull
  // in other people's rows. Escape them so this stays an exact match.
  const pattern = String(email)
    .trim()
    .toLowerCase()
    .replace(/[\\%_]/g, (c) => `\\${c}`);

  async function countWithStatus(statuses) {
    const { count, error } = await supabase
      .from("email_outbox")
      .select("id", { count: "exact", head: true })
      .ilike("to_email", pattern)
      .in("status", statuses);
    if (error) {
      console.error("[emailOutboxRepo] getDeliveryHistoryFor error", error);
      return null;
    }
    return count ?? 0;
  }

  const [bounced, delivered] = await Promise.all([
    countWithStatus(["bounced"]),
    countWithStatus(["delivered"]),
  ]);

  // A failed count must never read as "0 deliveries" — that would let a
  // transient DB error suppress a healthy address. Claim a delivery instead.
  if (bounced === null || delivered === null) return { bounced: 0, delivered: 1 };

  return { bounced, delivered };
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

