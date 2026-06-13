// backend/src/config/byo.js
//
// The BYO-Supabase switchboard. Defaults OFF, so merging the whole ownership
// system changes nothing in prod until the env flips.
//
//   BYO_SUPABASE_ENABLED — turns on the connection router's per-host routing
//                          and the /host/byo/* endpoints. Off → getClientForHost
//                          always returns the shared client and the endpoints
//                          503, i.e. PullUp behaves exactly as today.
//
// Note: encrypted key storage relies on APP_ENCRYPTION_KEY (utils/encryption.js,
// already set in prod for IG tokens). We refuse to store a service key without
// it — never plaintext.

function bool(v) {
  return v === true || v === "true" || v === "1" || v === "yes";
}

export function byoEnabled() {
  return bool(process.env.BYO_SUPABASE_ENABLED);
}

// The keyless "Connect with Supabase" OAuth path is available only once PullUp
// is registered as a Supabase OAuth app (a one-time company setup). Until these
// are set, the UI leads with the paste-a-key flow. (OAuth route impl is the
// next increment; this gate lets the frontend forward-detect it.)
export function byoOauthConfigured() {
  return !!(
    process.env.SUPABASE_OAUTH_CLIENT_ID &&
    process.env.SUPABASE_OAUTH_CLIENT_SECRET &&
    process.env.SUPABASE_OAUTH_REDIRECT_URI
  );
}
