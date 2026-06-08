// backend/src/whatsapp/index.js
//
// Public API for the WhatsApp delivery module. The rest of the codebase
// MUST call only the functions exported here — never reach into providers
// or repos directly. This is the same boundary the email module enforces
// (`backend/src/email/index.js`) and is what keeps the door open to
// swapping BSPs or extracting the module into its own service later.
//
// Surface:
//   sendTemplate({ to, templateKey, variables, ... })
//   sendText({ to, body, ... })            // freeform, requires open 24h window
//   handleProviderEvent({ provider, rawHeaders, rawBody })
//   isPhoneSuppressed(phoneE164)

import {
  WHATSAPP_PROVIDER,
  WHATSAPP_SANDBOX_MODE,
  META_PHONE_NUMBER_ID,
} from "./config.js";
import * as metaCloud from "./providers/metaCloudClient.js";
import { insertOutboxRow, markSent, markFailed } from "./repos/whatsappOutboxRepo.js";
import { isSuppressed } from "./repos/whatsappSuppressionsRepo.js";
import { upsertThreadFromMessage, isConversationWindowOpen } from "./repos/whatsappThreadsRepo.js";
import { estimateCostMicros } from "./cost/pricing.js";
import { countryFromE164, isValidE164 } from "../utils/phone.js";
import { renderTemplate, getTemplate, activeKey } from "./templates/registry.js";
import { logger } from "../logger.js";

const SANDBOX_PHONE_NUMBER_ID = "sandbox-phone-number-id";

function activeProvider() {
  // Single provider today; this is the seam where additional BSPs
  // (Twilio, 360dialog, MessageBird) would plug in.
  return metaCloud;
}

function fromPhoneNumberId() {
  if (WHATSAPP_SANDBOX_MODE) return SANDBOX_PHONE_NUMBER_ID;
  return META_PHONE_NUMBER_ID;
}

/**
 * Send a templated message. The canonical entry point for any outbound
 * message OUTSIDE an open 24h conversation window — Meta requires
 * pre-approved templates here.
 *
 * Returns the persisted whatsapp_outbox row (with provider_message_id +
 * sent_at populated in the happy path).
 */
export async function sendTemplate({
  to,                  // E.164 phone
  templateKey,
  variables,
  locale = null,
  personId = null,
  profileId = null,
  hostProfileId = null,
  campaignSendId = null,
  campaignTag = null,
  legalBasis = "consent",
  idempotencyKey = null,
}) {
  if (!isValidE164(to)) {
    throw new Error(`[whatsapp] sendTemplate: invalid E.164 phone '${to}'`);
  }
  // Resolve the logical key (e.g. "rsvp_confirm") to whatever template is live
  // for it right now (v1, or its host-leads _v2 once flipped). Single chokepoint
  // for every send path — both dispatch() and the direct WhatsApp-king RSVP
  // confirm in index.js funnel through here, so callers never carry the version.
  templateKey = activeKey(templateKey);
  const tmpl = getTemplate(templateKey);

  const sup = await isSuppressed(to);
  if (sup.suppressed) {
    logger?.info?.("[whatsapp] sendTemplate suppressed", {
      to,
      templateKey,
      reason: sup.row?.reason,
    });
    const row = await insertOutboxRow({
      personId,
      profileId,
      toPhoneE164: to,
      fromPhoneNumberId: fromPhoneNumberId(),
      hostProfileId,
      direction: "outbound",
      templateKey,
      templateLocale: locale || tmpl.locale,
      templateVariables: variables,
      bodyText: renderTemplate(templateKey, variables),
      category: tmpl.category,
      country: countryFromE164(to),
      campaignSendId,
      campaignTag,
      legalBasis,
      idempotencyKey,
      sandboxMode: WHATSAPP_SANDBOX_MODE,
    });
    await markFailed({
      id: row.id,
      errorCode: "suppressed",
      errorMessage: `Phone is on whatsapp_suppressions (${sup.row?.reason})`,
    });
    return { ...row, status: "suppressed" };
  }

  const country = countryFromE164(to);
  const costMicros = estimateCostMicros({ country, category: tmpl.category });

  // Queue first, then send. Means a crash after send-but-before-mark still
  // has the audit trail. Matches the email module's invariant.
  const row = await insertOutboxRow({
    personId,
    profileId,
    toPhoneE164: to,
    fromPhoneNumberId: fromPhoneNumberId(),
    hostProfileId,
    direction: "outbound",
    templateKey,
    templateLocale: locale || tmpl.locale,
    templateVariables: variables,
    bodyText: renderTemplate(templateKey, variables),
    category: tmpl.category,
    country,
    costMicros,
    sandboxMode: WHATSAPP_SANDBOX_MODE,
    campaignSendId,
    campaignTag,
    legalBasis,
    idempotencyKey,
  });

  try {
    const result = await activeProvider().sendTemplate({
      to,
      templateKey,
      variables,
      locale,
    });
    const updated = await markSent({
      id: row.id,
      providerMessageId: result.provider_message_id,
    });
    // Thread bookkeeping (only when we know who the person is).
    if (personId && hostProfileId) {
      await upsertThreadFromMessage({
        personId,
        hostProfileId,
        phoneE164: to,
        direction: "outbound",
        preview: result.body_text,
        outboxId: updated.id,
      });
    }
    return updated;
  } catch (err) {
    logger?.error?.("[whatsapp] sendTemplate provider error", {
      to,
      templateKey,
      code: err.code,
      message: err.message,
    });
    await markFailed({
      id: row.id,
      errorCode: err.code || "provider_error",
      errorMessage: err.message,
    });
    throw err;
  }
}

/**
 * Send a freeform text message. Caller is responsible for knowing the
 * 24h conversation window is open. (Use `assertWindowOpen(...)` helper
 * if you want a runtime check.)
 */
export async function sendText({
  to,
  body,
  personId = null,
  profileId = null,
  hostProfileId = null,
  campaignSendId = null,
  campaignTag = null,
  legalBasis = "consent",
  idempotencyKey = null,
}) {
  if (!isValidE164(to)) {
    throw new Error(`[whatsapp] sendText: invalid E.164 phone '${to}'`);
  }
  const sup = await isSuppressed(to);
  if (sup.suppressed) {
    return { status: "suppressed", to, reason: sup.row?.reason };
  }

  const country = countryFromE164(to);
  const costMicros = estimateCostMicros({ country, category: "service" });

  const row = await insertOutboxRow({
    personId,
    profileId,
    toPhoneE164: to,
    fromPhoneNumberId: fromPhoneNumberId(),
    hostProfileId,
    direction: "outbound",
    bodyText: body,
    category: "service",
    conversationWindowOpen: true,
    country,
    costMicros,
    sandboxMode: WHATSAPP_SANDBOX_MODE,
    campaignSendId,
    campaignTag,
    legalBasis,
    idempotencyKey,
  });

  try {
    const result = await activeProvider().sendText({ to, body });
    const updated = await markSent({
      id: row.id,
      providerMessageId: result.provider_message_id,
    });
    if (personId && hostProfileId) {
      await upsertThreadFromMessage({
        personId,
        hostProfileId,
        phoneE164: to,
        direction: "outbound",
        preview: body,
        outboxId: updated.id,
      });
    }
    return updated;
  } catch (err) {
    await markFailed({
      id: row.id,
      errorCode: err.code || "provider_error",
      errorMessage: err.message,
    });
    throw err;
  }
}

export async function isPhoneSuppressed(phoneE164) {
  const { suppressed } = await isSuppressed(phoneE164);
  return suppressed;
}

export async function assertWindowOpen({ personId, hostProfileId }) {
  const open = await isConversationWindowOpen({ personId, hostProfileId });
  if (!open) {
    const err = new Error(
      "Conversation window is closed; use sendTemplate() instead.",
    );
    err.code = "window_closed";
    throw err;
  }
}

// Re-export for callers that want to poke deeper but go through the index.
export { WHATSAPP_PROVIDER, WHATSAPP_SANDBOX_MODE };
