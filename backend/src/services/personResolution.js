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
 * Returns the raw matched rows: [{ person_id, kind, value_norm }].
 *
 * Matches against BOTH the person_identities resolution layer (cross-channel
 * links) AND the denormalized `people` columns (email / phone_e164 / ig_user_id).
 * The people columns are the COMPLETE legacy source — person_identities is only
 * ~partially backfilled — so including them is what keeps a re-RSVP from a known
 * guest from creating a duplicate. (Also strictly improves WA/IG resolution.)
 */
async function lookupExistingRows(identities) {
  if (!identities.length) return [];
  const out = [];
  const seen = new Set();
  const add = (person_id, kind, value_norm) => {
    if (!person_id) return;
    const k = `${person_id}|${kind}|${value_norm}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ person_id, kind, value_norm });
  };

  // 1) person_identities — OR across (kind, value_norm) pairs.
  const ors = identities
    .map((i) => `and(kind.eq.${i.kind},value_norm.eq.${encodeOr(i.value_norm)})`)
    .join(",");
  const { data, error } = await supabase
    .from("person_identities")
    .select("person_id, kind, value_norm")
    .or(ors);
  if (error) logger?.warn?.("[personResolution] identity lookup failed", { error: error.message });
  for (const row of data || []) add(row.person_id, row.kind, row.value_norm);

  // 2) Denormalized people columns (complete source). Match each identity against
  //    its column by the normalized value (people.email is stored lower-cased,
  //    exactly as the legacy email-only lookup assumed — so no regression).
  const col = { email: "email", phone: "phone_e164", ig_user_id: "ig_user_id" };
  for (const idn of identities) {
    const column = col[idn.kind];
    if (!column) continue;
    const { data: prows, error: perr } = await supabase
      .from("people").select("id").eq(column, idn.value_norm); // safe-query: ok — exact identifier match (email/phone/ig), a handful of rows at most
    if (perr) { logger?.warn?.("[personResolution] people lookup failed", { kind: idn.kind, error: perr.message }); continue; }
    for (const p of prows || []) add(p.id, idn.kind, idn.value_norm);
  }
  return out;
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
 * Pure canonical-selection — the "who is this person?" decision, no DB.
 *
 * Given the person_identities rows that matched a touchpoint's identifiers,
 * decide which existing person is canonical and which others are conflicts to
 * flag. EMAIL-ANCHORED: when `preferKind` is set and one matched identity is
 * that kind, its owner wins — so an RSVP attaches to whoever owns the TYPED
 * EMAIL, never silently to an older record a phone happened to match. With no
 * preferred match, the OLDEST person wins (stable, least surprising).
 *
 * @param {Array<{personId,createdAt,kind}>} matchedRows
 * @param {{preferKind?: string}} opts
 * @returns {{canonicalId: string|null, conflictIds: string[]}}
 */
export function pickCanonicalPerson(matchedRows = [], { preferKind = null } = {}) {
  const byPerson = new Map(); // personId -> createdAt (first seen)
  let preferred = null;
  for (const r of matchedRows) {
    if (!r || !r.personId) continue;
    if (!byPerson.has(r.personId)) byPerson.set(r.personId, r.createdAt || "");
    if (preferKind && r.kind === preferKind && !preferred) preferred = r.personId;
  }
  const people = [...byPerson.keys()];
  if (!people.length) return { canonicalId: null, conflictIds: [] };
  let canonicalId = preferred;
  if (!canonicalId) {
    canonicalId = people.slice().sort((a, b) => {
      const ca = byPerson.get(a), cb = byPerson.get(b);
      if (ca < cb) return -1;
      if (ca > cb) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    })[0];
  }
  return { canonicalId, conflictIds: people.filter((p) => p !== canonicalId) };
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
export async function resolvePersonByIdentity({ identifiers, profile = {}, source = "resolve", preferKind = null } = {}) {
  const identities = buildIdentities(identifiers);
  if (!identities.length) {
    throw new Error("[personResolution] no usable identifiers provided");
  }

  const rows = await lookupExistingRows(identities);
  // Map for the per-identifier conflict check further down.
  const existing = new Map();
  for (const row of rows) existing.set(`${row.kind}:${row.value_norm}`, row.person_id);
  const matchedPersonIds = [...new Set(rows.map((r) => r.person_id))];

  let canonicalId;
  let created = false;
  const conflicts = [];

  if (matchedPersonIds.length === 0) {
    // Nobody yet — create the person from the provided profile.
    canonicalId = await createPerson(profile, identifiers);
    created = true;
  } else {
    // One or more existing people matched. The canonical choice is EMAIL-anchored
    // when preferKind is set (see pickCanonicalPerson); otherwise oldest wins.
    // Multiple distinct matches = a collision to flag, never an auto-merge.
    const createdAt = await personCreatedAtMap(matchedPersonIds);
    const matchedRows = rows.map((r) => ({
      personId: r.person_id, kind: r.kind, createdAt: createdAt.get(r.person_id) || "",
    }));
    const decision = pickCanonicalPerson(matchedRows, { preferKind });
    canonicalId = decision.canonicalId;
    if (decision.conflictIds.length) {
      for (const other of decision.conflictIds) {
        conflicts.push(other);
        await queueMatchCandidate(canonicalId, other, "multi_identity_collision");
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

// created_at per matched person (a handful at most — one per provided
// identifier), so the pure canonical picker can decide oldest-vs-preferred.
async function personCreatedAtMap(ids) {
  const m = new Map();
  if (!ids.length) return m;
  const { data } = await supabase.from("people").select("id, created_at").in("id", ids); // safe-query: ok — ids = matched people, bounded by identifier count (<=6)
  for (const p of data || []) m.set(p.id, p.created_at || "");
  return m;
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
