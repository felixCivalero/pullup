// backend/src/services/personResolution.js
//
// THE BRAIN'S KEYSTONE — identity resolution.
//
// Every channel (RSVP / WhatsApp / Instagram) currently resolves people its
// own flat way (RSVP=email, WhatsApp=phone, IG=ig_user_id), so the same human
// arriving on two channels becomes two `people` rows. This service is the one
// door they all go through instead: given whatever identifiers a touchpoint
// carries, it resolves to a SINGLE canonical person — linking, not duplicating
// — and records every identifier in `person_identities` (the resolution layer
// shipped in migration 048).
//
// Design rules (conservative on purpose — merging real humans is destructive):
//   * Exact identifier match → reuse that person. New identifiers get attached.
//   * No match → create a new person, attach all identifiers.
//   * Identifiers point at DIFFERENT existing people (a collision) → do NOT
//     auto-merge. Pick the oldest as canonical for THIS call and queue a
//     person_match_candidates row (reason 'multi_identity_collision') for the
//     host to confirm in the Room. Exact-but-conflicting is still a human call.
//
// This module does NOT write timeline events or touch live channel code — that
// is the next, careful pass. It is safe to import and call in isolation.

import { supabase } from "../supabase.js";
import { normalisePhone, isValidE164 } from "../utils/phone.js";
import { logger } from "../logger.js";

// ── Normalization — MUST match the migration 048 backfill exactly, or a
// backfilled identity and a freshly-resolved one won't collide as they should.
const norm = {
  email: (v) => String(v).trim().toLowerCase(),
  phone: (v) => String(v).trim(), // already E.164 by the time it's an identity
  ig_user_id: (v) => String(v).trim(),
  ig_handle: (v) => String(v).trim().replace(/^@+/, "").toLowerCase(),
  tiktok: (v) => String(v).trim().replace(/^@+/, "").toLowerCase(),
  twitter: (v) => String(v).trim().replace(/^@+/, "").toLowerCase(),
};

/**
 * Turn a loose identifier bag into clean { kind, value, value_norm } rows.
 * Drops empties; normalises phone to E.164 (rejecting invalid).
 *
 * @param {object} ids
 *   { email?, phone?, defaultCountry?, igUserId?, igHandle?, tiktok?, twitter? }
 * @returns {Array<{kind,value,value_norm,verified_at?}>}
 */
export function buildIdentities(ids = {}) {
  const out = [];
  const push = (kind, value, extra = {}) => {
    if (value == null) return;
    const value_str = String(value).trim();
    if (!value_str) return;
    out.push({ kind, value: value_str, value_norm: norm[kind](value_str), ...extra });
  };

  if (ids.email) push("email", ids.email);
  if (ids.phone) {
    const n = normalisePhone(ids.phone, ids.defaultCountry || null);
    if (n.ok && isValidE164(n.e164)) {
      push("phone", n.e164, ids.phoneVerifiedAt ? { verified_at: ids.phoneVerifiedAt } : {});
    }
  }
  if (ids.igUserId) push("ig_user_id", ids.igUserId);
  if (ids.igHandle) push("ig_handle", ids.igHandle);
  if (ids.tiktok) push("tiktok", ids.tiktok);
  if (ids.twitter) push("twitter", ids.twitter);
  return out;
}

/**
 * Look up which existing person (if any) each identity already points to.
 * Returns a Map keyed by "kind:value_norm" -> person_id.
 */
async function lookupExisting(identities) {
  if (!identities.length) return new Map();
  // OR across (kind, value_norm) pairs. Supabase .or wants a flat filter list.
  const ors = identities
    .map((i) => `and(kind.eq.${i.kind},value_norm.eq.${encodeOr(i.value_norm)})`)
    .join(",");
  const { data, error } = await supabase
    .from("person_identities")
    .select("person_id, kind, value_norm")
    .or(ors);
  if (error) {
    logger?.warn?.("[personResolution] lookup failed", { error: error.message });
    return new Map();
  }
  const m = new Map();
  for (const row of data || []) m.set(`${row.kind}:${row.value_norm}`, row.person_id);
  return m;
}

// PostgREST .or() values can't contain bare commas/parens; our norm values are
// emails/handles/E.164 so this is belt-and-suspenders against odd handles.
function encodeOr(v) {
  return /[(),]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v;
}

/**
 * Attach an identity to a person. Idempotent: if (kind,value_norm) already
 * maps to THIS person, no-op; if it maps to ANOTHER person, the unique index
 * rejects it and we report the conflict so the caller can flag a merge.
 * @returns {'inserted'|'exists'|'conflict'}
 */
async function attachIdentity(personId, identity, source) {
  const { error } = await supabase.from("person_identities").insert({
    person_id: personId,
    kind: identity.kind,
    value: identity.value,
    value_norm: identity.value_norm,
    verified_at: identity.verified_at || null,
    source: source || "resolve",
  });
  if (!error) return "inserted";
  // 23505 = unique_violation on (kind, value_norm)
  if (error.code === "23505") {
    const { data } = await supabase
      .from("person_identities")
      .select("person_id")
      .eq("kind", identity.kind)
      .eq("value_norm", identity.value_norm)
      .maybeSingle();
    return data?.person_id === personId ? "exists" : "conflict";
  }
  logger?.warn?.("[personResolution] attach failed", { error: error.message });
  return "conflict";
}

async function queueMatchCandidate(personA, personB, reason, score = 1.0) {
  if (personA === personB) return;
  // Order-independent; unique index dedupes the pair.
  const { error } = await supabase.from("person_match_candidates").insert({
    person_a: personA,
    person_b: personB,
    score,
    reason,
    status: "pending",
  });
  if (error && error.code !== "23505") {
    logger?.warn?.("[personResolution] queue candidate failed", { error: error.message });
  }
}

/**
 * Resolve a touchpoint's identifiers to ONE canonical person, creating or
 * linking as needed, and recording every identifier.
 *
 * @param {object} args
 * @param {object} args.identifiers  buildIdentities() input bag
 * @param {object} [args.profile]    fields to set when CREATING a new person
 *                                   ({ name, email, instagram, ig_user_id, ... })
 * @param {string} [args.source]     identity source tag ('rsvp'|'whatsapp'|'ig'|'import'|'manual')
 * @returns {Promise<{ personId, created, linkedIdentities, conflicts }>}
 */
export async function resolvePersonByIdentity({ identifiers, profile = {}, source = "resolve" } = {}) {
  const identities = buildIdentities(identifiers);
  if (!identities.length) {
    throw new Error("[personResolution] no usable identifiers provided");
  }

  const existing = await lookupExisting(identities);
  const matchedPersonIds = [...new Set(existing.values())];

  let canonicalId;
  let created = false;
  const conflicts = [];

  if (matchedPersonIds.length === 0) {
    // Nobody yet — create the person from the provided profile.
    canonicalId = await createPerson(profile, identifiers);
    created = true;
  } else {
    // One or more existing people matched. Use the OLDEST as canonical (stable,
    // least surprising). Multiple distinct matches = a collision to flag, never
    // an auto-merge.
    canonicalId = await oldestPerson(matchedPersonIds);
    if (matchedPersonIds.length > 1) {
      for (const other of matchedPersonIds) {
        if (other !== canonicalId) {
          conflicts.push(other);
          await queueMatchCandidate(canonicalId, other, "multi_identity_collision");
        }
      }
      logger?.info?.("[personResolution] multi-identity collision flagged", {
        canonical: canonicalId, others: conflicts,
      });
    }
  }

  // Attach every identifier to the canonical person.
  const linkedIdentities = [];
  for (const idn of identities) {
    const r = await attachIdentity(canonicalId, idn, source);
    if (r === "inserted") linkedIdentities.push(`${idn.kind}:${idn.value_norm}`);
    if (r === "conflict") {
      // This identifier belongs to a different person than our canonical — flag.
      const ownerId = existing.get(`${idn.kind}:${idn.value_norm}`);
      if (ownerId && ownerId !== canonicalId) {
        await queueMatchCandidate(canonicalId, ownerId, `shared_${idn.kind}`);
        if (!conflicts.includes(ownerId)) conflicts.push(ownerId);
      }
    }
  }

  // Capture THIS source's view of the person (linked, kept as-is) so the
  // resolver can derive the display by precedence. Best-effort — a failure here
  // must never break resolution. Skip the generic "resolve" tag + empty bags;
  // richer sources (e.g. the IG webhook's full profile) upsert their own row.
  try {
    const { upsertSourceProfile, canonicalSource } = await import("./personSourceProfiles.js");
    const src = canonicalSource(source);
    const handle = profile.instagram || identifiers.igHandle || null;
    const display = profile.name || null;
    const sourceId =
      identifiers.igUserId || profile.ig_user_id ||
      identifiers.email || profile.email ||
      identifiers.phone_e164 || profile.phone_e164 || null;
    if (src !== "resolve" && (display || handle || profile.email || profile.phone_e164)) {
      await upsertSourceProfile({
        personId: canonicalId, source: src, sourceId,
        handle, displayName: display,
        data: { ...profile, via: source },
      });
    }
  } catch (e) {
    logger?.warn?.("[personResolution] source profile capture failed", { error: e?.message });
  }

  return { personId: canonicalId, created, linkedIdentities, conflicts };
}

/**
 * Link identifiers to a KNOWN person — the caller already decided who this is
 * (RSVP picked by email, the WhatsApp webhook by phone). Unlike
 * resolvePersonByIdentity this NEVER changes which person is used and NEVER
 * creates one: it only records each identifier in person_identities (so a future
 * cross-channel touch resolves to this same atom) and flags a merge candidate —
 * never auto-merges — when an identifier already belongs to someone else. Also
 * captures the source profile. Best-effort + idempotent; safe to call after the
 * channel has already settled its person, with zero change to person SELECTION.
 *
 * @param {object} args
 * @param {string} args.personId       the already-resolved canonical person
 * @param {object} args.identifiers    buildIdentities() input bag
 * @param {object} [args.profile]      source-profile fields (name/email/phone_e164/instagram/ig_user_id)
 * @param {string} [args.source]       'rsvp' | 'whatsapp' | 'ig' | 'manual' | 'import'
 * @returns {Promise<{ linked: string[], conflicts: string[] }>}
 */
export async function linkIdentitiesToPerson({ personId, identifiers = {}, profile = {}, source = "resolve" } = {}) {
  if (!personId) return { linked: [], conflicts: [] };
  const identities = buildIdentities(identifiers);
  const linked = [];
  const conflicts = [];
  for (const idn of identities) {
    const r = await attachIdentity(personId, idn, source);
    if (r === "inserted") linked.push(`${idn.kind}:${idn.value_norm}`);
    if (r === "conflict") {
      // This identifier already belongs to a DIFFERENT person — flag a merge for
      // a human to confirm, never fuse automatically.
      const { data } = await supabase
        .from("person_identities").select("person_id")
        .eq("kind", idn.kind).eq("value_norm", idn.value_norm).maybeSingle();
      const ownerId = data?.person_id;
      if (ownerId && ownerId !== personId) {
        await queueMatchCandidate(personId, ownerId, `shared_${idn.kind}`);
        if (!conflicts.includes(ownerId)) conflicts.push(ownerId);
      }
    }
  }
  try {
    const { upsertSourceProfile, canonicalSource } = await import("./personSourceProfiles.js");
    const src = canonicalSource(source);
    if (src !== "resolve" && (profile.name || profile.email || profile.phone_e164 || profile.instagram)) {
      await upsertSourceProfile({
        personId,
        source: src,
        sourceId: identifiers.igUserId || profile.ig_user_id || identifiers.email || profile.email || profile.phone_e164 || null,
        handle: profile.instagram || identifiers.igHandle || null,
        displayName: profile.name || null,
        data: { ...profile, via: source },
      });
    }
  } catch (e) {
    logger?.warn?.("[personResolution] link source profile failed", { error: e?.message });
  }
  return { linked, conflicts };
}

// ── helpers ─────────────────────────────────────────────────────────

async function oldestPerson(ids) {
  const { data } = await supabase
    .from("people")
    .select("id, created_at")
    .in("id", ids)
    .order("created_at", { ascending: true })
    .limit(1);
  return data?.[0]?.id || ids[0];
}

// Create a person row from the profile bag. Mirrors the columns the existing
// channels set; everything optional so any channel can call it.
async function createPerson(profile, identifiers) {
  const row = {
    name: profile.name || null,
    email: profile.email || identifiers.email || null,
    phone_e164: profile.phone_e164 || null,
    instagram: profile.instagram || identifiers.igHandle || null,
    ig_user_id: profile.ig_user_id || identifiers.igUserId || null,
    tiktok: profile.tiktok || identifiers.tiktok || null,
    acquisition_channel: profile.acquisition_channel || null,
    acquisition_ref: profile.acquisition_ref || null,
  };
  // Strip nulls so we don't overwrite column defaults.
  for (const k of Object.keys(row)) if (row[k] == null) delete row[k];

  const { data, error } = await supabase.from("people").insert(row).select("id").single();
  if (error) {
    logger?.error?.("[personResolution] createPerson failed", { error: error.message });
    throw error;
  }
  return data.id;
}
