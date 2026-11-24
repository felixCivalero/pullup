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

// The login mail's link and its code are the same one-time token, so a link
// that was already used (or the code typed instead) comes back to /admin as
// #error=…&error_description=…. On that URL supabase-js deletes whatever
// session the browser already has — the signed-in default browser, where mail
// links open, ended up on /login every time. Take the error off the URL before
// the client reads it; a signed-in browser stays signed in, and /login says
// the link was spent.
function takeAuthLinkError() {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const from = hash.has("error_description") ? hash : url.searchParams.has("error_description") ? url.searchParams : null;
  if (!from || hash.has("access_token")) return null;
  const message = from.get("error_description");
  ["error", "error_code", "error_description", "sb"].forEach((k) => from.delete(k));
  if (from === hash) url.hash = hash.toString();
  window.history.replaceState(window.history.state, "", url.pathname + url.search + (url.hash.length > 1 ? url.hash : ""));
  return message;
}

export const authLinkError = takeAuthLinkError();

// Browsers that used the old PullUp app still carry its sign-in: the old app
// signed in every guest who RSVP'd, and its sessions never expire on their
// own. Under the same storage key this site picked that session up, so /login
// skipped the form and landed the person in /admin as whoever that browser
// last was (a guest account, another email) — only a private window let them
// sign in as themselves. Sessions signed in before the browser-bound sign-in
// went live (2026-10-26) are the old app's: drop them here, before the client
// reads storage, together with the old app's own pullup_* keys. Runs once per
// load; costs nothing once a browser is clean.
const NEW_LOGIN_SINCE = Date.parse("2026-10-26T07:00:00Z") / 1000;

function signedInAt(accessToken) {
  try {
    const part = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=")));
    const times = (claims.amr || []).map((a) => Number(a.timestamp)).filter(Boolean);
    return times.length ? Math.min(...times) : null;
  } catch {
    return null;
  }
}

export function clearOldAppSignIn(storage = globalThis.localStorage, url = supabaseUrl) {
  if (!storage) return false;
  try {
    for (const k of Object.keys(storage)) if (k.startsWith("pullup_")) storage.removeItem(k);
    const key = `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
    const raw = storage.getItem(key);
    if (!raw) return false;
    const stored = JSON.parse(raw);
    const at = signedInAt(stored?.access_token || stored?.currentSession?.access_token || "");
    if (at !== null && at >= NEW_LOGIN_SINCE) return false;
    storage.removeItem(key);
    storage.removeItem(`${key}-code-verifier`);
    return true;
  } catch {
    return false; // storage blocked or unreadable — nothing to clean
  }
}

clearOldAppSignIn();

// Create Supabase client with auth enabled. Sign-in itself goes through our
// own browser-bound flow (lib/deviceLogin.js); PKCE is set so that any link
// Supabase itself ever mails can only be redeemed by the browser that asked.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    lock: authLock,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: "pkce",
  },
});
