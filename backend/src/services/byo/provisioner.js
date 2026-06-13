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

// Bump when the owned schema (the 8 tables / mig 087) changes — the signal the
// fleet migrator keys off per project.
export const OWNED_SCHEMA_VERSION = 87;

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
    await runProjectSql(row.project_ref, mgmtToken, ddl);
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
