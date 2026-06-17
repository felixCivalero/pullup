// frontend/src/lib/api.js
// Helper functions for authenticated API calls

import { supabase } from "./supabase.js";
import { API_BASE } from "./env.js";
import { fetchWithSessionRecovery } from "./authFetchCore.mjs";

// Admin "View as" — when an admin has an active view-as, every request carries
// these headers so the backend (after re-verifying admin) resolves as that user
// / forces that status. Empty for everyone else, so normal traffic is untouched.
export function viewAsHeaders() {
  const h = {};
  try {
    const va = localStorage.getItem("pullup_view_as");
    const fl = localStorage.getItem("pullup_force_level");
    if (va) h["x-pullup-view-as"] = va;
    if (fl) h["x-pullup-force-level"] = fl;
  } catch {}
  return h;
}
function viewAsActive() {
  try {
    return !!(localStorage.getItem("pullup_view_as") || localStorage.getItem("pullup_force_level"));
  } catch { return false; }
}

// A 401 means the stored session is already dead server-side, so there's
// nothing to revoke globally — we only need to drop it locally so React
// re-routes to the login gate. We dedupe concurrent sign-outs: when a page
// fires several authenticated calls at once (chrome + content), they'd each
// 401 and each kick off its own signOut, producing a storm of doomed
// logout round-trips. One shared local sign-out covers them all.
let pendingSignOut = null;
function clearDeadSession() {
  if (!pendingSignOut) {
    // scope:'local' clears localStorage without POSTing to the logout
    // endpoint with the already-invalid token (which returns 403).
    pendingSignOut = supabase.auth
      .signOut({ scope: "local" })
      .catch(() => {})
      .finally(() => {
        pendingSignOut = null;
      });
  }
  return pendingSignOut;
}

/**
 * Make an authenticated API request
 * Automatically adds Authorization header with JWT token
 */
export async function authenticatedFetch(url, options = {}) {
  // Perform the request with the given access token. Rebuilt per attempt so a
  // refreshed token (and current view-as headers) are picked up on retry.
  const doFetch = (accessToken) => {
    const headers = {
      "Content-Type": "application/json",
      ...viewAsHeaders(),
      ...options.headers,
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    return fetch(`${API_BASE}${url}`, { ...options, headers });
  };

  // A 401 no longer means "session is dead." A momentary network blip during
  // token rotation makes getSession() return null while the refresh token is
  // still valid — the old code wiped that session and logged the user out
  // (rampant on mobile / in-app browsers). fetchWithSessionRecovery refreshes
  // once and retries before giving up, and only clears the session when the
  // refresh itself genuinely fails (revoked/expired refresh token).
  //
  // On a truly dead session we clear LOCALLY (scope:'local') — the stored token
  // is already invalid server-side, so there's nothing to revoke remotely, and
  // we avoid the 403-logout storm a global signOut with a dead token caused.
  // React then routes back to "/" via ProtectedLayout's auth guard (no
  // hard-redirect — that ping-ponged with LandingPage's auto-redirect to /room
  // when best-effort background calls flapped).
  return fetchWithSessionRecovery({
    auth: {
      getSession: () => supabase.auth.getSession(),
      refreshSession: () => supabase.auth.refreshSession(),
    },
    doFetch,
    onDeadSession: clearDeadSession,
  });
}

/**
 * Make a public API request (no auth required)
 */
export async function publicFetch(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // When an admin is viewing-as, even "public" room calls must carry the admin
  // token + the view-as headers so the backend can resolve/act as the chosen
  // user. Normal (no view-as) traffic stays purely public — unchanged.
  if (viewAsActive()) {
    Object.assign(headers, viewAsHeaders());
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    } catch {}
  }

  return fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });
}

export { API_BASE };
