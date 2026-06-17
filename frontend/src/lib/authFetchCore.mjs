// Pure, dependency-injected core of authenticatedFetch's session-resilience
// logic, kept separate from the Supabase client so it can be unit-tested
// without a browser/env (see authFetchCore.test.mjs). api.js wires the real
// supabase + fetch into this.
//
// WHY THIS EXISTS — the "logged out very often" bug:
// supabase-js getSession() refreshes an expired access token for us, but if
// that refresh hits a transient network error it returns { session: null }
// WITHOUT clearing the (still-valid) refresh token from storage. The old code
// then sent no Authorization header, got a 401, and treated it as a dead
// session — logging the user out on a momentary network blip. Mobile / in-app
// browsers (Instagram/WhatsApp WebViews) hit this constantly.
//
// The fix: a 401 is no longer trusted as "session is dead." We try one explicit
// refresh + retry first, and only clear the session if THAT also fails.
//
//   auth.getSession()     -> { data: { session } }
//   auth.refreshSession() -> { data: { session }, error }
//   doFetch(accessToken)  -> Response   (performs the actual request)
//   onDeadSession()       -> clears local session state (only when truly dead)
export async function fetchWithSessionRecovery({ auth, doFetch, onDeadSession }) {
  const initial = await auth.getSession();
  let token = initial?.data?.session?.access_token ?? null;

  // No token in storage can mean a transient refresh failure rather than a
  // genuinely absent session. Try once to recover before sending tokenless.
  if (!token) {
    const refreshed = await auth.refreshSession();
    token = refreshed?.data?.session?.access_token ?? null;
  }

  let response = await doFetch(token);
  if (response.status !== 401) return response;

  // A 401 can be a refresh race / clock skew, not a revoked session. Refresh
  // once and retry before giving up.
  const retry = await auth.refreshSession();
  const retryToken = retry?.data?.session?.access_token ?? null;
  if (retryToken) {
    response = await doFetch(retryToken);
    if (response.status !== 401) return response;
  }

  // Genuinely unrecoverable — now (and only now) drop the local session.
  await onDeadSession();
  const err = new Error("Unauthorized - please sign in");
  err.status = 401;
  throw err;
}
