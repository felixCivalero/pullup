// frontend/src/lib/supabase.js
// Supabase client for frontend (uses anon key)
// Same keys for dev (localhost) and prod (pullup.se). Redirect is based on window.location.origin.

import { createClient, navigatorLock } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. " +
      "Check your .env or .env.development file."
  );
}

// The auth calls share one lock across every tab of the site, and supabase-js
// waits for it forever by default. A background tab Chrome had frozen while it
// held the lock left /admin white in the other tab: getSession() never
// returned. Wait at most 2 s, then go ahead without it (one account; the worst
// case is two tabs refreshing the token at once, which Supabase tolerates).
async function authLock(name, acquireTimeout, fn) {
  if (!globalThis.navigator?.locks) return fn();
  try {
    return await navigatorLock(name, acquireTimeout < 0 ? 2000 : acquireTimeout, fn);
  } catch (err) {
    // A timed-out wait surfaces as the browser's AbortError.
    if (acquireTimeout < 0 && (err?.isAcquireTimeout || err?.name === "AbortError")) return fn();
    throw err;
  }
}

// Create Supabase client with auth enabled
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: authLock,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // For OAuth redirects
  },
});
