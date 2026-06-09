// backend/src/services/shortLinks.js
//
// Mint + resolve short links (migration 074). A short link is an opaque code
// that 302-redirects to a full canonical URL. Born for outbound Instagram DMs:
// IG renders only plain text (no anchors), so a stamped signup URL otherwise
// shows as a wall of query params. The short code hides that; the destination
// still receives the full attribution params on redirect, so nothing about
// acquisition stamping changes.
//
// Never throws out of mint — a failed shorten falls back to the full URL at the
// call site, because a long-but-correct link always beats a dropped message.

import crypto from "crypto";
import { supabase } from "../supabase.js";
import { logger } from "../logger.js";

const PG_UNIQUE_VIOLATION = "23505";

// Unambiguous base-54: no 0/O/1/l/I so a human reading a code aloud can't slip.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

/** A random, hard-to-guess code. 7 chars of this alphabet ≈ 54^7 ≈ 1.3e12. */
export function generateCode(len = 7) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Persist `targetUrl` behind a fresh short code and return the code (NOT the
 * full short URL — the caller owns the base, which differs by environment).
 * Returns null on failure; callers fall back to the full URL.
 *
 * @param {string} targetUrl  the canonical destination (with all its params)
 * @param {object} [opts]
 * @param {string} [opts.kind]            classifier, e.g. 'ig_signup'
 * @param {string} [opts.hostProfileId]   owning host, for later analytics
 * @param {object} [opts.metadata]        structured extras
 */
export async function mintShortLink(targetUrl, { kind = "ig_signup", hostProfileId = null, metadata = {} } = {}) {
  if (!targetUrl) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode(7);
    const { error } = await supabase
      .from("short_links")
      .insert({ code, target_url: targetUrl, kind, host_profile_id: hostProfileId, metadata });
    if (!error) return code;
    if (error.code === PG_UNIQUE_VIOLATION) continue; // 1-in-a-billion collision → retry
    logger?.error?.("[shortLinks] mint failed", { error: error.message });
    return null;
  }
  logger?.error?.("[shortLinks] mint failed after retries (code collisions)");
  return null;
}

/**
 * Resolve a code to its destination, atomically bumping the click counter.
 * Returns the target URL, or null for an unknown/expired code.
 */
export async function resolveShortLink(code) {
  if (!code) return null;
  const { data, error } = await supabase.rpc("bump_short_link", { p_code: code });
  if (error) {
    logger?.warn?.("[shortLinks] resolve failed", { error: error.message });
    return null;
  }
  // rpc returning a scalar text comes back as the bare value (or null).
  return typeof data === "string" ? data : data || null;
}
