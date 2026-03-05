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

export const WEBHOOK_SNS_VERIFY = bool(process.env.WEBHOOK_SNS_VERIFY, true);

console.log("EMAIL_PROVIDER", EMAIL_PROVIDER);
console.log("SES_REGION", SES_REGION);
console.log("SES_FROM_EMAIL", SES_FROM_EMAIL);
console.log("SES_CONFIGURATION_SET_NAME", SES_CONFIGURATION_SET_NAME);
console.log("SES_TEST_MODE", SES_TEST_MODE);
console.log("EMAIL_SEND_RATE_PER_SEC", EMAIL_SEND_RATE_PER_SEC);
console.log("EMAIL_MAX_RETRIES", EMAIL_MAX_RETRIES);
console.log("EMAIL_RETRY_BASE_SECONDS", EMAIL_RETRY_BASE_SECONDS);
console.log("EMAIL_WORKER_BATCH_SIZE", EMAIL_WORKER_BATCH_SIZE);
