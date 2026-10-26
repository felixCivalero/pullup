// Sign-in by mail that only works in the browser that asked for it.
//
// The browser makes a random secret and keeps it (localStorage); it sends
// only the secret's SHA-256 when it asks for a code. The mail carries a
// six-digit code and a link — neither is enough on its own: redeeming either
// also needs the secret itself, which never left that browser. A forwarded
// mail, a code read over someone's shoulder, a link a mail scanner opens:
// none of them sign anyone in anywhere else. Five wrong codes and the attempt
// is dead; it lives 15 minutes and works once.
//
// The account itself is Supabase's: when every check passes the server
// redeems Supabase's one-time token (kept encrypted until then) and hands the
// session to that browser. Pure helpers here; routes/auth.js does the I/O.
import crypto from "crypto";

export const ATTEMPT_TTL_MS = 15 * 60 * 1000;
export const MAX_TRIES = 5;

export const sha256 = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");
export const newSecret = () => crypto.randomBytes(32).toString("base64url");
export const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
// The code is salted with its attempt, so the same six digits hash differently.
export const codeHash = (attemptId, code) => sha256(`${attemptId}:${String(code).replace(/\D/g, "")}`);

const sameHex = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
};

// What the browser sent when asking: the hash of its secret (64 hex chars).
export const isDeviceHash = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);

// Can this browser, with this code or link, redeem this attempt?
// → "ok" | "expired" | "used" | "locked" | "other_device" | "wrong_code" | "missing"
export function checkAttempt(attempt, { secret, code, link }, now = Date.now()) {
  if (!attempt) return "expired";
  if (attempt.used_at) return "used";
  if (new Date(attempt.expires_at).getTime() <= now) return "expired";
  if (attempt.tries >= MAX_TRIES) return "locked";
  if (typeof secret !== "string" || !secret || !sameHex(sha256(secret), attempt.device_hash)) return "other_device";
  if (typeof link === "string" && link) return sameHex(sha256(link), attempt.link_hash) ? "ok" : "wrong_code";
  if (typeof code === "string" && code) return sameHex(codeHash(attempt.id, code), attempt.code_hash) ? "ok" : "wrong_code";
  return "missing";
}

// "Chrome på macOS" — shown in the mail so the person recognises the request.
export function describeDevice(userAgent = "") {
  const ua = String(userAgent);
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /OPR\/|Opera/.test(ua) ? "Opera" :
    /Firefox\//.test(ua) ? "Firefox" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) ? "Safari" : "en webbläsare";
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X|Macintosh/.test(ua) ? "macOS" :
    /Windows/.test(ua) ? "Windows" :
    /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} på ${os}` : browser;
}

// Supabase's one-time token waits encrypted (AES-256-GCM) in the database
// until a check passes; a copy of the table alone signs no one in.
const boxKey = () => crypto.createHash("sha256").update(`pullup-login-v1:${process.env.LOGIN_TOKEN_KEY || process.env.SUPABASE_SERVICE_KEY || ""}`).digest();

export function seal(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", boxKey(), iv);
  const body = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function open(sealed) {
  const [iv, tag, body] = String(sealed).split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", boxKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
