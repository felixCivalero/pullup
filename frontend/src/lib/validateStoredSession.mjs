// Pure, dependency-injected validation of a stored session for the LandingPage
// login-view check (see validateStoredSession.test.mjs). Kept out of the React
// component + Supabase client so it can be unit-tested.
//
// Same fragility as authFetchCore.mjs: getUser() can return a 401/403 because a
// transient refresh failure left it sending an expired token, even though the
// refresh token in storage is still valid. So we don't trust a single 401 —
// we try one explicit refresh before declaring the session dead.
//
//   auth.getSession()     -> { data: { session } }
//   auth.getUser()        -> { data: { user }, error }   (server round-trip)
//   auth.refreshSession() -> { data: { session }, error }
//
// Returns { status }:
//   "none"    — no stored session (show login form, nothing to clear)
//   "valid"   — session is good server-side (forward into the app)
//   "dead"    — genuinely revoked/expired (caller should local-signOut)
//   "unknown" — a non-auth error (network blip); leave the session alone
export async function resolveStoredSession({ auth }) {
  const {
    data: { session },
  } = await auth.getSession();
  if (!session) return { status: "none" };

  const { data, error } = await auth.getUser();
  if (data?.user) return { status: "valid" };

  // getUser failed. Only an explicit auth rejection is a candidate for "dead";
  // anything else (no status — e.g. network failure) must not touch the session.
  if (error && (error.status === 401 || error.status === 403)) {
    const { data: refreshed, error: refreshErr } = await auth.refreshSession();
    if (!refreshErr && refreshed?.session) return { status: "valid" };
    return { status: "dead" };
  }

  return { status: "unknown" };
}
