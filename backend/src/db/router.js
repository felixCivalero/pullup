// backend/src/db/router.js
//
// THE CONNECTION ROUTER — the one brick the whole BYO-Supabase system hangs
// off. It answers a single question: for THIS host, which database do reads
// and writes go to?
//
//   • BYO off, or host hasn't graduated  → the shared PullUp client (today:
//                                           everyone).
//   • host graduated (status 'live' AND system_of_record true) → a client
//     pointed at THEIR own Supabase project, built from their decrypted key.
//
// This is what lets PullUp run with a creator's data living in a different
// database without rewriting all 10 repos: a call site that should respect
// ownership asks the router for a client instead of importing the global one.
// Until a host is cut over (system_of_record=true), the router returns the
// shared client, so prod behaves exactly as today — the machinery is here and
// inert.
//
// The registry itself (creator_databases) ALWAYS lives in the shared central
// DB — it's the routing table, so it can't be federated.

import { createClient } from "@supabase/supabase-js";
import { supabase } from "../supabase.js";
import { decryptSecret } from "../utils/encryption.js";
import { byoEnabled } from "../config/byo.js";
import { getCreatorDatabaseWithKey } from "../repos/creatorDatabases.js";

// Per-host client cache. Building a client + decrypting a key on every request
// would be wasteful; we cache with a short TTL so a revoke / cutover propagates
// within the window even across PM2 workers (each holds its own cache). The
// connect/disconnect endpoints also clear the entry in-process for instant
// effect on the worker that handled the change.
const CACHE_TTL_MS = 60_000;
const cache = new Map(); // hostId -> { client, isOwned, at }

function buildOwnedClient(row) {
  const key = decryptSecret(row.encrypted_service_key);
  if (!key) throw new Error("no_key");
  return createClient(row.db_url, key, {
    auth: { persistSession: false },
  });
}

// The router. Always resolves to *a* usable client — never throws, never
// blocks a request: if an owned client can't be built (revoked key, bad row),
// it falls back to the shared client and logs. Safe because until cutover the
// shared DB is still the system of record.
export async function getClientForHost(hostId) {
  if (!byoEnabled() || !hostId) return supabase;

  const hit = cache.get(hostId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.client;

  let client = supabase;
  try {
    const row = await getCreatorDatabaseWithKey(hostId);
    if (row && row.status === "live" && row.system_of_record) {
      try {
        client = buildOwnedClient(row);
      } catch (e) {
        console.error(
          "[byo] owned client build failed — falling back to shared:",
          e?.message
        );
        client = supabase;
      }
    }
  } catch (e) {
    // A registry read failure must never take down a request — serve shared.
    console.error("[byo] router registry read failed — serving shared:", e?.message);
    client = supabase;
  }

  cache.set(hostId, { client, isOwned: client !== supabase, at: Date.now() });
  return client;
}

// The owned client REGARDLESS of cutover — used by the stage-2 mirror to write
// into a creator's project while the shared DB is still authoritative. Returns
// null if there's no usable owned connection (so callers no-op cleanly).
export async function getMirrorClientForHost(hostId) {
  if (!hostId) return null;
  try {
    const row = await getCreatorDatabaseWithKey(hostId);
    if (!row || row.status === "revoked" || !row.encrypted_service_key) return null;
    return buildOwnedClient(row);
  } catch (e) {
    console.error("[byo] mirror client build failed:", e?.message);
    return null;
  }
}

// Clear a host's cached client — called by connect/disconnect so a change
// takes effect immediately on this worker (other workers expire within TTL).
export function invalidateHost(hostId) {
  if (hostId) cache.delete(hostId);
}

// Test/introspection helper: is this client the shared central one?
export function isSharedClient(client) {
  return client === supabase;
}
