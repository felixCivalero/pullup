// backend/src/whatsapp/webhooks/metaWebhook.js
//
// Meta WhatsApp Cloud API webhook handler.
//
// Two endpoints:
//   GET  /webhooks/whatsapp  → verification challenge (hub.challenge echo)
//   POST /webhooks/whatsapp  → event delivery (status updates + inbound messages)
//
// Meta retries failed deliveries with exponential backoff, so:
//   * Always return 200 fast (even on processing errors — we log + move on)
//   * Treat duplicate events as idempotent (status transitions are commutative)

import crypto from "node:crypto";
import {
  META_VERIFY_TOKEN,
  META_APP_SECRET,
  WHATSAPP_SANDBOX_MODE,
} from "../config.js";
import { recordEvent } from "../repos/whatsappEventsRepo.js";
import {
  findByProviderMessageId,
  markStatus,
  insertOutboxRow,
} from "../repos/whatsappOutboxRepo.js";
import { suppress } from "../repos/whatsappSuppressionsRepo.js";
import { upsertThreadFromMessage } from "../repos/whatsappThreadsRepo.js";
import { supabase } from "../../supabase.js";
import { logPersonEvent } from "../../services/personTimeline.js";
import { bumpMessageStatus } from "../../services/messageStatus.js";
import { logger } from "../../logger.js";
import { dedupeKey } from "../../lib/idempotency.js";
import { captureError } from "../../observability.js";

/**
 * GET handler. Meta hits this once when you register the webhook URL.
 * If hub.verify_token matches our configured secret, echo hub.challenge.
 */
export function handleVerification(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === META_VERIFY_TOKEN) {
    logger?.info?.("[whatsapp/webhook] verification accepted");
    res.status(200).send(String(challenge ?? ""));
    return;
  }

  logger?.warn?.("[whatsapp/webhook] verification rejected", { mode });
  res.status(403).send("forbidden");
}

/**
 * Constant-time HMAC-SHA256 check using the app secret. Meta sends
 * `X-Hub-Signature-256: sha256=<hex>` over the raw request body.
 */
function isValidSignature(rawBody, signatureHeader) {
  if (WHATSAPP_SANDBOX_MODE) return true; // skip in dev/sandbox
  if (!META_APP_SECRET) return false;
  if (!signatureHeader || !rawBody) return false;

  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;

  const expected = signatureHeader.slice(expectedPrefix.length);
  const computed = crypto
    .createHmac("sha256", META_APP_SECRET)
    .update(rawBody)
    .digest("hex");

  if (expected.length !== computed.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(computed, "hex"),
  );
}

/**
 * Resolve the contact's person_id + host_profile_id from the WABA
 * phone-number-id (the row's `from_phone_number_id`) — for now we look
 * the contact up by phone, and the host is "whoever owns the receiving
 * WABA number" (single-tenant today).
 */
async function resolvePerson(phoneE164, hostProfileId = null) {
  if (!phoneE164) return null;
  // Fast path: someone already carries this phone on people.phone_e164 (legacy +
  // RSVP-captured numbers live here; person_identities was email-only backfilled,
  // so an identity-only lookup would MISS them and fork a duplicate). Anchor to
  // that person and record the phone in the resolution layer so a future
  // cross-channel touch resolves by identity too — never a merge, just a link.
  const { data } = await supabase
    .from("people")
    .select("id, host_id")
    .eq("phone_e164", phoneE164)
    .order("created_at", { ascending: true })
    .limit(1);
  if (data?.[0]) {
    try {
      const { linkIdentitiesToPerson } = await import("../../services/personResolution.js");
      await linkIdentitiesToPerson({
        personId: data[0].id,
        identifiers: { phone: phoneE164 },
        profile: { phone_e164: phoneE164 },
        source: "whatsapp",
      });
    } catch { /* best-effort: the message still threads */ }
    return data[0];
  }
  // Nobody carries this phone — resolve through the identity layer, which links
  // an existing identity match or CREATES the person (+ phone identity + source
  // profile) so an inbound from a fresh number threads into a real atom instead
  // of orphaning. Falls back to null so the webhook never 500s.
  try {
    const { resolvePersonByIdentity } = await import("../../services/personResolution.js");
    const r = await resolvePersonByIdentity({
      identifiers: { phone: phoneE164 },
      profile: { phone_e164: phoneE164, ...(hostProfileId ? { host_id: hostProfileId } : {}) },
      source: "whatsapp",
    });
    return r?.personId ? { id: r.personId, host_id: hostProfileId || null } : null;
  } catch (e) {
    logger?.warn?.("[whatsapp/webhook] identity resolve failed", { error: e?.message });
    return null;
  }
}

async function resolveHostProfileForPhoneNumberId(/* phoneNumberId */) {
  // Single-tenant: the first profile with phone_verified is the host the
  // shared PullUp WABA number is "speaking for". Multi-tenant: look up by
  // phone_number_id mapping table — to be added when we onboard premium
  // hosts with their own numbers.
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);
  return data?.[0]?.id || null;
}

function ensurePlus(phone) {
  if (!phone) return null;
  return phone.startsWith("+") ? phone : `+${phone}`;
}

async function handleStatusUpdate(status) {
  const providerMessageId = status?.id;
  const messageStatus = status?.status; // sent / delivered / read / failed
  const recipient = ensurePlus(status?.recipient_id);

  await recordEvent({
    providerMessageId,
    eventType: `status.${messageStatus}`,
    recipient,
    payload: status,
  });

  const outboxRow = await findByProviderMessageId({
    provider: "meta_cloud",
    providerMessageId,
  });
  if (!outboxRow) {
    logger?.warn?.("[whatsapp/webhook] status for unknown message", {
      providerMessageId,
      messageStatus,
    });
    return;
  }

  const eventAt = status?.timestamp
    ? new Date(Number(status.timestamp) * 1000)
    : new Date();

  if (messageStatus === "failed") {
    const errCode = status?.errors?.[0]?.code;
    const errMsg = status?.errors?.[0]?.title;
    await markStatus({
      id: outboxRow.id,
      status: "failed",
      eventAt,
      extra: { last_error_code: String(errCode || "unknown"), last_error_message: errMsg || null },
    });
    // Mirror the failure onto the Room bubble so the host sees a red "!" live.
    await bumpMessageStatus({ key: "provider_mid", value: providerMessageId, status: "failed", at: eventAt });
    // Unreachable / not-on-WhatsApp errors → suppress for future sends.
    if (errCode && [131026, 131047, 131051].includes(Number(errCode))) {
      await suppress({
        phoneE164: outboxRow.to_phone_e164,
        reason: "not_on_whatsapp",
        source: "meta_webhook",
        details: { code: errCode, message: errMsg },
      });
    }
    return;
  }

  if (["sent", "delivered", "read"].includes(messageStatus)) {
    await markStatus({ id: outboxRow.id, status: messageStatus, eventAt });
    // Push the tick (sent → delivered → read) onto the Room bubble live.
    await bumpMessageStatus({ key: "provider_mid", value: providerMessageId, status: messageStatus, at: eventAt });
  }
}

async function handleInboundMessage(message, contacts) {
  const fromPhone = ensurePlus(message?.from);
  const providerMessageId = message?.id;
  const type = message?.type;
  const text = message?.text?.body || null;
  const profileName = contacts?.[0]?.profile?.name || null;

  await recordEvent({
    providerMessageId,
    eventType: `message.${type || "unknown"}`,
    recipient: fromPhone,
    payload: { message, contacts },
  });

  // STOP / UNSUBSCRIBE handling — opt the user out.
  if (text && /^\s*(stop|unsubscribe|stopp)\s*$/i.test(text)) {
    await suppress({
      phoneE164: fromPhone,
      reason: "opt_out",
      source: "meta_webhook_stop",
      details: { profileName },
    });
  }

  const eventAt = message?.timestamp
    ? new Date(Number(message.timestamp) * 1000)
    : new Date();

  const hostProfileId = await resolveHostProfileForPhoneNumberId(
    /* phoneNumberId from value.metadata */
  );
  const personRow = await resolvePerson(fromPhone, hostProfileId);

  // Record the inbound message in whatsapp_outbox (direction=inbound). The
  // idempotency key makes a Meta redelivery of this same inbound a no-op instead
  // of a second phantom inbound row.
  const inboundRow = await insertOutboxRow({
    personId: personRow?.id || null,
    toPhoneE164: fromPhone,         // for inbound, "to_phone_e164" stores the contact's phone
    fromPhoneNumberId: "inbound",
    hostProfileId,
    direction: "inbound",
    bodyText: text,
    bodyMedia: type !== "text" ? { type, raw: message } : null,
    category: "service",
    sandboxMode: WHATSAPP_SANDBOX_MODE,
    idempotencyKey: dedupeKey("wa:in", providerMessageId),
  });

  // Mark it as delivered (it arrived) and update provider_message_id +
  // status in a follow-up so the column is set.
  await supabase
    .from("whatsapp_outbox")
    .update({
      provider_message_id: providerMessageId,
      status: "delivered",
      delivered_at: eventAt.toISOString(),
    })
    .eq("id", inboundRow.id);

  // Thread bookkeeping — opens / refreshes 24h freeform window.
  if (personRow?.id && hostProfileId) {
    await upsertThreadFromMessage({
      personId: personRow.id,
      hostProfileId,
      phoneE164: fromPhone,
      direction: "inbound",
      preview: text || `[${type}]`,
      outboxId: inboundRow.id,
      at: eventAt,
    });

    // Fold the reply into the person's timeline so it shows in the host's
    // chat thread — the inbound half of the conversation. Best-effort (a
    // logging hiccup must not 500 the webhook and trigger a Meta retry storm),
    // but no longer SILENT: a failure is captured, and the dedupe_key makes a
    // genuine redelivery a no-op rather than a duplicate bubble.
    await logPersonEvent({
      personId: personRow.id,
      hostId: hostProfileId,
      type: "message_in",
      channel: "whatsapp",
      direction: "in",
      body: text || `[${type}]`,
      occurredAt: eventAt,
      metadata: { source: "whatsapp_webhook", outboxId: inboundRow.id },
      dedupeKey: dedupeKey("wa:msgin", providerMessageId),
    }).catch((err) => {
      logger?.error?.("[whatsapp/webhook] timeline log failed", {
        provider_message_id: providerMessageId, person_id: personRow.id, error: err?.message,
      });
      captureError(err, { where: "whatsapp_webhook.logPersonEvent", providerMessageId });
    });
  }
}

export async function handleEventDelivery(req, res) {
  // Signature first — short-circuit before any DB writes.
  const signature = req.headers["x-hub-signature-256"];
  const rawBody = req.rawBody;
  if (!isValidSignature(rawBody, signature)) {
    logger?.warn?.("[whatsapp/webhook] invalid signature");
    res.status(403).send("forbidden");
    return;
  }

  const body = req.body || {};
  try {
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field !== "messages") continue;
        const value = change.value || {};

        const statuses = Array.isArray(value.statuses) ? value.statuses : [];
        for (const s of statuses) {
          await handleStatusUpdate(s).catch((err) =>
            logger?.error?.("[whatsapp/webhook] status handler error", {
              err: err.message,
            }),
          );
        }

        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const m of messages) {
          await handleInboundMessage(m, value.contacts).catch((err) =>
            logger?.error?.("[whatsapp/webhook] message handler error", {
              err: err.message,
            }),
          );
        }
      }
    }
  } catch (err) {
    logger?.error?.("[whatsapp/webhook] dispatch error", { err: err.message });
  }

  // Always 200. Meta will retry on non-200 and a single bad event
  // shouldn't stall the queue.
  res.status(200).send("ok");
}
