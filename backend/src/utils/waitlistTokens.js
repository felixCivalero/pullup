// backend/src/utils/waitlistTokens.js
// JWT token generation and verification for waitlist payment links

import jwt from "jsonwebtoken";

// Determine environment mode
const isDevelopment = process.env.NODE_ENV === "development";

// In development: prefer TEST_ prefixed variables, fallback to regular
// In production: always use regular variable names
let WAITLIST_TOKEN_SECRET;

if (isDevelopment) {
  WAITLIST_TOKEN_SECRET =
    process.env.WAITLIST_TOKEN_SECRET ||
    process.env.TEST_SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_KEY;
} else {
  WAITLIST_TOKEN_SECRET =
    process.env.WAITLIST_TOKEN_SECRET || process.env.SUPABASE_SERVICE_KEY;
}

if (!WAITLIST_TOKEN_SECRET) {
  const missingVar = isDevelopment
    ? "WAITLIST_TOKEN_SECRET, TEST_SUPABASE_SERVICE_KEY, or SUPABASE_SERVICE_KEY"
    : "WAITLIST_TOKEN_SECRET or SUPABASE_SERVICE_KEY";
  console.warn(`⚠️  ${missingVar} not set`);
}

/**
 * Generate a signed JWT token for waitlist payment link
 * @param {Object} payload - Token payload
 * @param {string} payload.eventId - Event ID
 * @param {string} payload.rsvpId - RSVP ID
 * @param {string} payload.email - Person's email
 * @param {string} payload.type - Token type (should be "waitlist_offer")
 * @param {string} payload.expiresAt - ISO string of expiration time
 * @param {Object} payload.rsvpDetails - RSVP details for validation
 * @returns {string} Signed JWT token
 */
export function generateWaitlistToken(payload) {
  if (!WAITLIST_TOKEN_SECRET) {
    const missingVar = isDevelopment
      ? "WAITLIST_TOKEN_SECRET, TEST_SUPABASE_SERVICE_KEY, or SUPABASE_SERVICE_KEY"
      : "WAITLIST_TOKEN_SECRET or SUPABASE_SERVICE_KEY";
    throw new Error(`${missingVar} must be set`);
  }

  return jwt.sign(payload, WAITLIST_TOKEN_SECRET, {
    expiresIn: "48h", // 48 hours
  });
}

/**
 * Verify and decode a waitlist token
 * @param {string} token - JWT token to verify
 * @returns {Object} Decoded token payload
 * @throws {Error} If token is invalid or expired
 */
export function verifyWaitlistToken(token) {
  if (!WAITLIST_TOKEN_SECRET) {
    const missingVar = isDevelopment
      ? "WAITLIST_TOKEN_SECRET, TEST_SUPABASE_SERVICE_KEY, or SUPABASE_SERVICE_KEY"
      : "WAITLIST_TOKEN_SECRET or SUPABASE_SERVICE_KEY";
    throw new Error(`${missingVar} must be set`);
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
