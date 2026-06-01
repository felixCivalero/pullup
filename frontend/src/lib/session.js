// frontend/src/lib/session.js
//
// Synchronous "is there a stored session?" peek, read straight from
// localStorage BEFORE React paints. Used by the public landing/login
// shell to redirect returning users to /room on the first frame — so
// they never see the marketing/login UI flash in and then jump away
// once AuthContext finishes its async getSession() round-trip.
//
// This is a fast-path hint, not the source of truth. AuthContext +
// ProtectedLayout still own real auth: if the stored token turns out to
// be unusable, the normal guard takes over. Because the Supabase client
// is configured with autoRefreshToken, a present (even if expired)
// access/refresh token means the user is almost certainly still signed
// in, so we gate on presence rather than expiry.

// supabase-js v2 persists the session under `sb-<project-ref>-auth-token`.
// We match by pattern rather than hardcoding the ref so this keeps working
// if the project URL ever changes.
const SB_TOKEN_KEY = /^sb-.*-auth-token$/;

export function hasStoredSession() {
  try {
    // Mid-OAuth round-trip: tokens are in the URL and AuthContext is about
    // to process them. Don't gate — let the normal flow resolve the session.
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    if (
      hash.includes("access_token") ||
      hash.includes("refresh_token") ||
      search.includes("code=")
    ) {
      return false;
    }

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !SB_TOKEN_KEY.test(key)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Token blob present but unparseable — assume signed in; AuthContext
        // will correct us if it's truly junk.
        return true;
      }
      if (parsed?.access_token || parsed?.refresh_token || parsed?.currentSession) {
        return true;
      }
    }
    return false;
  } catch {
    // localStorage unavailable (privacy mode, etc.) — fail open to the
    // public page rather than trapping the user.
    return false;
  }
}
