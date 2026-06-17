// The host's effective avatar — one rule, used everywhere a host's face shows.
//
// Priority:
//   1. uploaded profile picture — an upload ALWAYS overrides
//   2. an avatar from any external connection: person_source_profiles.avatar_url
//      by source precedence (manual > rsvp > instagram > whatsapp > google > …)
//   3. the brand logo
//   4. null → the frontend draws initials / the eyes mark
//
// Callers pass what they already hold (uploaded URL, the account id, and/or the
// person id) so this never refetches a profile it doesn't need.

import { supabase } from "../supabase.js";
import { getForPerson, resolveDisplay } from "./personSourceProfiles.js";

// Turn a profile-pictures reference (a raw storage path OR an existing/expired
// signed URL) into a FRESH usable URL. The uploaded pic is stored as a bucket
// path, not a URL, so we must sign it — otherwise the <img> src is broken (the
// pink-circle-with-no-image bug). An external http avatar that isn't ours is
// returned untouched.
async function signProfilePic(value) {
  if (!value) return null;
  try {
    let path = value;
    const m = value.match(/profile-pictures\/([^?]+)/);
    if (m) path = m[1];
    else if (/^https?:\/\//i.test(value)) return value; // external URL, not our bucket
    const { data: signed } = await supabase.storage.from("profile-pictures").createSignedUrl(path, 3600);
    if (signed?.signedUrl) return signed.signedUrl;
    const { data: pub } = supabase.storage.from("profile-pictures").getPublicUrl(path);
    return pub?.publicUrl || value;
  } catch {
    return value;
  }
}

export async function resolveEffectiveAvatar({ uploaded = null, accountId = null, personId = null, brandLogo = null } = {}) {
  if (uploaded) return await signProfilePic(uploaded); // an upload overrides everything

  try {
    let pid = personId;
    if (!pid && accountId) {
      const { data: person } = await supabase
        .from("people")
        .select("id")
        .eq("auth_user_id", accountId)
        .maybeSingle();
      pid = person?.id || null;
    }
    if (pid) {
      const sources = await getForPerson(pid).catch(() => []);
      const display = resolveDisplay(sources);
      if (display?.avatarUrl) return display.avatarUrl;
    }

    // The host's OAuth avatar (e.g. Google sign-in) lives on the auth user's
    // metadata — a real external connection we can use straight away.
    if (accountId) {
      const { data } = await supabase.auth.admin.getUserById(accountId);
      const meta = data?.user?.user_metadata || {};
      const oauthAvatar = meta.avatar_url || meta.picture || null;
      if (oauthAvatar) return oauthAvatar;
    }
  } catch {
    /* fall through to brand logo / null — never throw from an avatar lookup */
  }

  return brandLogo || null;
}
