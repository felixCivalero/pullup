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
    await enrichPersonProfile(personId);
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
 * Conservatively fill people.* (the read cache) from EVERYTHING linked to this
 * person — source profiles (by precedence) + verified identities. This is the
 * "match → enrich" payoff: each link a person gains fills more of their empty
 * params. SAFE / gap-fill by design — it never degrades an existing value:
 *   • a manual host edit always wins (top precedence),
 *   • an EMPTY column gets filled from the best available source,
 *   • an existing non-empty value is left alone (no automated clobber).
 * The raw truth lives forever in person_source_profiles / person_identities, so
 * reads that resolve live (e.g. roomService.resolveDisplay → the avatar) work
 * regardless of this cache. Returns the list of fields it filled.
 *
 * Runs on every source upsert AND after a merge (so absorbing a profile flows
 * its name / handle / id / phone into the surviving spine's blanks).
 */
export async function enrichPersonProfile(personId) {
  if (!personId) return { filled: [] };
  try {
    const profiles = await getForPerson(personId);
    const { data: idents } = await supabase
      .from("person_identities")
      .select("kind, value, verified_at")
      .eq("person_id", personId);
    const { data: person } = await supabase
      .from("people")
      .select("name, instagram, ig_user_id, phone_e164, email")
      .eq("id", personId)
      .maybeSingle();
    if (!person) return { filled: [] };

    const ids = idents || [];
    const firstId = (kind, preferVerified = false) => {
      const matches = ids.filter((i) => i.kind === kind && i.value);
      if (!matches.length) return null;
      if (preferVerified) {
        const v = matches.find((i) => i.verified_at);
        if (v) return v.value;
      }
      return matches[0].value;
    };

    const patch = {};

    // NAME — manual host edit wins; otherwise fill an EMPTY name from the best source.
    const manual = profiles.find((p) => p.source === "manual" && p.display_name);
    const { name: resolvedName, handle: resolvedHandle } = resolveDisplay(profiles);
    if (manual) {
      if (person.name !== manual.display_name) patch.name = manual.display_name; // host wins
    } else if (!person.name && resolvedName) {
      patch.name = resolvedName; // fill the gap only
    }

    // INSTAGRAM handle — gap-fill from the best IG source profile, else a handle identity.
    if (!person.instagram) {
      const ig = profiles.find((p) => p.source === "instagram" && p.handle)?.handle
        || resolvedHandle || firstId("ig_handle");
      if (ig) patch.instagram = String(ig).replace(/^@+/, "");
    }
    // IG user id — gap-fill from a platform-native identity (strongest IG anchor).
    if (!person.ig_user_id) {
      const v = firstId("ig_user_id");
      if (v) patch.ig_user_id = v;
    }
    // PHONE — gap-fill, preferring a verified number.
    if (!person.phone_e164) {
      const v = firstId("phone", true);
      if (v) patch.phone_e164 = v;
    }
    // EMAIL — gap-fill, preferring a verified address.
    if (!person.email) {
      const v = firstId("email", true);
      if (v) patch.email = v;
    }

    const filled = Object.keys(patch);
    if (filled.length) {
      patch.updated_at = new Date().toISOString();
      await supabase.from("people").update(patch).eq("id", personId);
    }
    return { filled };
  } catch (e) {
    logger?.warn?.("[sourceProfiles] enrich failed", { error: e?.message });
    return { filled: [] };
  }
}

// Back-compat alias: the original name-only entrypoint now does the full
// gap-fill (callers that just wanted the name resolved get the rest for free).
export const recomputePersonName = enrichPersonProfile;
