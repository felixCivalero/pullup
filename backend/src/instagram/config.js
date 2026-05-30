// backend/src/instagram/config.js
//
// Instagram-native channel config. Mirrors whatsapp/config.js — same
// Meta Graph app, same env-driven shape, same sandbox escape hatch so the
// integration builds + tests in Development Mode before App Review lands.
//
// Nothing here is live until Felix provisions the app credentials (see
// docs/superpowers/specs/2026-05-29-instagram-native-channel-design.md,
// Track A) and pastes them into the backend env. Until then IG_SANDBOX_MODE
// stays true and every call returns synthetic ids instead of hitting Meta.

import dotenv from "dotenv";
dotenv.config();

const bool = (value, defaultValue = false) => {
  if (value === undefined || value === null) return defaultValue;
  return String(value).toLowerCase() === "true";
};

// ── Provider mode ───────────────────────────────────────────────────
// 'meta_graph' (Instagram API with Instagram Login, via Graph API)
// 'sandbox'    (no network, log + synthetic ids — dev/CI default)
export const IG_PROVIDER =
  process.env.IG_PROVIDER?.trim().toLowerCase() || "sandbox";

export const IG_SANDBOX_MODE =
  bool(process.env.IG_SANDBOX_MODE, true) || IG_PROVIDER === "sandbox";

// ── Meta Graph (shared with WhatsApp — same app) ────────────────────
// META_GRAPH_VERSION / META_APP_SECRET are reused from the WhatsApp setup
// where present; we read them independently so the modules stay decoupled.
export const META_GRAPH_VERSION =
  process.env.META_GRAPH_VERSION || "v21.0";

// App-level credentials (from the Meta app dashboard, step A2 of the runbook).
export const META_APP_ID = process.env.META_APP_ID || null;
export const META_APP_SECRET = process.env.META_APP_SECRET || null;

// Shared webhook verify token. Reuse the WhatsApp one if set so a single
// verify token covers both subscriptions on the same app.
export const IG_VERIFY_TOKEN =
  process.env.IG_VERIFY_TOKEN ||
  process.env.META_VERIFY_TOKEN ||
  "pullup-meta-verify";

// OAuth (Instagram-Login connect flow — per-host, step A5/A connect).
export const IG_OAUTH_REDIRECT_URI =
  process.env.IG_OAUTH_REDIRECT_URI || null; // https://pullup.se/api/oauth/instagram/callback

// "Instagram API with Instagram Login" uses an INSTAGRAM-app-scoped id/secret
// (Dashboard → Instagram product → API setup with Instagram login), which is
// DISTINCT from META_APP_ID/SECRET. Felix grabs these after flipping the use
// case to Instagram Login. Fall back to the Meta app ids so sandbox builds run.
export const IG_APP_ID =
  process.env.IG_APP_ID || META_APP_ID || null;
export const IG_APP_SECRET =
  process.env.IG_APP_SECRET || META_APP_SECRET || null;

// Scopes requested at connect. The two manage_* scopes are App-Review-gated
// (work for app-role accounts in Dev Mode meanwhile).
// Scope names must match the app's "Add required messaging permissions" list
// exactly (dashboard → API setup with Instagram login → step 1).
export const IG_SCOPES = (
  process.env.IG_SCOPES ||
  "instagram_business_basic,instagram_manage_comments,instagram_business_manage_messages"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Instagram-Login OAuth endpoints.
export const IG_AUTHORIZE_URL = "https://www.instagram.com/oauth/authorize";
export const IG_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
// Long-lived (60-day) token exchange + refresh live on graph.instagram.com.
export const IG_GRAPH_HOST = "https://graph.instagram.com";

// App-access token (`{app-id}|{app-secret}`) for app-level Graph calls
// like webhook field subscriptions. Computed lazily so a missing secret
// doesn't throw at import.
export function appAccessToken() {
  if (!META_APP_ID || !META_APP_SECRET) return null;
  return `${META_APP_ID}|${META_APP_SECRET}`;
}

// ── Messaging policy (Meta-fixed, encoded so the router can reason) ──
// IG standard messaging window: 24h from the user's last message. No broad
// "reminder" tag — after the window closes the router falls through to
// WhatsApp / email. This constant is the IG analogue of the WhatsApp 24h
// freeform window already used in whatsappThreadsRepo.js.
export const IG_MESSAGING_WINDOW_HOURS = 24;

// Private Replies (comment → DM): one reply per comment, 7-day eligibility.
export const IG_PRIVATE_REPLY_WINDOW_DAYS = 7;

export function graphUrl(path) {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}${path}`;
}
