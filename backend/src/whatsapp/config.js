// backend/src/whatsapp/config.js
import dotenv from "dotenv";
dotenv.config();

const bool = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  return String(value).toLowerCase() === "true";
};

// ── Provider selection ──────────────────────────────────────────────
// 'meta_cloud' (Meta WhatsApp Cloud API direct, recommended)
// 'sandbox'    (no network, log + return synthetic ids — for dev)
export const WHATSAPP_PROVIDER =
  process.env.WHATSAPP_PROVIDER?.trim().toLowerCase() || "sandbox";

export const WHATSAPP_SANDBOX_MODE =
  bool(process.env.WHATSAPP_SANDBOX_MODE, true) ||
  WHATSAPP_PROVIDER === "sandbox";

// ── Meta Cloud API credentials ──────────────────────────────────────
// All optional in sandbox mode. Required for production.
export const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION || "v21.0";

export const META_PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID || null;

export const META_WABA_ID = process.env.META_WABA_ID || null;

export const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || null;

export const META_VERIFY_TOKEN =
  process.env.META_VERIFY_TOKEN || "pullup-meta-verify";

export const META_APP_SECRET = process.env.META_APP_SECRET || null;

export const META_BUSINESS_DISPLAY_NAME =
  process.env.META_BUSINESS_DISPLAY_NAME || "PullUp";

// ── Outbox worker ───────────────────────────────────────────────────
export const WHATSAPP_SEND_RATE_PER_SEC = Number(
  process.env.WHATSAPP_SEND_RATE_PER_SEC || 25,
);
export const WHATSAPP_MAX_RETRIES = Number(
  process.env.WHATSAPP_MAX_RETRIES || 4,
);
export const WHATSAPP_RETRY_BASE_SECONDS = Number(
  process.env.WHATSAPP_RETRY_BASE_SECONDS || 10,
);
export const WHATSAPP_WORKER_BATCH_SIZE = Number(
  process.env.WHATSAPP_WORKER_BATCH_SIZE || 50,
);

// ── App base URL for magic-link redemption ─────────────────────────
export const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.PUBLIC_BASE_URL ||
  "https://pullup.se";

export const MAGIC_LINK_PATH = process.env.MAGIC_LINK_PATH || "/v";
export const MAGIC_LINK_TTL_MINUTES = Number(
  process.env.MAGIC_LINK_TTL_MINUTES || 15,
);

export function assertProductionConfig() {
  if (WHATSAPP_SANDBOX_MODE) return;
  const missing = [];
  if (!META_PHONE_NUMBER_ID) missing.push("META_PHONE_NUMBER_ID");
  if (!META_ACCESS_TOKEN) missing.push("META_ACCESS_TOKEN");
  if (!META_APP_SECRET) missing.push("META_APP_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `[whatsapp/config] Missing required env vars for production: ${missing.join(", ")}`,
    );
  }
}
