// backend/src/services/adminMatching.js
//
// THE MATCH-REVIEW COCKPIT (admin-only).
//
// Identity resolution (personResolution.js) deliberately never auto-merges an
// ambiguous match — verified identifiers link, typed handles stay soft claims,
// collisions queue in person_match_candidates and wait for a human. This service
// is that human's surface: full visibility over how every person was fused
// across Instagram / WhatsApp / email / PullUp, graded by confidence from
// hard-verified → soft-claim → open-collision, with the tools to confirm, edit,
// split or merge — every action audited in match_reviews (mig 066).
//
// Matching is NOT something we can learn (the corpus is thin; see
// [[project_vector_room_model]]). So we don't hide the machine's guesses — we
// lay every parameter on each side out and let the admin sign off. See
// [[project_external_data_system]], [[project_the_room_is_pullup]].

import { supabase } from "../supabase.js";
import { logger } from "../logger.js";
import { upsertSourceProfile } from "./personSourceProfiles.js";

const HANDLE_KINDS = new Set(["ig_handle", "tiktok", "twitter"]);
const STRONG_SOURCES = new Set(["whatsapp", "wa", "ig", "instagram", "google"]);

// Map an identity kind to the channel/source it represents, for grouping "sides".
export function kindChannel(kind) {
  if (kind === "email") return "email";
  if (kind === "phone") return "whatsapp";
  if (kind === "ig_user_id" || kind === "ig_handle") return "instagram";
  if (kind === "tiktok") return "tiktok";
  if (kind === "twitter") return "twitter";
  return "other";
}

// Confidence band for a single identity link. Lower rank = more settled; the
// ledger floats the highest-rank (most-uncertain) people to the top.
//   confirmed (0) — an admin eyeballed it and signed off (reviewed_at)
//   verified  (1) — interaction/crypto proof (verified_at: magic-link, OTP)
//   strong    (2) — platform-native id straight from an authenticated channel
//   declared  (3) — an email/phone the person typed (real, unconfirmed)
//   claim     (4) — a handle the person typed (soft — needs a look)
export function gradeIdentity(idn = {}, ctx = {}) {
  if (idn.reviewed_at) return { band: "confirmed", rank: 0 };
  if (idn.verified_at) return { band: "verified", rank: 1 };
  // Following the creator on Instagram is strong corroboration: a confirmed,
  // engaged human in their world. It bumps an IG claim out of "soft" — the match
  // is near-certain. (Follow status only exists for people who interacted via
  // IG; for those we usually have the verified IGSID too, so this is the
  // human-readable confirmation beside it.)
  if (ctx.igFollowsCreator && (idn.kind === "ig_handle" || idn.kind === "ig_user_id")) {
    return { band: "follower", rank: 2 };
  }
  const src = String(idn.source || "").toLowerCase();
  if (idn.kind === "ig_user_id") return { band: "strong", rank: 2 };
  if (idn.kind === "phone" && (src === "whatsapp" || src === "wa")) return { band: "strong", rank: 2 };
  if (STRONG_SOURCES.has(src) && !HANDLE_KINDS.has(idn.kind)) return { band: "strong", rank: 2 };
  if (HANDLE_KINDS.has(idn.kind)) return { band: "claim", rank: 4 };
  return { band: "declared", rank: 3 };
}

// True when this person's Instagram source profile shows they follow the creator
// (Meta's is_user_follow_business, captured on IG DM enrichment).
function followsCreator(profiles = []) {
  const ig = profiles.find((p) => p.source === "instagram");
  const d = ig?.data || {};
  return d.is_user_follow_business === true || d.isUserFollowBusiness === true;
}

const BAND_LABEL = {
  collision: "Collision",
  claim: "Soft claim",
  declared: "Declared",
  follower: "Confirmed follower",
  strong: "Strong",
  verified: "Verified",
  confirmed: "Confirmed",
};

// Roll a person's links + collision state into one band + a needs-review flag.
function rollup({ identities, hasCollision, igFollowsCreator = false }) {
  const graded = identities.map((i) => ({ ...i, ...gradeIdentity(i, { igFollowsCreator }) }));
  const worst = graded.reduce((m, g) => Math.max(m, g.rank), 0);
  const crossSource = new Set(graded.map((g) => kindChannel(g.kind))).size > 1;
  // The thing that needs a human is a typed-handle CLAIM (the machine's guess that
  // this handle is this human) — not a "declared" email/phone, which is the
  // person's own anchor, and not a follow-confirmed handle (no longer a guess).
  const hasUnreviewedClaim = graded.some((g) => !g.reviewed_at && g.band === "claim");

  let band;
  if (hasCollision) band = "collision";
  else band = ["confirmed", "verified", "strong", "declared", "claim"][worst] || "declared";

  // A person needs a look when the machine had to guess: an open collision, OR a
  // cross-source fusion still resting on an unconfirmed handle claim.
  const needsReview = hasCollision || (crossSource && hasUnreviewedClaim);

  // Sort weight: collisions top, then by worst link rank, then richer rows first.
  const sortScore =
    (hasCollision ? 1000 : 0) + worst * 100 + (needsReview ? 50 : 0) + Math.min(graded.length, 9);

  return { band, needsReview, sortScore, graded };
}

function displayName(p) {
  return (
    p.name ||
    (p.email ? p.email.split("@")[0] : null) ||
    (p.instagram ? `@${p.instagram}` : null) ||
    (p.phone_e164 ? p.phone_e164 : null) ||
    "Unknown"
  );
}

// ── LEDGER ──────────────────────────────────────────────────────────
// Global (admin) list of every person, each with its linked identifiers graded
// by confidence + the channels they touch. Sorted so what needs a human floats
// up, but everything — down to a single hard-verified email — stays visible.
export async function listMatches({ q = "", filter = "all", limit = 50, offset = 0 } = {}) {
  // 1. People (optionally text-filtered). Global; people carry no host_id.
  let pq = supabase
    .from("people")
    .select("id, name, email, phone_e164, instagram, ig_user_id, tiktok, acquisition_channel, created_at")
    .limit(5000);
  if (q && q.trim()) {
    const s = q.trim().replace(/[%,]/g, " ");
    pq = pq.or(`name.ilike.%${s}%,email.ilike.%${s}%,instagram.ilike.%${s}%,phone_e164.ilike.%${s}%`);
  }
  const { data: people, error } = await pq;
  if (error) { logger?.warn?.("[adminMatching] people read failed", { error: error.message }); return { total: 0, counts: {}, items: [] }; }
  const ids = (people || []).map((p) => p.id);
  if (!ids.length) return { total: 0, counts: {}, items: [] };

  // 2. Identities + source-profile presence + pending collisions, in bulk.
  const [identsRes, srcRes, candRes] = await Promise.all([
    fetchIn("person_identities", "id, person_id, kind, value, value_norm, verified_at, reviewed_at, source, created_at", ids),
    fetchIn("person_source_profiles", "person_id, source, handle, display_name, avatar_url, data", ids),
    supabase.from("person_match_candidates").select("id, person_a, person_b, reason, score").eq("status", "pending"),
  ]);

  const identsByPerson = groupBy(identsRes, "person_id");
  const srcByPerson = groupBy(srcRes, "person_id");
  const collisionMap = new Map(); // personId -> [{ otherId, reason, score, candidateId }]
  for (const c of candRes?.data || []) {
    pushMap(collisionMap, c.person_a, { otherId: c.person_b, reason: c.reason, score: c.score, candidateId: c.id });
    pushMap(collisionMap, c.person_b, { otherId: c.person_a, reason: c.reason, score: c.score, candidateId: c.id });
  }

  // 3. Assemble + grade.
  let items = (people || []).map((p) => {
    const identities = identsByPerson.get(p.id) || [];
    const collisions = collisionMap.get(p.id) || [];
    const profs = srcByPerson.get(p.id) || [];
    const igFollowsCreator = followsCreator(profs);
    const { band, needsReview, sortScore, graded } = rollup({ identities, hasCollision: collisions.length > 0, igFollowsCreator });
    const channels = [...new Set(graded.map((g) => kindChannel(g.kind)))];
    const sources = [...new Set(profs.map((s) => s.source))];
    const allReviewed = graded.length > 0 && graded.every((g) => g.reviewed_at || g.band === "verified");
    return {
      personId: p.id,
      name: displayName(p),
      email: p.email || null,
      instagram: p.instagram || null,
      phone: p.phone_e164 || null,
      igUserId: p.ig_user_id || null,
      acquisition: p.acquisition_channel || null,
      createdAt: p.created_at,
      band,
      bandLabel: BAND_LABEL[band] || band,
      needsReview,
      reviewed: allReviewed,
      identityCount: graded.length,
      channels,
      sources,
      identities: graded.map((g) => ({
        id: g.id, kind: g.kind, value: g.value, source: g.source,
        band: g.band, channel: kindChannel(g.kind),
        verifiedAt: g.verified_at, reviewedAt: g.reviewed_at,
      })),
      collisions,
      _sortScore: sortScore,
    };
  });

  // 4. Counts across the (search-filtered) set — drives the filter chips.
  const counts = { all: items.length, needs_review: 0, collision: 0, claim: 0, confirmed: 0 };
  for (const it of items) {
    if (it.needsReview) counts.needs_review++;
    if (it.band === "collision") counts.collision++;
    if (it.band === "claim") counts.claim++;
    if (it.reviewed) counts.confirmed++;
  }

  // 5. Filter.
  if (filter === "needs_review") items = items.filter((i) => i.needsReview);
  else if (filter === "collision") items = items.filter((i) => i.band === "collision");
  else if (filter === "claim") items = items.filter((i) => i.band === "claim");
  else if (filter === "confirmed") items = items.filter((i) => i.reviewed);
  else if (filter === "multi") items = items.filter((i) => i.identityCount > 1);

  // 6. Sort (uncertain → settled) then paginate.
  items.sort((a, b) => b._sortScore - a._sortScore || (b.identityCount - a.identityCount) || a.name.localeCompare(b.name));
  const total = items.length;
  const page = items.slice(offset, offset + limit).map(({ _sortScore, ...rest }) => rest);
  return { total, counts, items: page };
}

// ── DETAIL — every parameter on every side, for manual verification ──
export async function getMatchDetail(personId) {
  if (!personId) return null;
  const [{ data: person }, identsRes, srcRes, eventsRes, waRes, igRes, mergesRes, reviewsRes, loginsRes] = await Promise.all([
    supabase.from("people").select("*").eq("id", personId).maybeSingle(),
    supabase.from("person_identities").select("id, kind, value, value_norm, verified_at, reviewed_at, reviewed_by, source, is_primary, created_at").eq("person_id", personId),
    supabase.from("person_source_profiles").select("source, source_id, handle, display_name, avatar_url, data, first_seen_at, last_refreshed_at").eq("person_id", personId),
    supabase.from("person_events").select("type, channel, direction, body, occurred_at, host_id").eq("person_id", personId).order("occurred_at", { ascending: false }).limit(40),
    supabase.from("whatsapp_threads").select("phone_e164, last_message_preview, last_message_direction, unread_count, conversation_window_expires_at, updated_at").eq("person_id", personId),
    supabase.from("instagram_threads").select("ig_user_id, handle, last_message_preview, last_message_direction, unread_count, conversation_window_expires_at, updated_at").eq("person_id", personId),
    supabase.from("person_merges").select("merged_person_id, merged_by, reason, snapshot, created_at").eq("canonical_person_id", personId).order("created_at", { ascending: false }),
    supabase.from("match_reviews").select("action, actor_id, target_person_id, detail, created_at").eq("person_id", personId).order("created_at", { ascending: false }).limit(50),
    supabase.from("person_auth_accounts").select("auth_user_id, method, email, is_primary, created_at").eq("person_id", personId).order("is_primary", { ascending: false }),
  ]);
  if (!person) return null;

  // Login accounts (mig 067). Fall back to the people.auth_user_id column if the
  // table hasn't been backfilled for this person yet, so the primary always shows.
  let logins = loginsRes?.data || [];
  if (!logins.length && person.auth_user_id) {
    logins = [{ auth_user_id: person.auth_user_id, method: "primary", email: person.email, is_primary: true }];
  }

  // Collisions: pull the counterpart person's identity summary for side-by-side.
  const { data: cands } = await supabase
    .from("person_match_candidates")
    .select("id, person_a, person_b, reason, score, status")
    .or(`person_a.eq.${personId},person_b.eq.${personId}`)
    .eq("status", "pending");
  const otherIds = (cands || []).map((c) => (c.person_a === personId ? c.person_b : c.person_a));
  let others = [];
  if (otherIds.length) {
    const [{ data: op }, oIdents] = await Promise.all([
      supabase.from("people").select("id, name, email, instagram, phone_e164, ig_user_id, created_at").in("id", otherIds),
      fetchIn("person_identities", "id, person_id, kind, value, verified_at, reviewed_at, source", otherIds),
    ]);
    const oByPerson = groupBy(oIdents, "person_id");
    others = (op || []).map((p) => ({
      personId: p.id,
      name: displayName(p),
      email: p.email, instagram: p.instagram, phone: p.phone_e164,
      createdAt: p.created_at,
      identities: (oByPerson.get(p.id) || []).map((g) => ({ kind: g.kind, value: g.value, source: g.source, ...gradeIdentity(g) })),
    }));
  }

  const igFollowsCreator = followsCreator(srcRes?.data || []);
  const identities = (identsRes?.data || []).map((g) => ({ ...g, channel: kindChannel(g.kind), ...gradeIdentity(g, { igFollowsCreator }) }));
  const { band, needsReview } = rollup({ identities, hasCollision: (cands || []).length > 0, igFollowsCreator });

  // Per-channel timeline rollup (how active each side is).
  const channelStats = {};
  for (const e of eventsRes?.data || []) {
    const ch = e.channel || "other";
    channelStats[ch] = channelStats[ch] || { total: 0, in: 0, out: 0, last: null };
    channelStats[ch].total++;
    if (e.direction === "in") channelStats[ch].in++;
    if (e.direction === "out") channelStats[ch].out++;
    if (!channelStats[ch].last) channelStats[ch].last = e.occurred_at;
  }

  return {
    person: {
      id: person.id, name: displayName(person),
      email: person.email, instagram: person.instagram, phone: person.phone_e164,
      igUserId: person.ig_user_id, tiktok: person.tiktok, twitter: person.twitter || null,
      acquisition: person.acquisition_channel || null,
      createdAt: person.created_at, updatedAt: person.updated_at,
    },
    band, bandLabel: BAND_LABEL[band] || band, needsReview,
    identities,
    sourceProfiles: srcRes?.data || [],
    timeline: eventsRes?.data || [],
    channelStats,
    whatsappThreads: waRes?.data || [],
    instagramThreads: igRes?.data || [],
    collisions: (cands || []).map((c) => ({
      candidateId: c.id, reason: c.reason, score: c.score,
      other: others.find((o) => o.personId === (c.person_a === personId ? c.person_b : c.person_a)) || null,
    })),
    logins,
    mergeHistory: mergesRes?.data || [],
    reviewLog: reviewsRes?.data || [],
  };
}

// ── MUTATIONS (all audited) ─────────────────────────────────────────

// Confirm: an admin looked at every parameter and signed off on this person's
// links. Marks unreviewed identities reviewed; settles the row.
export async function confirmLinks(personId, actorId) {
  if (!personId) throw new Error("personId required");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("person_identities")
    .update({ reviewed_at: now, reviewed_by: actorId || null })
    .eq("person_id", personId)
    .is("reviewed_at", null)
    .select("id, kind, value");
  if (error) throw error;
  await logReview({ actorId, action: "confirm_link", personId, detail: { confirmed: data || [] } });
  return { ok: true, confirmed: (data || []).length };
}

// Edit canonical params. Name/handle route through a manual source profile (top
// precedence, so the resolver won't fight it); other cache columns set directly.
export async function editParams(personId, patch = {}, actorId) {
  if (!personId) throw new Error("personId required");
  const { data: before } = await supabase
    .from("people").select("name, email, phone_e164, instagram, tiktok, twitter").eq("id", personId).maybeSingle();

  const name = patch.name != null ? String(patch.name).trim() : undefined;
  const instagram = patch.instagram != null ? String(patch.instagram).trim().replace(/^@+/, "") : undefined;

  // Manual snapshot carries name/handle at top precedence + recomputes people.name.
  if (name !== undefined || instagram !== undefined) {
    await upsertSourceProfile({
      personId, source: "manual",
      handle: instagram || before?.instagram || null,
      displayName: name || before?.name || null,
      data: { editedByAdmin: actorId || null, ...patch },
    });
  }

  // Direct cache columns (admin override). Only set provided, non-empty fields.
  const cols = {};
  for (const k of ["name", "email", "phone_e164", "instagram", "tiktok", "twitter"]) {
    if (patch[k] != null) cols[k] = k === "instagram" ? instagram : String(patch[k]).trim() || null;
  }
  if (Object.keys(cols).length) {
    cols.updated_at = new Date().toISOString();
    const { error } = await supabase.from("people").update(cols).eq("id", personId);
    if (error) throw error;
  }
  await logReview({ actorId, action: "edit_params", personId, detail: { before, patch } });
  return { ok: true };
}

// Split one identifier off onto a fresh person — the undo for a wrong claim.
export async function splitIdentity(identityId, actorId) {
  if (!identityId) throw new Error("identityId required");
  const { data, error } = await supabase.rpc("admin_split_identity", {
    p_identity_id: identityId, p_actor: actorId || null,
  });
  if (error) throw new Error(error.message);
  return data;
}

// Merge two people into one (canonical absorbs merged). Atomic + audited in DB.
export async function mergePeople({ canonicalId, mergedId, actorId, candidateId = null }) {
  if (!canonicalId || !mergedId) throw new Error("canonicalId and mergedId required");
  const { data, error } = await supabase.rpc("admin_merge_people", {
    p_canonical: canonicalId, p_merged: mergedId, p_actor: actorId || null, p_candidate: candidateId,
  });
  if (error) throw new Error(error.message);
  return data;
}

// Reject a collision suggestion — they are NOT the same human.
export async function rejectCandidate(candidateId, actorId) {
  if (!candidateId) throw new Error("candidateId required");
  const { data: cand } = await supabase
    .from("person_match_candidates").select("person_a, person_b, reason").eq("id", candidateId).maybeSingle();
  const { error } = await supabase
    .from("person_match_candidates")
    .update({ status: "rejected", resolved_by: actorId || null, resolved_at: new Date().toISOString() })
    .eq("id", candidateId);
  if (error) throw error;
  await logReview({
    actorId, action: "reject_candidate",
    personId: cand?.person_a || null, targetPersonId: cand?.person_b || null,
    candidateId, detail: { reason: cand?.reason || null },
  });
  return { ok: true };
}

// ── helpers ─────────────────────────────────────────────────────────
async function logReview({ actorId, action, personId, targetPersonId = null, candidateId = null, detail = {} }) {
  try {
    await supabase.from("match_reviews").insert({
      actor_id: actorId || null, action, person_id: personId || null,
      target_person_id: targetPersonId, candidate_id: candidateId, detail,
    });
  } catch (e) { logger?.warn?.("[adminMatching] audit log failed", { error: e?.message }); }
}

// Chunked .in() fetch (PostgREST caps URL length; person sets can be large).
async function fetchIn(table, columns, ids, chunk = 300) {
  const out = [];
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk);
    const { data, error } = await supabase.from(table).select(columns).in("person_id", slice);
    if (error) { logger?.warn?.(`[adminMatching] ${table} read failed`, { error: error.message }); continue; }
    out.push(...(data || []));
  }
  return out;
}

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows || []) {
    if (!m.has(r[key])) m.set(r[key], []);
    m.get(r[key]).push(r);
  }
  return m;
}
function pushMap(map, k, v) {
  if (!map.has(k)) map.set(k, []);
  map.get(k).push(v);
}
