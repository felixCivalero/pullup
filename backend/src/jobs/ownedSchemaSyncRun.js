// Keep every connected creator's owned Supabase in sync with PullUp's schema.
//
// Once a day, re-apply the CURRENT owned-schema DDL to each connected project.
// The DDL (mig 107) is self-evolving — CREATE TABLE IF NOT EXISTS + ALTER ADD
// COLUMN IF NOT EXISTS for every owned column — so a re-apply is a no-op on an
// up-to-date project and an ADDITIVE migration (new tables/columns) on one
// that's behind. So when PullUp adds a table or column centrally, it propagates
// to every creator's own database automatically within a day. Status-preserving
// (a 'live' project stays live) and best-effort per host.
//
// Self-gated: a no-op unless BYO_SUPABASE_ENABLED is on.

import { byoEnabled } from "../config/byo.js";
import { listConnectedCreatorHostIds } from "../repos/creatorDatabases.js";
import { syncOwnedSchema } from "../services/byo/provisioner.js";

export async function runOwnedSchemaSync() {
  if (!byoEnabled()) return { skipped: true, reason: "disabled" };

  let hostIds = [];
  try {
    hostIds = await listConnectedCreatorHostIds();
  } catch (e) {
    console.error("[schemaSync] could not list creators:", e?.message);
    return { ok: false, reason: "list_failed" };
  }

  let synced = 0;
  let failed = 0;
  for (const hostId of hostIds) {
    try {
      const r = await syncOwnedSchema(hostId);
      if (r?.ok) synced++;
      else failed++;
    } catch (e) {
      failed++;
      console.error(`[schemaSync] host ${hostId} failed (non-blocking):`, e?.message);
    }
  }
  return { ok: true, creators: hostIds.length, synced, failed };
}
