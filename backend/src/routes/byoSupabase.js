// backend/src/routes/byoSupabase.js
//
// "Own your data" — the host-facing connection surface for BYO Supabase.
// Increment 1 ships the SPINE: connect (paste fallback), status, disconnect
// (kill switch). Provisioning the schema + mirroring the data + cutover are
// later increments; the OAuth connect flow is a later nicety on top of this.
//
// Every endpoint is inert until BYO_SUPABASE_ENABLED flips (503 otherwise), so
// merging changes nothing in prod.

import { requireAuth } from "../middleware/auth.js";
import { byoEnabled } from "../config/byo.js";
import { hasEncryptionKey } from "../utils/encryption.js";
import {
  getCreatorDatabase,
  connectCreatorDatabase,
  disconnectCreatorDatabase,
} from "../repos/creatorDatabases.js";
import { invalidateHost } from "../db/router.js";
import { mirrorHostData, verifyMirror } from "../services/byo/mirror.js";

// Reachability + auth probe for a creator's project, using ONLY the data-plane
// service key (no management token needed): hit the PostgREST root with the
// key. 200/2xx ⇒ the URL resolves and the key authenticates (the project may
// still be schema-empty — that's fine, provisioning is a later step). 401/403
// ⇒ bad key. Anything else ⇒ unreachable.
async function validateConnection(dbUrl, serviceKey) {
  try {
    const base = String(dbUrl).replace(/\/$/, "");
    const res = await fetch(`${base}/rest/v1/`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: "bad_key" };
    if (res.status >= 200 && res.status < 500) return { ok: true };
    return { ok: false, reason: `unreachable_${res.status}` };
  } catch (e) {
    return { ok: false, reason: `unreachable: ${e?.message || "network"}` };
  }
}

export function registerByoSupabaseRoutes(app) {
  // Where does this host's data live, and what's the connection state?
  app.get("/host/byo/status", requireAuth, async (req, res) => {
    if (!byoEnabled()) return res.json({ enabled: false, connected: false });
    try {
      const db = await getCreatorDatabase(req.user.id);
      return res.json({
        enabled: true,
        encryptionReady: hasEncryptionKey(),
        connected: !!db && db.status !== "revoked",
        db, // sanitized — never carries the key
      });
    } catch (e) {
      console.error("[byo] status failed:", e?.message);
      return res.status(500).json({ error: "byo_status_failed" });
    }
  });

  // Connect a creator's own Supabase project (paste fallback: project ref +
  // service key + project URL). Validates connectivity+auth, then stores the
  // key ENCRYPTED. The OAuth flow will later replace the paste but lands in the
  // same row.
  app.post("/host/byo/connect", requireAuth, async (req, res) => {
    if (!byoEnabled()) return res.status(503).json({ error: "byo_disabled" });
    if (!hasEncryptionKey()) {
      // Never store a service key in plaintext.
      return res.status(503).json({ error: "encryption_unconfigured" });
    }
    const { projectRef = null, dbUrl, serviceKey, mgmtToken = null } = req.body || {};
    if (!dbUrl || !serviceKey) {
      return res.status(400).json({ error: "missing_fields", message: "dbUrl and serviceKey are required" });
    }

    const probe = await validateConnection(dbUrl, serviceKey);
    if (!probe.ok) {
      return res.status(400).json({ error: "connection_failed", reason: probe.reason });
    }

    const result = await connectCreatorDatabase({
      hostId: req.user.id,
      projectRef,
      dbUrl,
      serviceKey,
      mgmtToken, // optional control-plane token (provisioning + tier reads)
    });
    if (result.error) {
      return res.status(500).json({ error: "connect_failed", message: result.error });
    }
    invalidateHost(req.user.id);
    // Next steps live behind their own increments; the UI reads `nextStep`.
    return res.json({ ...result, nextStep: "provision" });
  });

  // Stage-2 mirror: copy the host's relational slice into their own project.
  // Idempotent (upsert by id) — safe to re-run to keep the mirror fresh. The
  // target must already have the schema (provisioning, increment 2b).
  app.post("/host/byo/mirror", requireAuth, async (req, res) => {
    if (!byoEnabled()) return res.status(503).json({ error: "byo_disabled" });
    try {
      const result = await mirrorHostData(req.user.id);
      if (!result.ok) return res.status(409).json({ error: "mirror_failed", reason: result.reason });
      return res.json(result);
    } catch (e) {
      console.error("[byo] mirror failed:", e?.message);
      return res.status(500).json({ error: "mirror_failed" });
    }
  });

  // Integrity check: per-table row counts shared vs owned. The gate before any
  // cutover (increment 3).
  app.get("/host/byo/verify", requireAuth, async (req, res) => {
    if (!byoEnabled()) return res.status(503).json({ error: "byo_disabled" });
    try {
      const result = await verifyMirror(req.user.id);
      return res.json(result);
    } catch (e) {
      console.error("[byo] verify failed:", e?.message);
      return res.status(500).json({ error: "verify_failed" });
    }
  });

  // The kill switch (PullUp side). The creator can also rotate/revoke the key
  // in their own Supabase dashboard — either way the router falls back to the
  // shared DB. We revoke + drop the stored key here.
  app.post("/host/byo/disconnect", requireAuth, async (req, res) => {
    if (!byoEnabled()) return res.status(503).json({ error: "byo_disabled" });
    try {
      const result = await disconnectCreatorDatabase(req.user.id);
      invalidateHost(req.user.id);
      if (result.error) return res.status(500).json({ error: "disconnect_failed" });
      return res.json({ ok: true });
    } catch (e) {
      console.error("[byo] disconnect failed:", e?.message);
      return res.status(500).json({ error: "disconnect_failed" });
    }
  });
}
