// backend/src/services/peopleMatching.js
//
// Matching over the resolved person graph: PullUp's own behavioral data (who
// came to what) fused with the third-party signals we capture (Instagram reach
// + follow reciprocity). Deliberately SCORED + EXPLAINABLE — every match ships
// with the reasons it surfaced, true to "signals, not dashboards". This is the
// grounded foundation for [[project_vector_room_model]]: with a thin corpus,
// transparent behavioral overlap beats opaque embeddings; it can graduate to
// vectors when the substrate grows.
//
// findMatches({ hostId, personId }) → "who in your world is closest to X, and
// why" — the substrate for introductions, lookalikes, and curated invites.

import { supabase } from "../supabase.js";
import { logger } from "../logger.js";
import { getForPersons } from "./personSourceProfiles.js";

const ATTEND_TYPES = ["rsvp", "attended", "waitlist_join"];

function igSignals(profiles = []) {
  const ig = profiles.find((p) => p.source === "instagram");
  if (!ig) return null;
  const d = ig.data || {};
  const num = (...v) => { for (const x of v) if (typeof x === "number") return x; return null; };
  const bool = (...v) => { for (const x of v) if (typeof x === "boolean") return x; return null; };
  return {
    followerCount: num(d.followerCount, d.follower_count),
    followsYou: bool(d.isUserFollowBusiness, d.is_user_follow_business),
    youFollow: bool(d.isBusinessFollowUser, d.is_business_follow_user),
    verified: bool(d.isVerified, d.is_verified_user),
  };
}

// Reach tiers so "similar reach" is meaningful regardless of exact counts.
function reachTier(n) {
  if (n == null) return null;
  if (n < 1000) return 0;        // <1k
  if (n < 10000) return 1;       // 1k–10k (micro)
  if (n < 100000) return 2;      // 10k–100k
  if (n < 1000000) return 3;     // 100k–1M
  return 4;                       // 1M+
}
const TIER_LABEL = ["<1k", "1k–10k", "10k–100k", "100k–1M", "1M+"];

/**
 * Rank the host's people by closeness to `personId`, with explainable reasons.
 * @returns {Promise<{subject, matches: Array<{personId, name, score, reasons[]}>}>}
 */
export async function findMatches({ hostId, personId, limit = 10 }) {
  if (!hostId || !personId) return { subject: null, matches: [] };
  try {
    // 1. Every (person, event) touch in the host's world — the behavioral graph.
    const { data: pe, error } = await supabase
      .from("person_events")
      .select("person_id, event_id, type")
      .eq("host_id", hostId)
      .in("type", ATTEND_TYPES)
      .not("event_id", "is", null)
      .limit(20000);
    if (error) { logger?.warn?.("[matching] timeline read failed", { error: error.message }); return { subject: null, matches: [] }; }

    const eventsByPerson = new Map();
    for (const r of pe || []) {
      if (!eventsByPerson.has(r.person_id)) eventsByPerson.set(r.person_id, new Set());
      eventsByPerson.get(r.person_id).add(r.event_id);
    }
    const subjectEvents = eventsByPerson.get(personId) || new Set();
    const candidateIds = [...eventsByPerson.keys()].filter((id) => id !== personId);
    if (!candidateIds.length) return { subject: { personId }, matches: [] };

    // 2. People + their source profiles (names + third-party signals) in bulk.
    const allIds = [personId, ...candidateIds];
    const [{ data: people }, sourceProfiles] = await Promise.all([
      supabase.from("people").select("id, name, email, instagram").in("id", allIds),
      getForPersons(allIds),
    ]);
    const peopleById = new Map((people || []).map((p) => [p.id, p]));
    const subjIg = igSignals(sourceProfiles.get(personId) || []);
    const subjTier = reachTier(subjIg?.followerCount);

    // 3. Event titles for human-readable reasons.
    const eventIds = [...new Set((pe || []).map((r) => r.event_id))];
    const { data: evRows } = await supabase
      .from("events").select("id, title").in("id", eventIds.length ? eventIds : ["00000000-0000-0000-0000-000000000000"]);
    const titleById = new Map((evRows || []).map((e) => [e.id, e.title || "an event"]));

    // 4. Score each candidate — transparent weights, reasons attached.
    const matches = [];
    for (const cid of candidateIds) {
      const candEvents = eventsByPerson.get(cid) || new Set();
      const shared = [...subjectEvents].filter((e) => candEvents.has(e));
      const candIg = igSignals(sourceProfiles.get(cid) || []);
      let score = 0;
      const reasons = [];

      // Co-attendance — the strongest signal (they were in the same rooms).
      if (shared.length) {
        score += shared.length * 3;
        const titles = shared.slice(0, 3).map((e) => titleById.get(e)).filter(Boolean);
        reasons.push(`Both at ${shared.length} of your event${shared.length > 1 ? "s" : ""}${titles.length ? `: ${titles.join(", ")}` : ""}`);
      }

      // Similar reach — peers on Instagram (same tier).
      const candTier = reachTier(candIg?.followerCount);
      if (subjTier != null && candTier != null && subjTier === candTier) {
        score += 2;
        reasons.push(`Similar reach (${TIER_LABEL[candTier]} followers)`);
      }
      // Notable reach on its own surfaces them.
      if (candTier != null && candTier >= 2) {
        score += candTier;
        reasons.push(`${TIER_LABEL[candTier]} on Instagram`);
      }
      if (candIg?.verified) { score += 1; reasons.push("Verified on Instagram"); }
      // Follow reciprocity with the host's account.
      if (candIg?.followsYou && candIg?.youFollow) { score += 2; reasons.push("You follow each other on IG"); }
      else if (candIg?.followsYou) { score += 1; reasons.push("Follows you on IG"); }

      if (score <= 0) continue; // only surface real overlap
      const p = peopleById.get(cid) || {};
      matches.push({
        personId: cid,
        name: p.name || (p.email ? p.email.split("@")[0] : null) || (p.instagram ? `@${p.instagram}` : "Someone"),
        score,
        sharedEvents: shared.length,
        reasons,
      });
    }

    matches.sort((a, b) => b.score - a.score);
    return {
      subject: { personId, name: peopleById.get(personId)?.name || null },
      matches: matches.slice(0, Math.max(1, Math.min(limit, 50))),
    };
  } catch (e) {
    logger?.warn?.("[matching] findMatches error", { error: e?.message });
    return { subject: null, matches: [] };
  }
}
