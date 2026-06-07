// backend/src/lib/idempotency.js
//
// Tiny pure helpers for the idempotent write spine (migration 065). Kept
// dependency-free and side-effect-free so they're unit-testable without a DB.
//
// The shared shape: an UPSERT with { onConflict, ignoreDuplicates: true }
// followed by .select() returns the freshly-inserted row(s) on a real insert,
// and an EMPTY array on a conflict (ON CONFLICT DO NOTHING wrote nothing). That
// empty-vs-row distinction is exactly "was this a new write or a replay?".

/**
 * Interpret the result of an `ignoreDuplicates` upsert + `.select()`.
 *
 * @param {Array|null} rows  what supabase returned from `.upsert(...).select()`
 * @returns {{ row: object|null, deduped: boolean }}
 *   row     — the inserted row, or null when it was a duplicate (caller may
 *             re-fetch by the conflict key if it needs the existing row).
 *   deduped — true when the key already existed and nothing was written.
 */
export function interpretUpsert(rows) {
  if (Array.isArray(rows) && rows.length > 0) {
    return { row: rows[0], deduped: false };
  }
  return { row: null, deduped: true };
}

/**
 * Build a stable, collision-resistant dedupe key from parts. Returns null if
 * any part is missing — callers MUST treat a null key as "not dedupable" and
 * fall back to a plain insert, never as the literal string "null".
 *
 * @param  {...(string|number|null|undefined)} parts
 * @returns {string|null}
 */
export function dedupeKey(...parts) {
  if (!parts.length) return null;
  for (const p of parts) {
    if (p === null || p === undefined || p === "") return null;
  }
  return parts.map((p) => String(p)).join(":");
}

/**
 * Decide which rail dispatch() should try before the email floor. Pure mirror
 * of the routing rule so the fallback ordering is testable in isolation.
 *
 * @param {{ preferredChannel?: string|null, hasWhatsAppTemplate?: boolean }} o
 * @returns {string[]} ordered rails to attempt (email is always the implicit floor)
 */
export function resolveTryOrder({ preferredChannel = null, hasWhatsAppTemplate = false } = {}) {
  if (preferredChannel === "instagram") return ["instagram"];
  if (preferredChannel === "whatsapp") return ["whatsapp"];
  if (!preferredChannel && hasWhatsAppTemplate) return ["whatsapp"];
  return [];
}
