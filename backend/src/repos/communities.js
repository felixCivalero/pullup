// Communities repo — a host's world as a joinable thing.
//
// One community per host (v1). A community is the persistent membership layer
// behind the host's events; people JOIN it via a public link and that join is a
// durable edge on the person atom (community_members), sitting next to RSVPs.
import crypto from "node:crypto";
import { supabase } from "../supabase.js";
import { logger } from "../logger.js";

// ── slug helpers (mirrors repos/events.js) ──
function slugify(text) {
  return (text || "")
    .toLowerCase()
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
const SLUG_SUFFIX_CHARSET = "abcdefghjkmnpqrstuvwxyz23456789";
function randomSlugSuffix(len = 4) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += SLUG_SUFFIX_CHARSET[bytes[i] % SLUG_SUFFIX_CHARSET.length];
  return out;
}
function buildSlug(base) {
  const s = slugify(base) || "community";
  return `${s}-${randomSlugSuffix()}`;
}

export function mapCommunityFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    hostId: row.host_id,
    slug: row.slug,
    title: row.title || null,
    blurb: row.blurb || null,
    brand: row.brand || null,
    enabled: row.enabled !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getCommunityByHostId(hostId) {
  if (!hostId) return null;
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .eq("host_id", hostId)
    .maybeSingle();
  if (error) {
    logger?.warn?.("[communities] getByHost failed", { error: error.message });
    return null;
  }
  return mapCommunityFromDb(data);
}

export async function getCommunityBySlug(slug) {
  const norm = (slug || "").trim().toLowerCase();
  if (!norm) return null;
  const { data, error } = await supabase
    .from("communities")
    .select("*")
    .ilike("slug", norm)
    .maybeSingle();
  if (error) {
    logger?.warn?.("[communities] getBySlug failed", { error: error.message });
    return null;
  }
  return mapCommunityFromDb(data);
}

// Get-or-create the host's single community. The host's display name seeds the
// title + slug so a freshly-created community already reads/links nicely.
export async function ensureCommunityForHost(hostId, { hostName = null } = {}) {
  const existing = await getCommunityByHostId(hostId);
  if (existing) return existing;

  const baseTitle = hostName ? `${hostName}'s community` : "My community";
  // Retry slug a few times on the (rare) unique collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = buildSlug(hostName || "community");
    const { data, error } = await supabase
      .from("communities")
      .insert({ host_id: hostId, slug, title: baseTitle })
      .select("*")
      .single();
    if (!error) return mapCommunityFromDb(data);
    // Lost a create race on host_id unique → return the winner.
    if (error.code === "23505" && /communities_host_uniq/.test(error.message || "")) {
      return getCommunityByHostId(hostId);
    }
    // slug collision → retry with a fresh suffix; anything else → bail.
    if (!(error.code === "23505" && /slug/.test(error.message || ""))) {
      logger?.error?.("[communities] ensure failed", { error: error.message });
      return null;
    }
  }
  return getCommunityByHostId(hostId);
}

const EDITABLE = new Set(["title", "blurb", "brand", "enabled", "slug"]);

export async function updateCommunityForHost(hostId, fields = {}) {
  const patch = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!EDITABLE.has(k)) continue;
    if (k === "slug") {
      const s = slugify(v);
      if (s) patch.slug = s;
      continue;
    }
    patch[k] = v;
  }
  if (!Object.keys(patch).length) return getCommunityByHostId(hostId);
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("communities")
    .update(patch)
    .eq("host_id", hostId)
    .select("*")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { error: "slug_taken" };
    logger?.error?.("[communities] update failed", { error: error.message });
    return { error: "update_failed" };
  }
  return mapCommunityFromDb(data);
}

// Add a person to a community. Idempotent: a re-join keeps the original row.
// Returns { membership, created }.
export async function addCommunityMember(communityId, personId, { source = "link" } = {}) {
  const { data, error } = await supabase
    .from("community_members")
    .upsert(
      { community_id: communityId, person_id: personId, source },
      { onConflict: "community_id,person_id", ignoreDuplicates: true },
    )
    .select("id, community_id, person_id, joined_at, source, status")
    .maybeSingle();
  if (error) {
    logger?.error?.("[communities] addMember failed", { error: error.message });
    return { membership: null, created: false };
  }
  // ignoreDuplicates returns null on an existing row → re-fetch it.
  if (!data) {
    const { data: existing } = await supabase
      .from("community_members")
      .select("id, community_id, person_id, joined_at, source, status")
      .eq("community_id", communityId)
      .eq("person_id", personId)
      .maybeSingle();
    return { membership: existing || null, created: false };
  }
  return { membership: data, created: true };
}

// Member count + a few recent member faces for the public page's social proof.
export async function getCommunityMemberSummary(communityId, { recent = 8 } = {}) {
  const { count } = await supabase
    .from("community_members")
    .select("id", { count: "exact", head: true })
    .eq("community_id", communityId)
    .eq("status", "active");

  const { data: rows, error: rowsErr } = await supabase
    .from("community_members")
    .select("person_id, joined_at, people:person_id (name, instagram)")
    .eq("community_id", communityId)
    .eq("status", "active")
    .order("joined_at", { ascending: false })
    .limit(recent);
  if (rowsErr) logger?.warn?.("[communities] member summary rows failed", { error: rowsErr.message });

  const recentMembers = (rows || []).map((r) => ({
    name: r.people?.name || null,
    instagram: r.people?.instagram || null,
  }));
  return { total: count || 0, recentMembers };
}
