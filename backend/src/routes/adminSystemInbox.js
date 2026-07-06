// backend/src/routes/adminSystemInbox.js
//
// The operator seat of the system chat. Hosts talk to "PullUp" (the system
// person) in their Messages; admins answer here. Everything is internal
// database rows + Realtime — no email in the conversation.
//
//   GET   /admin/me                          — am I an admin? (any authed user)
//   GET   /admin/system-inbox                — threads across all hosts
//   GET   /admin/system-inbox/:hostId        — one thread, oldest → newest
//   POST  /admin/system-inbox/:hostId/message — reply as PullUp
//   GET   /admin/requests                    — early-access queue (IG + tiers)
//   PATCH /admin/requests/:kind/:hostId      — set status (onboarded/declined)
//   GET   /admin/admins                      — list admins        (super only)
//   POST  /admin/admins                      — grant @pullup.se   (super only)
//   DELETE /admin/admins/:email              — revoke             (super only)

import { requireAuth, requireAdmin, requireSuperAdmin } from "../middleware/auth.js";
import { supabase } from "../supabase.js";
import { getSystemPersonId } from "../repos/systemPerson.js";
import { logPersonEvent } from "../services/personTimeline.js";
import { getAdminByEmail } from "../repos/platformAdmins.js";

const MESSAGEY = new Set(["message_in", "message_out", "access_request"]);

// Resolve host display info in one batched read.
async function hostCards(hostIds) {
  if (!hostIds.length) return new Map();
  const { data } = await supabase
    .from("profiles")
    .select("id, name, brand, contact_email, profile_picture")
    .in("id", hostIds);
  const map = new Map();
  for (const p of data || []) {
    map.set(p.id, {
      name: p.name || p.brand || p.contact_email || "Unknown host",
      email: p.contact_email || null,
      avatarUrl: p.profile_picture || null,
    });
  }
  return map;
}

export function registerAdminSystemInboxRoutes(app) {
  // Cheap probe the frontend uses to route @pullup.se logins to the dashboard.
  app.get("/admin/me", requireAuth, async (req, res) => {
    try {
      const admin = await getAdminByEmail(req.user.email);
      res.json(admin ? { isAdmin: true, role: admin.role, scopes: admin.scopes, email: admin.email } : { isAdmin: false });
    } catch {
      res.json({ isAdmin: false });
    }
  });

  app.get("/admin/system-inbox", requireAdmin, async (req, res) => {
    try {
      const sysId = await getSystemPersonId();
      if (!sysId) return res.json({ threads: [] });
      const { data: rows, error } = await supabase
        .from("person_events")
        .select("host_id, type, direction, body, occurred_at")
        .eq("person_id", sysId)
        .order("occurred_at", { ascending: false })
        .limit(4000);
      if (error) throw error;

      // Newest-first rows → one card per host. needsReply when the host spoke
      // last (direction 'out' = host → PullUp) or the thread just opened
      // (access_request), i.e. the ball is in the admin's court.
      const byHost = new Map();
      for (const e of rows || []) {
        if (!e.host_id) continue;
        if (!byHost.has(e.host_id)) byHost.set(e.host_id, { events: [] });
        byHost.get(e.host_id).events.push(e);
      }
      const hostIds = [...byHost.keys()];
      const cards = await hostCards(hostIds);
      const threads = hostIds.map((hid) => {
        const evs = byHost.get(hid).events; // newest first
        const last = evs[0];
        const lastMsg = evs.find((e) => MESSAGEY.has(e.type));
        const needsReply = !!lastMsg && (lastMsg.direction === "out" || lastMsg.type === "access_request");
        const card = cards.get(hid) || { name: "Unknown host", email: null, avatarUrl: null };
        return {
          hostId: hid,
          ...card,
          lastBody: last?.body || "",
          lastAt: last?.occurred_at || null,
          lastFrom: last?.direction === "out" ? "host" : last?.direction === "in" ? "pullup" : "system",
          needsReply,
        };
      });
      threads.sort((a, b) => (Number(b.needsReply) - Number(a.needsReply)) || String(b.lastAt || "").localeCompare(String(a.lastAt || "")));
      res.json({ threads });
    } catch (e) {
      console.error("[admin-inbox] list failed:", e?.message);
      res.status(500).json({ error: "inbox_failed" });
    }
  });

  app.get("/admin/system-inbox/:hostId", requireAdmin, async (req, res) => {
    try {
      const sysId = await getSystemPersonId();
      if (!sysId) return res.json({ thread: [] });
      const { data: rows, error } = await supabase
        .from("person_events")
        .select("id, type, direction, body, occurred_at, metadata")
        .eq("person_id", sysId)
        .eq("host_id", req.params.hostId)
        .order("occurred_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      const cards = await hostCards([req.params.hostId]);
      // Admin perspective: PullUp's words (direction 'in') are MINE here.
      const thread = (rows || []).map((e) => ({
        id: e.id,
        from: e.direction === "in" ? "you" : e.direction === "out" ? "them" : "system",
        type: e.type,
        text: e.body || "",
        at: e.occurred_at,
        admin: e.metadata?.admin || undefined, // which operator wrote it
      }));
      res.json({ host: { hostId: req.params.hostId, ...(cards.get(req.params.hostId) || {}) }, thread });
    } catch (e) {
      console.error("[admin-inbox] thread failed:", e?.message);
      res.status(500).json({ error: "thread_failed" });
    }
  });

  app.post("/admin/system-inbox/:hostId/message", requireAdmin, async (req, res) => {
    try {
      const text = String(req.body?.text || "").trim();
      if (!text) return res.status(400).json({ error: "empty" });
      const sysId = await getSystemPersonId();
      if (!sysId) return res.status(503).json({ error: "system_person_missing" });
      // PullUp speaking = message_in in the host's thread (host_id filter is
      // what their Realtime subscription watches → it lands in their dock live).
      const logged = await logPersonEvent({
        personId: sysId,
        hostId: req.params.hostId,
        type: "message_in",
        channel: "email",
        direction: "in",
        body: text,
        metadata: { source: "system_admin", admin: req.admin.email },
      });
      res.json({ ok: true, id: logged?.id || null });
    } catch (e) {
      console.error("[admin-inbox] send failed:", e?.message);
      res.status(500).json({ error: "send_failed" });
    }
  });

  // ── Early-access requests queue (unified access_requests table) ──────────
  app.get("/admin/requests", requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("access_requests")
        .select("host_id, kind, payload, status, created_at, updated_at");
      if (error) throw error;
      const items = (data || []).map((r) => ({
        kind: r.kind,
        label:
          r.kind === "instagram" ? `@${r.payload?.igHandle || "?"}`
          : r.kind === "product" ? "Products"
          : `${r.kind} tier`,
        host_id: r.host_id,
        // Flattened for the list row — the raw payload rides along for detail.
        name: r.payload?.name || null,
        email: r.payload?.email || null,
        note: r.payload?.note || null,
        payload: r.payload || {},
        status: r.status,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
      const cards = await hostCards([...new Set(items.map((r) => r.host_id))]);
      for (const it of items) Object.assign(it, { host: cards.get(it.host_id) || null });
      items.sort((a, b) => String(b.updated_at || b.created_at || "").localeCompare(String(a.updated_at || a.created_at || "")));
      res.json({ items });
    } catch (e) {
      console.error("[admin-requests] list failed:", e?.message);
      res.status(500).json({ error: "requests_failed" });
    }
  });

  app.patch("/admin/requests/:kind/:hostId", requireAdmin, async (req, res) => {
    try {
      const status = String(req.body?.status || "");
      if (!["pending", "onboarded", "declined"].includes(status)) {
        return res.status(400).json({ error: "bad_status" });
      }
      const { kind, hostId } = req.params;
      const { error } = await supabase
        .from("access_requests")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("host_id", hostId)
        .eq("kind", kind);
      if (error) throw error;
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin-requests] update failed:", e?.message);
      res.status(500).json({ error: "update_failed" });
    }
  });

  // ── Admin management (super only) ─────────────────────────────────────────
  app.get("/admin/admins", requireSuperAdmin, async (req, res) => {
    const { listAdmins } = await import("../repos/platformAdmins.js");
    res.json({ admins: await listAdmins() });
  });

  app.post("/admin/admins", requireSuperAdmin, async (req, res) => {
    try {
      const { grantAdmin } = await import("../repos/platformAdmins.js");
      await grantAdmin({ email: req.body?.email, role: req.body?.role === "super" ? "super" : "admin", grantedBy: req.admin.email });
      res.json({ ok: true });
    } catch (e) {
      const code = e?.message === "not_platform_email" ? 400 : 500;
      res.status(code).json({ error: e?.message || "grant_failed" });
    }
  });

  app.delete("/admin/admins/:email", requireSuperAdmin, async (req, res) => {
    try {
      const email = String(req.params.email || "").toLowerCase();
      if (email === req.admin.email) return res.status(400).json({ error: "cannot_revoke_self" });
      const { revokeAdmin } = await import("../repos/platformAdmins.js");
      await revokeAdmin(email);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: "revoke_failed" });
    }
  });
}
