// backend/src/services/byo/provisioner.js
//
// BYO increment 2b: stand up the owned schema inside a creator's project.
// Control-plane work (DDL) → the Management API, never the service key.
//
// The owned schema is DERIVED from the live central catalog at provision time
// (pullup_owned_schema_ddl(), mig 087) — one source of truth, no static
// snapshot to drift. We fetch that DDL and run it on the creator's project.
// schema_version is stamped so a future fleet migrator knows each project's
// level.

import { supabase } from "../../supabase.js";
import { decryptSecret } from "../../utils/encryption.js";
import { runProjectSql } from "./managementApi.js";
import {
  getCreatorDatabaseWithKey,
  setCreatorDatabaseStatus,
} from "../../repos/creatorDatabases.js";

// Bump when the owned schema changes — stamped per project on (re)provision /
// sync. The DDL (mig 107) is self-evolving (CREATE IF NOT EXISTS + ALTER ADD
// COLUMN IF NOT EXISTS), so the daily schema-sync re-applies it and new
// tables/columns propagate to every connected project automatically.
export const OWNED_SCHEMA_VERSION = 107;

// A freshly-created Supabase project can reset the Management API connection
// while it's still warming up — the DDL comes back as "...read ECONNRESET"
// (often wrapped in a 400) or a transient 5xx. Retry with backoff so the
// keyless flow self-heals instead of dead-ending on a cold start.
function isTransientMgmtError(msg = "") {
  return /ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed|network|mgmt_api_5\d\d|mgmt_api_429/i.test(String(msg));
}
async function runProjectSqlWithRetry(projectRef, token, sql, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await runProjectSql(projectRef, token, sql);
    } catch (e) {
      lastErr = e;
      if (!isTransientMgmtError(e?.message) || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (i + 1))); // 2.5s,5s,7.5s,10s
    }
  }
  throw lastErr;
}

// The owned-schema DDL, generated fresh from PullUp's central schema.
export async function getOwnedSchemaDdl() {
  const { data, error } = await supabase.rpc("pullup_owned_schema_ddl");
  if (error) throw new Error(`owned_schema_ddl_failed: ${error.message}`);
  if (!data || typeof data !== "string") throw new Error("owned_schema_ddl_empty");
  return data;
}

// Provision (or re-provision — the DDL is CREATE TABLE IF NOT EXISTS, so it's
// idempotent) the owned schema into the creator's project via the Management
// API. Requires a stored mgmt token + project ref (the control-plane creds).
export async function provisionOwnedProject(hostId) {
  const row = await getCreatorDatabaseWithKey(hostId);
  if (!row || row.status === "revoked") return { ok: false, reason: "not_connected" };
  if (!row.project_ref) return { ok: false, reason: "no_project_ref" };
  if (!row.encrypted_mgmt_token) return { ok: false, reason: "no_mgmt_token" };

  let mgmtToken;
  try {
    mgmtToken = decryptSecret(row.encrypted_mgmt_token);
  } catch {
    return { ok: false, reason: "mgmt_token_unreadable" };
  }

  await setCreatorDatabaseStatus(hostId, "provisioning").catch(() => {});
  try {
    const ddl = await getOwnedSchemaDdl();
    await runProjectSqlWithRetry(row.project_ref, mgmtToken, ddl);
    // schema stood up, no data yet — back to 'connected' with the version set;
    // the mirror moves it to 'live'.
    await setCreatorDatabaseStatus(hostId, "connected", {
      schema_version: OWNED_SCHEMA_VERSION,
      last_error: null,
      last_verified_at: new Date().toISOString(),
    });
    return { ok: true, schemaVersion: OWNED_SCHEMA_VERSION };
  } catch (e) {
    await setCreatorDatabaseStatus(hostId, "error", { last_error: e.message }).catch(() => {});
    return { ok: false, reason: e.message };
  }
}

// Re-apply the CURRENT owned schema to an already-connected project — the
// additive sync (new tables + new columns via the ALTER ADD COLUMN IF NOT
// EXISTS the DDL now emits). Unlike provision, it PRESERVES the project's
// status (a 'live' project stays live) and never downgrades to 'error' on a
// transient hiccup — it just records last_error for the next tick to retry.
// The daily schema-sync job calls this for every connected creator so PullUp
// schema changes propagate automatically.
export async function syncOwnedSchema(hostId) {
  const row = await getCreatorDatabaseWithKey(hostId);
  if (!row || row.status === "revoked") return { ok: false, reason: "not_connected" };
  if (!row.project_ref || !row.encrypted_mgmt_token) return { ok: false, reason: "no_creds" };

  let mgmtToken;
  try {
    mgmtToken = decryptSecret(row.encrypted_mgmt_token);
  } catch {
    return { ok: false, reason: "mgmt_token_unreadable" };
  }

  try {
    const ddl = await getOwnedSchemaDdl();
    await runProjectSqlWithRetry(row.project_ref, mgmtToken, ddl);
    await setCreatorDatabaseStatus(hostId, row.status, {
      schema_version: OWNED_SCHEMA_VERSION,
      last_error: null,
      last_verified_at: new Date().toISOString(),
    });
    return { ok: true, schemaVersion: OWNED_SCHEMA_VERSION };
  } catch (e) {
    await setCreatorDatabaseStatus(hostId, row.status, { last_error: e.message }).catch(() => {});
    return { ok: false, reason: e.message };
  }
}
