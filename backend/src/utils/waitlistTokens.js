// backend/src/utils/waitlistTokens.js
// JWT token generation and verification for waitlist payment links and VIP invites

import jwt from "jsonwebtoken";

let WAITLIST_TOKEN_SECRET =
  process.env.WAITLIST_TOKEN_SECRET || process.env.SUPABASE_SERVICE_KEY;

if (!WAITLIST_TOKEN_SECRET) {
  console.warn(
    "⚠️  WAITLIST_TOKEN_SECRET or SUPABASE_SERVICE_KEY not set"
  );
}

/**
 * Generate a signed JWT token (waitlist, VIP, or other short-lived host
 * action). The payload MUST include a `type` field so callers can
 * distinguish between "waitlist_offer", "vip_invite", "media_upload", etc.
 * during verification.
 *
 * @param {Object} payload - Token payload
 * @param {Object} [opts]
 * @param {string|number} [opts.expiresIn] - jsonwebtoken expiresIn value.
 *   Default "48h" to preserve historical behaviour for waitlist/VIP flows.
 * @returns {string} Signed JWT token
 */
export function generateWaitlistToken(payload, opts = {}) {
  if (!WAITLIST_TOKEN_SECRET) {
    throw new Error(
      "WAITLIST_TOKEN_SECRET or SUPABASE_SERVICE_KEY must be set"
    );
  }

  return jwt.sign(payload, WAITLIST_TOKEN_SECRET, {
    expiresIn: opts.expiresIn || "48h",
  });
}

/**
 * Verify and decode a token used for waitlist or VIP flows.
 * Callers must check the `type` field in the decoded payload.
 *
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyWaitlistToken(token) {
  if (!WAITLIST_TOKEN_SECRET) {
    throw new Error(
      "WAITLIST_TOKEN_SECRET or SUPABASE_SERVICE_KEY must be set"
    );
  }

  try {
    return jwt.verify(token, WAITLIST_TOKEN_SECRET);
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw error;
  }
}
