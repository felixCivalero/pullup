// backend/src/services/phoneVerification.js
//
// Magic-link phone verification.
//
// 1. startVerification(phone, intent, payload) ─ normalises the phone,
//    generates a single-use token, sends it as a WhatsApp magic link
//    using the auth_magic_link template, and returns the row metadata.
//    Caller decides whether to surface anything to the user (signup flow
//    fires this in the background as soon as the phone field is valid).
//
// 2. redeemToken(rawToken) ─ verifies the SHA-256 hash, expiry, and
//    one-time use, then writes phone_verified_at on people / profiles,
//    records the opt-in, and returns the payload so the caller can
//    resume the original flow (signup completion, RSVP, etc.).
//
// SECURITY:
//   * Only SHA-256 hashes are persisted. Raw tokens live ONLY in the
//     magic-link URL we WhatsApp to the user.
//   * Tokens are 32 bytes of crypto-random data → base64url (43 chars).
//   * Tokens are single-use: redeemed_at is one-way.
//   * Expiry is short (15 min default, configurable).

import crypto from "node:crypto";
import { supabase } from "../supabase.js";
import { normalisePhone } from "../utils/phone.js";
import { sendTemplate, isPhoneSuppressed } from "../whatsapp/index.js";
import { recordOptIn } from "../whatsapp/repos/phoneOptInsRepo.js";
import {
  APP_BASE_URL,
  MAGIC_LINK_PATH,
  MAGIC_LINK_TTL_MINUTES,
  WHATSAPP_SANDBOX_MODE,
} from "../whatsapp/config.js";
import { logger } from "../logger.js";

const VALID_INTENTS = new Set([
  "verify_phone",
  "host_signup",
  "rsvp_verify",
  "vip_invite",
  "login",
]);

function generateRawToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function buildMagicLinkUrl(rawToken) {
  const base = APP_BASE_URL.replace(/\/$/, "");
  const path = MAGIC_LINK_PATH.startsWith("/")
    ? MAGIC_LINK_PATH
    : `/${MAGIC_LINK_PATH}`;
  return `${base}${path}/${rawToken}`;
}

/**
 * Kick off a magic-link verification.
 *
 * @param {object} args
 * @param {string} args.phone           Raw user-typed phone string.
 * @param {string} args.intent          One of VALID_INTENTS.
 * @param {object} [args.payload]       Flow state to round-trip.
 * @param {string} [args.defaultCountry] ISO-3166-1 alpha-2, used when input lacks `+`.
 * @param {string} [args.ipAddress]
 * @param {string} [args.userAgent]
 * @param {string} [args.personId]
 * @param {string} [args.profileId]
 */
export async function startVerification({
  phone,
  intent,
  payload = {},
  defaultCountry = null,
  ipAddress = null,
  userAgent = null,
  personId = null,
  profileId = null,
  templateKey = "auth_magic_link",
}) {
  if (!VALID_INTENTS.has(intent)) {
    return { ok: false, error: `invalid intent '${intent}'` };
  }

  const norm = normalisePhone(phone, defaultCountry);
  if (!norm.ok) return { ok: false, error: norm.error };

  if (await isPhoneSuppressed(norm.e164)) {
    return { ok: false, error: "phone is suppressed", e164: norm.e164 };
  }

  const rawToken = generateRawToken();
  const token_hash = hashToken(rawToken);
  const expires_at = new Date(
    Date.now() + MAGIC_LINK_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  const { data: tokenRow, error: insertError } = await supabase
    .from("magic_link_tokens")
    .insert({
      token_hash,
      phone_e164: norm.e164,
      intent,
      person_id: personId,
      profile_id: profileId,
      payload,
      expires_at,
      created_ip: ipAddress,
      created_user_agent: userAgent,
      send_channel: "whatsapp",
      send_attempts: 1,
      last_sent_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (insertError) {
    logger?.error?.("[phoneVerification] token insert failed", insertError);
    return { ok: false, error: "could not create token" };
  }

  const link = buildMagicLinkUrl(rawToken);

  try {
    await sendTemplate({
      to: norm.e164,
      templateKey,
      variables: { link },
      personId,
      profileId,
      legalBasis: "consent",
      idempotencyKey: `magiclink:${token_hash}`,
    });
  } catch (err) {
    logger?.error?.("[phoneVerification] sendTemplate failed", {
      e164: norm.e164,
      err: err.message,
    });
    return { ok: false, error: "could not send WhatsApp message" };
  }

  // Sandbox dev convenience: surface the link so the dev can tap it
  // without an actual WhatsApp account. Never surface this in production.
  const sandbox_link = WHATSAPP_SANDBOX_MODE ? link : null;

  return {
    ok: true,
    e164: norm.e164,
    country: norm.country,
    token_id: tokenRow.id,
    expires_at,
    sandbox_link,
  };
}

/**
 * Redeem a raw token from the magic-link URL. Atomically marks it
 * redeemed; flips phone_verified_at on people / profiles; records the
 * channel opt-in. Returns the payload so the caller can resume.
 */
export async function redeemToken({
  rawToken,
  ipAddress = null,
  userAgent = null,
}) {
  if (!rawToken || typeof rawToken !== "string") {
    return { ok: false, error: "missing token" };
  }
  const token_hash = hashToken(rawToken);

  const { data: row, error: lookupError } = await supabase
    .from("magic_link_tokens")
    .select("*")
    .eq("token_hash", token_hash)
    .maybeSingle();
  if (lookupError && lookupError.code !== "PGRST116") {
    logger?.error?.("[phoneVerification] lookup error", lookupError);
    return { ok: false, error: "lookup failed" };
  }
  if (!row) return { ok: false, error: "token not found" };
  if (row.redeemed_at) return { ok: false, error: "token already used" };
  if (new Date(row.expires_at) < new Date()) {
    return { ok: false, error: "token expired" };
  }

  // Atomic redeem: only succeeds if redeemed_at is still null.
  const { data: redeemed, error: redeemError } = await supabase
    .from("magic_link_tokens")
    .update({
      redeemed_at: new Date().toISOString(),
      redeemed_ip: ipAddress,
      redeemed_user_agent: userAgent,
    })
    .eq("id", row.id)
    .is("redeemed_at", null)
    .select()
    .single();
  if (redeemError || !redeemed) {
    return { ok: false, error: "token already used" };
  }

  // Resolve the person if the token wasn't minted with one. The mint-time
  // lookup (by phone_e164) can miss when the verified number isn't yet on the
  // person — e.g. a returning guest verifying a NEW number, or a race between
  // the RSVP phone write and the frontend's verify-start. By redeem time the
  // RSVP has fully committed, so the email carried in the payload resolves
  // reliably; phone is the fallback.
  let personId = row.person_id;
  if (!personId) {
    const email = String(row.payload?.email || "").trim().toLowerCase();
    if (email) {
      const { data: byEmail } = await supabase
        .from("people").select("id").eq("email", email).maybeSingle();
      personId = byEmail?.id || null;
    }
    if (!personId && row.phone_e164) {
      const { data: byPhone } = await supabase
        .from("people").select("id").eq("phone_e164", row.phone_e164).maybeSingle();
      personId = byPhone?.id || null;
    }
    if (personId) {
      logger?.info?.("[phoneVerification] resolved orphaned token to person", {
        token_id: row.id, personId,
      });
    }
  }

  const nowIso = new Date().toISOString();

  // Mark phone_verified_at on whichever record(s) the token references.
  // Rule: the latest verified number CONTROLS the phone row — the confirmed
  // E.164 becomes the canonical `phone` too, and phone_verified_at is the gate
  // dispatch() keys off before anything ships on WhatsApp.
  if (personId) {
    const { error: pErr } = await supabase
      .from("people")
      .update({
        phone: row.phone_e164,
        phone_e164: row.phone_e164,
        phone_verified_at: nowIso,
        phone_verification_source: row.intent,
      })
      .eq("id", personId);
    if (pErr) {
      logger?.error?.("[phoneVerification] people writeback failed", {
        personId, err: pErr.message,
      });
    }
  } else {
    logger?.warn?.("[phoneVerification] redeemed but no person to link", {
      token_id: row.id, phone_e164: row.phone_e164, intent: row.intent,
    });
  }
  if (row.profile_id) {
    const { error: prErr } = await supabase
      .from("profiles")
      .update({
        phone_e164: row.phone_e164,
        phone_verified_at: nowIso,
        phone_verification_source: row.intent,
      })
      .eq("id", row.profile_id);
    if (prErr) {
      logger?.error?.("[phoneVerification] profiles writeback failed", {
        profileId: row.profile_id, err: prErr.message,
      });
    }
  }

  // Record the WhatsApp opt-in. Verification implies opt-in to the
  // channel — they tapped a WhatsApp message to confirm.
  try {
    await recordOptIn({
      phoneE164: row.phone_e164,
      channel: "whatsapp",
      source: "magic_link_verify",
      personId,
      profileId: row.profile_id,
      legalBasis: "consent",
      ipAddress,
      userAgent,
      gdprPayload: { intent: row.intent, token_id: row.id },
    });
  } catch (err) {
    logger?.warn?.("[phoneVerification] opt-in record failed (continuing)", {
      err: err.message,
    });
  }

  return {
    ok: true,
    intent: row.intent,
    phone_e164: row.phone_e164,
    person_id: personId,
    profile_id: row.profile_id,
    payload: row.payload || {},
  };
}
