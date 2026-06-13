// backend/src/services/byo/mirror.js
//
// Stage-2 DATA MIRROR: copy a creator's relational slice from PullUp's shared
// DB into THEIR own Supabase project. Runs on the DATA plane (the service key
// via getMirrorClientForHost), not the control plane — bulk row movement, not
// DDL. Idempotent: upsert by primary key, so re-running reconciles rather than
// duplicates (a mirror is kept fresh by re-running, and a half-finished run is
// safe to retry).
//
// Writes in FK-safe order (MIRROR_TABLES: parents first) so a fresh project
// fills cleanly. The target project must already have the schema (the
// provisioner's job) — the mirror assumes the tables exist.
//
// This NEVER touches the shared DB except to read; it only writes to the
// creator's project. While system_of_record is still false, the shared DB
// stays authoritative and this is purely additive replication.

import { gatherHostSlice, MIRROR_TABLES, sliceCounts } from "./hostSlice.js";
import { getMirrorClientForHost } from "../../db/router.js";
import { setCreatorDatabaseStatus } from "../../repos/creatorDatabases.js";

const UPSERT_CHUNK = 500;

async function upsertAll(client, table, rows) {
  if (!rows || rows.length === 0) return { table, written: 0, skipped: 0 };
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const batch = rows.slice(i, i + UPSERT_CHUNK);
    const { error } = await client.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      // Surface the first failing table loudly — a mirror that silently drops
      // rows is worse than one that stops and reports.
      throw new Error(`mirror_upsert_failed[${table}]: ${error.message}`);
    }
    written += batch.length;
  }
  return { table, written, skipped: 0 };
}

// Mirror one host's world into their own project. Returns per-table counts.
// hostId's owned connection must exist (status connected/live, not revoked) —
// otherwise there's nothing to mirror into.
export async function mirrorHostData(hostId) {
  const client = await getMirrorClientForHost(hostId);
  if (!client) return { ok: false, reason: "no_owned_connection" };

  await setCreatorDatabaseStatus(hostId, "mirroring").catch(() => {});

  try {
    const slice = await gatherHostSlice(hostId);
    const results = [];
    for (const table of MIRROR_TABLES) {
      results.push(await upsertAll(client, table, slice.tables[table]));
    }
    const counts = sliceCounts(slice);
    // Mirrored (not cut over): the project is populated but the shared DB is
    // still the system of record until a deliberate cutover.
    await setCreatorDatabaseStatus(hostId, "live", {
      last_verified_at: new Date().toISOString(),
      last_error: null,
    }).catch(() => {});
    return { ok: true, counts, results };
  } catch (e) {
    await setCreatorDatabaseStatus(hostId, "error", { last_error: e.message }).catch(() => {});
    return { ok: false, reason: e.message };
  }
}

// Verify a mirror by comparing row counts shared-side vs owned-side per table.
// The cheap integrity check before any cutover.
export async function verifyMirror(hostId) {
  const client = await getMirrorClientForHost(hostId);
  if (!client) return { ok: false, reason: "no_owned_connection" };
  const slice = await gatherHostSlice(hostId);
  const shared = sliceCounts(slice);
  const owned = {};
  for (const table of MIRROR_TABLES) {
    const { count } = await client.from(table).select("id", { count: "exact", head: true });
    owned[table] = count || 0;
  }
  const mismatches = MIRROR_TABLES.filter((t) => (owned[t] || 0) < (shared[t] || 0));
  return { ok: mismatches.length === 0, shared, owned, mismatches };
}
