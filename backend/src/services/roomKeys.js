// Room keys — the fix for "a fresh RSVP'er can't actually enter the Room".
//
// The RSVP mints the guest an account server-side, but their browser has no
// session, so tapping the Room link in the confirmation email used to bounce
// them into a login wall. Now the email carries a ROOM KEY: a 7-day token on
// our own magic_link_tokens table. When tapped, GET /k/:token mints a FRESH
// (seconds-old) Supabase magic link server-side and 302s to it — the Supabase
// hour-long expiry never matters because the link is born at click time —
// /auth/callback establishes the session and forwards into the event Room.
//
// Trust model: possession of the inbox is the anchor, exactly like any
// passwordless login (the AuthGate would email the same inbox a sign-in
// link). Keys are MULTI-USE until expiry — corporate mail scanners prefetch
// every link in an email, and a single-use key would be burned before the
// human ever tapped it. Each click consumes only the fresh per-click Supabase
// OTP, never the key itself.
import crypto from "node:crypto";
import { supabase } from "../supabase.js";
import { logger } from "../logger.js";

const ROOM_KEY_TTL_DAYS = 7;

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Mint a room key for an RSVP'd guest. Returns the raw token (caller builds
// the URL) or null — best-effort, never blocks the RSVP.
export async function mintRoomKey({ email, eventId, personId = null }) {
  const norm = String(email || "").trim().toLowerCase();
  if (!norm || !eventId) return null;
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const { error } = await supabase.from("magic_link_tokens").insert({
    token_hash: hashToken(rawToken),
    phone_e164: null,
    intent: "room_key",
    person_id: personId,
    payload: { kind: "room_key", email: norm, eventId },
    expires_at: new Date(Date.now() + ROOM_KEY_TTL_DAYS * 86400000).toISOString(),
    send_channel: "email",
    send_attempts: 1,
    last_sent_at: new Date().toISOString(),
  });
  if (error) {
    logger?.warn?.("[roomKeys] mint failed", { error: error.message });
    return null;
  }
  return rawToken;
}

// Validate a room key (no side effects, deliberately NOT single-use — see
// header). Returns { ok, email, eventId } or { ok:false, error }.
export async function redeemRoomKey(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return { ok: false, error: "missing token" };
  const { data: row, error } = await supabase
    .from("magic_link_tokens")
    .select("payload, expires_at, intent")
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    logger?.error?.("[roomKeys] lookup error", { error: error.message });
    return { ok: false, error: "lookup failed" };
  }
  if (!row || row.intent !== "room_key") return { ok: false, error: "invalid link" };
  if (new Date(row.expires_at) < new Date()) return { ok: false, error: "link expired" };
  const email = String(row.payload?.email || "").trim().toLowerCase();
  const eventId = row.payload?.eventId || null;
  if (!email || !eventId) return { ok: false, error: "invalid link" };
  return { ok: true, email, eventId };
}
