// backend/src/utils/phone.js
//
// Phone-number identity utilities. Wraps libphonenumber-js to give the rest
// of PullUp a tiny surface area:
//
//   normalisePhone(raw, defaultCountry?) -> { ok, e164, country, nationalNumber, error? }
//   isValidE164(s)                       -> boolean
//   hashE164(e164)                       -> stable SHA-256 hex (for token-style indexing)
//
// We never persist a raw user-typed phone string into the new structured
// columns — only the E.164 form. The freeform `phone` / `mobile_number`
// columns remain for backwards-compat with legacy imports.

import {
  parsePhoneNumberFromString,
  isValidPhoneNumber,
} from "libphonenumber-js";
import { createHash } from "node:crypto";

const E164_REGEX = /^\+[1-9][0-9]{6,14}$/;

/**
 * Normalise a free-text phone input into structured identity fields.
 *
 * @param {string} raw - whatever the user typed (`"+254 712 345 678"`, `"0712345678"`, etc.)
 * @param {string} [defaultCountry] - ISO-3166-1 alpha-2 country to assume when input has no `+`.
 *   Pass the user's signup-country guess or geo-IP country here.
 *
 * @returns {{ ok: true, e164: string, country: string|null, nationalNumber: string }
 *          | { ok: false, error: string }}
 */
export function normalisePhone(raw, defaultCountry = null) {
  if (raw == null) {
    return { ok: false, error: "phone is required" };
  }
  const input = String(raw).trim();
  if (input.length === 0) {
    return { ok: false, error: "phone is required" };
  }

  let parsed;
  try {
    parsed = parsePhoneNumberFromString(
      input,
      defaultCountry ? String(defaultCountry).toUpperCase() : undefined,
    );
  } catch {
    return { ok: false, error: "phone could not be parsed" };
  }

  if (!parsed) {
    return { ok: false, error: "phone could not be parsed" };
  }
  if (!parsed.isValid()) {
    return { ok: false, error: "phone is not a valid number" };
  }

  const e164 = parsed.number; // libphonenumber-js's `.number` is E.164
  if (!E164_REGEX.test(e164)) {
    return { ok: false, error: "phone failed E.164 format check" };
  }

  return {
    ok: true,
    e164,
    country: parsed.country ?? null,
    nationalNumber: parsed.nationalNumber,
  };
}

/** Strict check that a string is already in E.164. */
export function isValidE164(s) {
  if (typeof s !== "string") return false;
  if (!E164_REGEX.test(s)) return false;
  return isValidPhoneNumber(s);
}

/** Stable SHA-256 hex of an E.164 number. Useful for non-reversible logging. */
export function hashE164(e164) {
  return createHash("sha256").update(String(e164)).digest("hex");
}

/**
 * Best-effort country detection from an E.164 string. Returns ISO-3166-1
 * alpha-2 or null. Used when callers already have an E.164 and want the
 * country code (e.g. for cost lookup) without re-running full normalisation.
 */
export function countryFromE164(e164) {
  if (!isValidE164(e164)) return null;
  const parsed = parsePhoneNumberFromString(e164);
  return parsed?.country ?? null;
}
