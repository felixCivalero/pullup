// backend/src/utils/waitlistTokens.js
// JWT token generation and verification for waitlist payment links and VIP invites

import jwt from "jsonwebtoken";

// Dedicated secret for short-lived host-action JWTs (waitlist offers, VIP
// invites, media uploads). Must be its own secret — reusing the Supabase
// service-role key would massively expand the blast radius of any token leak
// or jsonwebtoken CVE. Hard-fail in production if unset.
const WAITLIST_TOKEN_SECRET = process.env.WAITLIST_TOKEN_SECRET;

if (!WAITLIST_TOKEN_SECRET) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "WAITLIST_TOKEN_SECRET is required in production. Set a 32+ byte random value.",
    );
  }
  console.warn(
    "⚠️  WAITLIST_TOKEN_SECRET not set — waitlist/VIP/media tokens will fail",
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
    throw new Error("WAITLIST_TOKEN_SECRET must be set");
  }

  return jwt.sign(payload, WAITLIST_TOKEN_SECRET, {
    algorithm: "HS256",
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
    throw new Error("WAITLIST_TOKEN_SECRET must be set");
  }

  try {
    return jwt.verify(token, WAITLIST_TOKEN_SECRET, {
      algorithms: ["HS256"],
    });
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
