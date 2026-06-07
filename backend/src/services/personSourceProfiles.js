// backend/src/services/personSourceProfiles.js
//
// External-data capture + resolution. Each external source (Instagram,
// WhatsApp, the RSVP form, Google, a manual host edit, an import) gets ONE
// row per person holding that source's view EXACTLY as it gave it. We never
// overwrite one source with another; the displayed name/handle/avatar is
// DERIVED from these by precedence. people.* is kept as a conservative
// write-through cache so every existing read stays correct without change.
//
// Spine: this sits beside person_identities (links) + person_events (timeline).
// See [[project_external_data_system]].

import { supabase } from "../supabase.js";
import { logger } from "../logger.js";

// Who wins when sources disagree. The human who knows them (a manual host edit)
// beats the person's own declared info (RSVP), which beats platform profiles.
export const SOURCE_PRECEDENCE = [
  "manual", "rsvp", "instagram", "whatsapp", "google", "email", "import",
];

// Normalize the loose source tags callers pass ("ig", "ig_dm") to canonical ones.
export function canonicalSource(source) {
  const s = String(source || "").toLowerCase();
  if (s === "ig" || s === "ig_dm" || s === "ig_comment" || s === "instagram") return "instagram";
  if (s === "wa" || s === "whatsapp") return "whatsapp";
  if (s === "rsvp" || s === "rsvp_form" || s === "form") return "rsvp";
  if (s === "google" || s === "oauth_google") return "google";
  if (s === "manual" || s === "host") return "manual";
  if (s === "import" || s === "csv") return "import";
  if (s === "email") return "email";
  return s || "import";
}

/**
 * Upsert this source's snapshot for a person. Idempotent on (person_id, source):
 * a source only ever updates its OWN row. Pass whatever the source gave you;
 * `data` is the full raw payload, kept untouched.
 */
export async function upsertSourceProfile({ personId, source, sourceId = null, handle = null, displayName = null, avatarUrl = null, data = {} }) {
  if (!personId || !source) return null;
  const src = canonicalSource(source);
  const now = new Date().toISOString();
  try {
    const { data: row, error } = await supabase
      .from("person_source_profiles")
      .upsert(
        {
          person_id: personId,
          source: src,
          source_id: sourceId ? String(sourceId) : null,
          handle: handle || null,
          display_name: displayName || null,
          avatar_url: avatarUrl || null,
          data: data || {},
          last_refreshed_at: now,
          updated_at: now,
        },
        { onConflict: "person_id,source" },
      )
      .select("id")
      .single();
    if (error) {
      logger?.warn?.("[sourceProfiles] upsert failed", { source: src, error: error.message });
      return null;
    }
    // Keep people.* (the read cache) consistent with the new precedence picture.
    await recomputePersonName(personId);
    return row?.id || null;
  } catch (e) {
    logger?.warn?.("[sourceProfiles] upsert error", { error: e?.message });
    return null;
  }
}

export async function getForPerson(personId) {
  if (!personId) return [];
  const { data, error } = await supabase
    .from("person_source_profiles")
    .select("source, source_id, handle, display_name, avatar_url, data, last_refreshed_at")
    .eq("person_id", personId);
  if (error) { logger?.warn?.("[sourceProfiles] getForPerson failed", { error: error.message }); return []; }
  return data || [];
}

// Bulk fetch for the Room: personId -> [profiles].
export async function getForPersons(personIds = []) {
  const ids = (personIds || []).filter(Boolean);
  const out = new Map();
  if (!ids.length) return out;
  const { data, error } = await supabase
    .from("person_source_profiles")
    .select("person_id, source, source_id, handle, display_name, avatar_url, data, last_refreshed_at")
    .in("person_id", ids);
  if (error) { logger?.warn?.("[sourceProfiles] getForPersons failed", { error: error.message }); return out; }
  for (const r of data || []) {
    if (!out.has(r.person_id)) out.set(r.person_id, []);
    out.get(r.person_id).push(r);
  }
  return out;
}

// Pure precedence pick over a person's source profiles. Field-by-field, so a
// name can come from one source and an avatar from another — whichever ranks
// highest for that field.
export function resolveDisplay(profiles = []) {
  const pick = (field) => {
    for (const src of SOURCE_PRECEDENCE) {
      const p = profiles.find((x) => x.source === src && x[field]);
      if (p) return { value: p[field], source: src };
    }
    return { value: null, source: null };
  };
  const name = pick("display_name");
  const handle = pick("handle");
  const avatar = pick("avatar_url");
  return {
    name: name.value, nameSource: name.source,
    handle: handle.value, handleSource: handle.source,
    avatarUrl: avatar.value, avatarSource: avatar.source,
  };
}

/**
 * Conservatively reconcile people.name (the read cache) with the precedence
 * picture. SAFE by design — it never degrades an existing name:
 *   • a manual host edit always wins (top precedence),
 *   • an empty name gets filled from the best available source,
 *   • an existing non-manual name is left alone (no automated clobber).
 * The raw values live forever in person_source_profiles, so reads can later
 * resolve live without this cache.
 */
export async function recomputePersonName(personId) {
  if (!personId) return;
  try {
    const profiles = await getForPerson(personId);
    if (!profiles.length) return;
    const manual = profiles.find((p) => p.source === "manual" && p.display_name);
    const { name: resolved } = resolveDisplay(profiles);
    const { data: person } = await supabase
      .from("people").select("name, instagram").eq("id", personId).maybeSingle();
    if (!person) return;

    const patch = {};
    if (manual) {
      if (person.name !== manual.display_name) patch.name = manual.display_name; // host wins
    } else if (!person.name && resolved) {
      patch.name = resolved; // fill the gap only
    }
    // Mirror the IG handle into people.instagram only when empty (gap-fill).
    if (!person.instagram) {
      const ig = profiles.find((p) => p.source === "instagram" && p.handle);
      if (ig) patch.instagram = ig.handle;
    }
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      await supabase.from("people").update(patch).eq("id", personId);
    }
  } catch (e) {
    logger?.warn?.("[sourceProfiles] recompute failed", { error: e?.message });
  }
}
