// backend/src/email/config.js
import dotenv from "dotenv";
dotenv.config();

const bool = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  return String(value).toLowerCase() === "true";
};

export const EMAIL_PROVIDER =
  process.env.EMAIL_PROVIDER?.trim().toLowerCase() || "resend";

export const SES_REGION = process.env.SES_REGION || null;

export const SES_FROM_EMAIL =
  process.env.SES_FROM_EMAIL || '"PullUp" <no-reply@pullup.se>';

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

// Daily provider quota guard. Default 100 matches Resend's free tier.
// Set to a higher number when you upgrade (3000 / 50000 / etc.); set to
// 0 to disable the guard entirely (worker behaves as it did before this
// existed). Counted across the whole UTC day from email_outbox.sent_at.
export const EMAIL_DAILY_LIMIT = Number(
  process.env.EMAIL_DAILY_LIMIT ?? 100,
);

export const WEBHOOK_SNS_VERIFY = bool(process.env.WEBHOOK_SNS_VERIFY, true);
