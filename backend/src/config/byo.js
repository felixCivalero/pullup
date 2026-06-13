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
