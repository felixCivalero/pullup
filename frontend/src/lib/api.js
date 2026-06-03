// frontend/src/lib/api.js
// Helper functions for authenticated API calls

import { supabase } from "./supabase.js";
import { API_BASE } from "./env.js";

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

/**
 * Make an authenticated API request
 * Automatically adds Authorization header with JWT token
 */
export async function authenticatedFetch(url, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const headers = {
    "Content-Type": "application/json",
    ...viewAsHeaders(),
    ...options.headers,
  };

  // Add auth token if available
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  // Handle 401 Unauthorized: clear the Supabase session and let React route
  // the user back to "/" via ProtectedLayout's auth guard. We deliberately do
  // NOT hard-redirect with window.location.href — that caused a ping-pong
  // loop with LandingPage's auto-redirect to /room when best-effort
  // background calls (e.g. /auth/record-consent on every mount) flapped.
  if (response.status === 401) {
    await supabase.auth.signOut();
    throw new Error("Unauthorized - please sign in");
  }

  return response;
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
