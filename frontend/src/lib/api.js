// frontend/src/lib/api.js
// Helper functions for authenticated API calls

import { supabase } from "./supabase.js";

// API base URL:
// - Prefer VITE_API_URL when set (for staging/custom domains)
// - Otherwise:
//   - Dev: talk directly to backend on localhost:3001
//   - Prod: use /api on the same origin (fronted by a proxy)
const API_BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : "/api");

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

  // Handle 401 Unauthorized - redirect to login
  if (response.status === 401) {
    // Clear session and redirect
    await supabase.auth.signOut();
    window.location.href = "/";
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

  return fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });
}

export { API_BASE };
