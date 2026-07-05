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
import { byoEnabledForHost, byoOauthConfigured } from "../config/byo.js";
import { hasEncryptionKey } from "../utils/encryption.js";
import {
  getCreatorDatabase,
  getCreatorDatabaseWithKey,
  connectCreatorDatabase,
  disconnectCreatorDatabase,
} from "../repos/creatorDatabases.js";
import { invalidateHost } from "../db/router.js";
import { mirrorHostData, verifyMirror } from "../services/byo/mirror.js";
import { provisionOwnedProject, ensureProjectAwake } from "../services/byo/provisioner.js";
import { getProjectUsage } from "../services/byo/projectUsage.js";

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
    if (!byoEnabledForHost(req.user.id)) return res.json({ enabled: false, connected: false });
    try {
      const db = await getCreatorDatabase(req.user.id);
      return res.json({
        enabled: true,
        encryptionReady: hasEncryptionKey(),
        oauthAvailable: byoOauthConfigured(),
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
    if (!byoEnabledForHost(req.user.id)) return res.status(503).json({ error: "byo_disabled" });
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

  // Provision the owned schema into the creator's project (control plane /
  // Management API). Idempotent (CREATE TABLE IF NOT EXISTS). Needs the mgmt
  // token + project ref from connect. The prerequisite for the mirror.
  app.post("/host/byo/provision", requireAuth, async (req, res) => {
    if (!byoEnabledForHost(req.user.id)) return res.status(503).json({ error: "byo_disabled" });
    try {
      const result = await provisionOwnedProject(req.user.id);
      // A paused (free-tier) project is being woken — the client shows
      // "waking your database…" and retries; 202 = accepted, not failed.
      if (!result.ok && result.reason === "project_waking") {
        return res.status(202).json({ ok: false, reason: "project_waking" });
      }
      if (!result.ok) return res.status(409).json({ error: "provision_failed", reason: result.reason });
      return res.json(result);
    } catch (e) {
      console.error("[byo] provision failed:", e?.message);
      return res.status(500).json({ error: "provision_failed" });
    }
  });

  // Stage-2 mirror: copy the host's relational slice into their own project.
  // Idempotent (upsert by id) — safe to re-run to keep the mirror fresh. The
  // target must already have the schema (provisioning, increment 2b).
  app.post("/host/byo/mirror", requireAuth, async (req, res) => {
    if (!byoEnabledForHost(req.user.id)) return res.status(503).json({ error: "byo_disabled" });
    try {
      // Same wake pre-flight as provision: the mirror rides the data plane,
      // which times out identically against a napping free-tier project.
      const wake = await ensureProjectAwake(req.user.id);
      if (!wake.awake) return res.status(202).json({ ok: false, reason: "project_waking" });
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
    if (!byoEnabledForHost(req.user.id)) return res.status(503).json({ error: "byo_disabled" });
    try {
      const result = await verifyMirror(req.user.id);
      return res.json(result);
    } catch (e) {
      console.error("[byo] verify failed:", e?.message);
      return res.status(500).json({ error: "verify_failed" });
    }
  });

  // Real usage from the creator's OWN project, read live from its Metrics API
  // — shown against Supabase's own tier ladder in the Own-your-data panel.
  // Purely informational: PullUp never bills on storage; the number exists so
  // the creator can see where they sit on SUPABASE's pricing (free 500 MB →
  // Pro $25/mo). Best-effort: usage null just means "unavailable right now".
  app.get("/host/byo/usage", requireAuth, async (req, res) => {
    if (!byoEnabledForHost(req.user.id)) return res.status(503).json({ error: "byo_disabled" });
    try {
      const row = await getCreatorDatabaseWithKey(req.user.id);
      if (!row?.projectRef || !row?.serviceKey) return res.json({ connected: false, usage: null });
      const usage = await getProjectUsage(row.projectRef, row.serviceKey);
      return res.json({
        connected: true,
        usage: usage ? { dbBytes: usage.dbBytes } : null,
      });
    } catch (e) {
      console.error("[byo] usage read failed:", e?.message);
      return res.json({ connected: true, usage: null });
    }
  });

  // The kill switch (PullUp side). The creator can also rotate/revoke the key
  // in their own Supabase dashboard — either way the router falls back to the
  // shared DB. We revoke + drop the stored key here.
  app.post("/host/byo/disconnect", requireAuth, async (req, res) => {
    if (!byoEnabledForHost(req.user.id)) return res.status(503).json({ error: "byo_disabled" });
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
