// backend/src/email/config.js
import dotenv from "dotenv";
// override:true — .env wins over PM2's baked-in env (see index.js note).
dotenv.config({ override: true });

const bool = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  return String(value).toLowerCase() === "true";
};

export const EMAIL_PROVIDER =
  process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "resend";

export const SES_REGION = process.env.SES_REGION || null;

export const SES_FROM_EMAIL =
  process.env.SES_FROM_EMAIL || '"PullUp" <no-reply@pullup.se>';

// The display name guests/hosts see as the sender. A bare from-address (e.g.
// the box env is just "noreply@pullup.se") gets wrapped so the inbox shows
// "PullUp", not the raw address. Pass-through if a display name is already set.
export const SENDER_NAME = process.env.EMAIL_SENDER_NAME || "PullUp";
export function formatSender(from) {
  const v = (from || "").trim();
  if (!v || v.includes("<")) return v || SES_FROM_EMAIL;
  return `"${SENDER_NAME}" <${v}>`;
}

export const SES_CONFIGURATION_SET_NAME =
  process.env.SES_CONFIGURATION_SET_NAME || null;

export const SES_TEST_MODE = bool(process.env.SES_TEST_MODE, true);

const emailSendRateEnv =
  process.env.EMAIL_SEND_RATE_PER_SEC ?? process.env.EMAIL_SEND_RATE_PER_SECOND;

export const EMAIL_SEND_RATE_PER_SEC = Number(emailSendRateEnv || 10);

export const EMAIL_MAX_RETRIES = Number(process.env.EMAIL_MAX_RETRIES || 6);

export const EMAIL_RETRY_BASE_SECONDS = Number(
  process.env.EMAIL_RETRY_BASE_SECONDS || 15,
);

export const EMAIL_WORKER_BATCH_SIZE = Number(
  process.env.EMAIL_WORKER_BATCH_SIZE || 50,
);

// Daily send guard — a RUNAWAY-LOOP backstop, not the provider's hard limit.
// Set well above real daily volume (historical peak ~300/day) so it never
// defers a legitimate send, while still capping a bug that mass-mails guests.
// Env-override per your provider plan; 0 disables. Counted across the UTC day
// via email_outbox.updated_at (rows are stamped on send).
export const EMAIL_DAILY_LIMIT = Number(
  process.env.EMAIL_DAILY_LIMIT ?? 3000,
);

export const WEBHOOK_SNS_VERIFY = bool(process.env.WEBHOOK_SNS_VERIFY, true);

// ── Two-way email (inbound replies) ────────────────────────────────────
// When set, outbound guest emails carry a Reply-To of
//   <INBOUND_EMAIL_LOCAL>+<tracking_id>@<INBOUND_EMAIL_DOMAIN>
// and a guest's reply routes (via an SES inbound receipt rule → SNS →
// /webhooks/ses-inbound) back into the host's Room thread. Leave
// INBOUND_EMAIL_DOMAIN unset to keep email one-way (no Reply-To injected).
export const INBOUND_EMAIL_DOMAIN = process.env.INBOUND_EMAIL_DOMAIN || null;
export const INBOUND_EMAIL_LOCAL = process.env.INBOUND_EMAIL_LOCAL || "reply";

// Optional: if the SES receipt rule stores the raw email in S3 instead of
// inlining it in the SNS notification, the inbound handler fetches it from
// here. Unset → handler only accepts SNS notifications that include content.
export const INBOUND_EMAIL_S3_BUCKET =
  process.env.INBOUND_EMAIL_S3_BUCKET || null;
