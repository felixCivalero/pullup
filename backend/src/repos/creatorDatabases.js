// backend/src/repos/creatorDatabases.js
//
// The routing registry: one row per creator who connected their own Supabase.
// Lives in PullUp's CENTRAL DB (it's the table the router reads to decide where
// every other read/write goes). The service key is encrypted on the way in and
// NEVER returned by the sanitized reads — only the router decrypts it, only to
// build a client.

import { supabase } from "../supabase.js";
import { encryptSecret } from "../utils/encryption.js";

// Public-safe shape — deliberately omits encrypted_service_key so a key can
// never leak through an API response or a log line.
function mapSafe(row) {
  if (!row) return null;
  return {
    hostId: row.host_id,
    provider: row.provider,
    projectRef: row.project_ref,
    dbUrl: row.db_url,
    status: row.status,
    schemaVersion: row.schema_version,
    systemOfRecord: row.system_of_record,
    connectedAt: row.connected_at,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
    updatedAt: row.updated_at,
  };
}

// Sanitized read (no key) — for the status endpoint and the host UI.
export async function getCreatorDatabase(hostId) {
  if (!hostId) return null;
  const { data } = await supabase
    .from("creator_databases")
    .select("*")
    .eq("host_id", hostId)
    .maybeSingle();
  return mapSafe(data);
}

// Internal read INCLUDING the encrypted key — only the router calls this, only
// to build an owned client. Kept separate from the sanitized read so the key
// never travels by accident.
export async function getCreatorDatabaseWithKey(hostId) {
  if (!hostId) return null;
  const { data } = await supabase
    .from("creator_databases")
    .select("*")
    .eq("host_id", hostId)
    .maybeSingle();
  return data || null;
}

// Connect (or re-connect) a creator's project. Encrypts the service key before
// it touches the table; refuses to proceed if APP_ENCRYPTION_KEY is unset
// (encryptSecret throws rather than store plaintext). Starts at 'connected' —
// provisioning/mirroring/cutover are later, deliberate steps.
export async function connectCreatorDatabase({ hostId, projectRef, dbUrl, serviceKey, mgmtToken = null }) {
  if (!hostId || !dbUrl || !serviceKey) {
    return { error: "missing_fields" };
  }
  const encrypted_service_key = encryptSecret(serviceKey);
  // The Management API token (control plane: provisioning + tier reads) is
  // optional at connect — a host who only mirrors needn't provide one.
  const encrypted_mgmt_token = mgmtToken ? encryptSecret(mgmtToken) : null;
  const { data, error } = await supabase
    .from("creator_databases")
    .upsert(
      {
        host_id: hostId,
        provider: "supabase",
        project_ref: projectRef || null,
        db_url: dbUrl,
        encrypted_service_key,
        ...(encrypted_mgmt_token ? { encrypted_mgmt_token } : {}),
        status: "connected",
        // re-connecting resets the cutover bit — a fresh key never silently
        // re-points the system of record.
        system_of_record: false,
        last_error: null,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "host_id" }
    )
    .select("*")
    .single();
  if (error) return { error: error.message };
  return { db: mapSafe(data) };
}

export async function setCreatorDatabaseStatus(hostId, status, extra = {}) {
  const patch = { status, updated_at: new Date().toISOString(), ...extra };
  const { data, error } = await supabase
    .from("creator_databases")
    .update(patch)
    .eq("host_id", hostId)
    .select("*")
    .maybeSingle();
  if (error) return { error: error.message };
  return { db: mapSafe(data) };
}

// The kill switch (PullUp side): mark revoked. The router falls back to the
// shared DB on the next lookup. We KEEP the row (history + the chance to
// re-connect) but null the key so a revoked project holds no usable secret.
export async function disconnectCreatorDatabase(hostId) {
  const { error } = await supabase
    .from("creator_databases")
    .update({
      status: "revoked",
      system_of_record: false,
      encrypted_service_key: "",
      encrypted_mgmt_token: null,
      updated_at: new Date().toISOString(),
    })
    .eq("host_id", hostId);
  if (error) return { error: error.message };
  return { ok: true };
}
