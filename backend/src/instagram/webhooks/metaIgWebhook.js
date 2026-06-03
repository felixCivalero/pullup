// backend/src/instagram/webhooks/metaIgWebhook.js
//
// Meta Instagram webhook handler. Same Graph app + same delivery model as
// the WhatsApp webhook (whatsapp/webhooks/metaWebhook.js) — mirror its
// shape deliberately so the two channels stay structurally consistent.
//
// Two endpoints (mounted in index.js):
//   GET  /webhooks/instagram  → verification challenge (hub.challenge echo)
//   POST /webhooks/instagram  → event delivery
//
// We subscribe to two Instagram webhook fields:
//   * "comments" → drives the comment-trigger engine (comment "x" → DM).
//   * "messages" → inbound DMs; opens/refreshes the 24h IG messaging window.
//
// Meta retries on non-200, so: always 200 fast, treat events as idempotent.
//
// STATUS: skeleton. Verification + signature + payload routing are live and
// testable in sandbox. The two action hooks (private-reply send on a matching
// comment; inbound-DM persistence to threads) are stubbed with TODOs until a
// Meta token + the connect flow land — see the program design doc.

import crypto from "node:crypto";
import {
  IG_VERIFY_TOKEN,
  META_APP_SECRET,
  IG_SANDBOX_MODE,
} from "../config.js";
import { handleCommentEvent } from "../commentTriggers.js";
import { logger } from "../../logger.js";

/**
 * GET handler. Meta hits this once when you register the webhook URL.
 * Echo hub.challenge iff hub.verify_token matches our configured token.
 * Identical contract to the WhatsApp webhook — same verify token can cover
 * both subscriptions on the same app.
 */
export function handleIgWebhookVerification(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === IG_VERIFY_TOKEN) {
    logger?.info?.("[instagram/webhook] verification accepted");
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  logger?.warn?.("[instagram/webhook] verification rejected", { mode });
  res.status(403).send("forbidden");
}

/**
 * Constant-time HMAC-SHA256 over the raw body, using the shared Meta app
 * secret. Meta sends `X-Hub-Signature-256: sha256=<hex>`.
 */
function isValidSignature(rawBody, signatureHeader) {
  if (IG_SANDBOX_MODE) return true; // skip in dev/sandbox
  if (!META_APP_SECRET) return false;
  if (!signatureHeader || !rawBody) return false;

  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;

  const expected = signatureHeader.slice(prefix.length);
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
 * A comment arrived on a connected host's media. This is the trigger
 * surface for the "comment X → DM the signup link" automation.
 *
 * value shape (Instagram `comments` field): { id, text, from: { id, username },
 *   media: { id }, ... }
 *
 * TODO (needs token + connect flow):
 *   1. Resolve the owning host from the IG account id (instagram_connections).
 *   2. Match `text` against the host's configured keyword rules.
 *   3. On match, fire a Private Reply (one per comment, 7-day window) with
 *      the signup link carrying acquisition_channel=ig_comment + the comment id.
 */
async function handleComment(value, igAccountId) {
  logger?.info?.("[instagram/webhook] comment received", {
    igAccountId,
    commentId: value?.id,
    from: value?.from?.username,
    hasText: !!value?.text,
  });
  const result = await handleCommentEvent({ igAccountId, comment: value });
  if (result?.status && result.status !== "sent") {
    logger?.info?.("[instagram/webhook] comment not actioned", {
      commentId: value?.id,
      ...result,
    });
  }
}

/**
 * An inbound DM (or postback). Opens/refreshes the 24h IG messaging window
 * for this person — the IG analogue of upsertThreadFromMessage() for WhatsApp.
 *
 * messaging shape: { sender: { id }, recipient: { id }, message: { mid, text } }
 *
 * TODO (needs token + connect flow):
 *   1. Resolve host (recipient.id → instagram_connections) + person (sender.id → people.ig_user_id).
 *   2. Persist inbound message; upsert the IG conversation thread + window.
 *   3. STOP/opt-out handling, mirroring the WhatsApp handler.
 */
async function handleMessaging(messagingEvent, igAccountId) {
  const senderId = messagingEvent?.sender?.id;
  const text = messagingEvent?.message?.text || "";
  const isEcho = !!messagingEvent?.message?.is_echo;
  logger?.info?.("[instagram/webhook] message received", {
    igAccountId, from: senderId, hasText: !!text, isEcho,
  });
  // Skip our own outbound echoes + malformed/self events.
  if (isEcho || !senderId || String(senderId) === String(igAccountId)) return;

  try {
    // 1. Resolve the host whose IG account received the DM.
    const { getCredentialsByIgUserId } = await import("../repos/instagramConnectionsRepo.js");
    const creds = await getCredentialsByIgUserId(igAccountId);
    if (!creds?.hostProfileId) {
      logger?.warn?.("[instagram/webhook] no connected host for ig account", { igAccountId });
      return;
    }

    // 2. Resolve (or mint) the person by their IGSID — binds the IG identity.
    const { resolvePersonByIdentity } = await import("../../services/personResolution.js");
    const { personId } = await resolvePersonByIdentity({
      identifiers: { igUserId: String(senderId) },
      profile: { acquisition_channel: "ig_dm" },
      source: "ig",
    });
    if (!personId) return;

    // 3. Open/refresh the 24h IG window + log the inbound to the timeline.
    const { upsertThreadFromMessage } = await import("../repos/instagramThreadsRepo.js");
    await upsertThreadFromMessage({
      personId,
      hostProfileId: creds.hostProfileId,
      igUserId: String(senderId),
      direction: "inbound",
      preview: text || "[media]",
    });

    const { logPersonEvent } = await import("../../services/personTimeline.js");
    await logPersonEvent({
      personId,
      hostId: creds.hostProfileId,
      type: "message_in",
      channel: "instagram",
      direction: "in",
      body: text || "[media]",
      metadata: { source: "instagram_webhook", igAccountId },
    }).catch(() => {});
  } catch (err) {
    logger?.error?.("[instagram/webhook] inbound DM handling error", { err: err.message });
  }
}

export async function handleIgWebhookDelivery(req, res) {
  const signature = req.headers["x-hub-signature-256"];
  if (!isValidSignature(req.rawBody, signature)) {
    logger?.warn?.("[instagram/webhook] invalid signature");
    res.status(403).send("forbidden");
    return;
  }

  const body = req.body || {};
  try {
    // Instagram webhooks arrive with object: "instagram". Each entry carries
    // the IG account id + either `changes` (comments) or `messaging` (DMs).
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const igAccountId = entry?.id || null;

      // Comments (and other field changes) arrive under `changes`.
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        if (change?.field === "comments") {
          await handleComment(change.value || {}, igAccountId).catch((err) =>
            logger?.error?.("[instagram/webhook] comment handler error", {
              err: err.message,
            }),
          );
        }
      }

      // Inbound DMs arrive under `messaging` (Messenger-style envelope).
      const messaging = Array.isArray(entry?.messaging) ? entry.messaging : [];
      for (const m of messaging) {
        await handleMessaging(m, igAccountId).catch((err) =>
          logger?.error?.("[instagram/webhook] messaging handler error", {
            err: err.message,
          }),
        );
      }
    }
  } catch (err) {
    logger?.error?.("[instagram/webhook] dispatch error", { err: err.message });
  }

  // Always 200 — Meta retries on non-200 and one bad event shouldn't stall.
  res.status(200).send("ok");
}
