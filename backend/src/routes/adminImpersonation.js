// Admin "Act as" — the superuser control surface for full session-swap
// impersonation. Three thin endpoints: search hosts to step into, log the start
// of a session, and close it. The actual identity swap happens in
// middleware/auth.js applyActAs() off the `x-pullup-act-as` header; these routes
// just power the picker UI and keep the audit trail (admin_impersonation_log).
//
// All routes are requireAdmin, which authorises on the REAL user (req.realUser
// when already impersonating) — so the picker/exit keep working mid-session.

import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../supabase.js";

// The real admin behind the request, even when they're already acting as a host.
function realAdminId(req) {
  return req.realUser?.id || req.user?.id || null;
}

export function registerAdminImpersonationRoutes(app) {
  // GET /admin/impersonation/hosts?q= — searchable host directory to step into.
  // Matches name / contact email. Returns the auth user id (= the act-as target).
  app.get("/admin/impersonation/hosts", requireAdmin, async (req, res) => {
    try {
      const q = (req.query.q || "").toString().trim().slice(0, 80);
      let query = supabase
        .from("profiles")
        .select("id, name, contact_email")
        .order("name", { ascending: true })
        .limit(20);
      if (q) {
        const safe = q.replace(/[%,]/g, " ");
        query = query.or(`name.ilike.%${safe}%,contact_email.ilike.%${safe}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      res.json({
        hosts: (data || []).map((p) => ({
          id: p.id,
          name: p.name || "",
          email: p.contact_email || "",
        })),
      });
    } catch (err) {
      console.error("[admin/impersonation/hosts] error:", err.message);
      res.status(500).json({ error: "Failed to load hosts" });
    }
  });

  // POST /admin/impersonation/start { targetUserId } — validate the target host
  // and open an audit row. Returns the display info + the log id (the FE keeps it
  // to close the session on exit). The swap itself is header-driven, client-side.
  app.post("/admin/impersonation/start", requireAdmin, async (req, res) => {
    try {
      const adminId = realAdminId(req);
      const targetId = (req.body?.targetUserId || "").toString().trim();
      if (!targetId) return res.status(400).json({ error: "targetUserId required" });
      if (targetId === adminId) return res.status(400).json({ error: "Cannot act as yourself" });

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, contact_email")
        .eq("id", targetId)
        .maybeSingle();
      if (!profile) return res.status(404).json({ error: "Host not found" });

      const { data: log, error } = await supabase
        .from("admin_impersonation_log")
        .insert({
          real_user_id: adminId,
          acting_as_user_id: targetId,
          acting_as_email: profile.contact_email || null,
        })
        .select("id")
        .single();
      if (error) throw error;

      res.json({
        ok: true,
        logId: log.id,
        target: { id: profile.id, name: profile.name || "", email: profile.contact_email || "" },
      });
    } catch (err) {
      console.error("[admin/impersonation/start] error:", err.message);
      res.status(500).json({ error: "Failed to start session" });
    }
  });

  // POST /admin/impersonation/stop { logId } — close the audit window. Scoped to
  // the admin's own rows. Best-effort: the FE clears + reloads regardless.
  app.post("/admin/impersonation/stop", requireAdmin, async (req, res) => {
    try {
      const adminId = realAdminId(req);
      const logId = (req.body?.logId || "").toString().trim();
      if (logId) {
        await supabase
          .from("admin_impersonation_log")
          .update({ ended_at: new Date().toISOString() })
          .eq("id", logId)
          .eq("real_user_id", adminId)
          .is("ended_at", null);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("[admin/impersonation/stop] error:", err.message);
      res.json({ ok: true }); // never block exit on a logging failure
    }
  });
}
