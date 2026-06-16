// Admin "Act as" — the superuser control for full session-swap impersonation.
// The switch is a REAL session swap (not a header): `start` mints a genuine
// Supabase session for the target host and hands the client a single-use
// token_hash to adopt it, so once swapped the admin IS the host end-to-end —
// identity, Realtime, and every API call resolve as the host with nothing to
// leak back. `stop` just closes the audit window (the client restores its own
// stashed admin session locally before calling it).
//
// All routes are requireAdmin and run as the REAL admin: `start` happens before
// the swap, `stop` after the client has restored the admin session — so the
// admin's own rights gate both. The session mint is service-role power, so this
// is god-level and audited (admin_impersonation_log).

import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../supabase.js";

export function registerAdminImpersonationRoutes(app) {
  // GET /admin/impersonation/hosts?q= — searchable host directory to step into.
  // Matches name / contact email. Returns the auth user id (the swap target).
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

  // POST /admin/impersonation/start { targetUserId } — mint a real session for
  // the target host + open an audit row. Returns the host's display info, the
  // log id (the client keeps it to close the window on exit), and a single-use
  // `tokenHash` the client verifies (supabase.auth.verifyOtp, type "magiclink")
  // to adopt the host's session. generateLink mints WITHOUT emailing, so the
  // host is never notified and no link is sent anywhere.
  app.post("/admin/impersonation/start", requireAdmin, async (req, res) => {
    try {
      const adminId = req.user.id; // the real admin (swap hasn't happened yet)
      const targetId = (req.body?.targetUserId || "").toString().trim();
      if (!targetId) return res.status(400).json({ error: "targetUserId required" });
      if (targetId === adminId) return res.status(400).json({ error: "Cannot act as yourself" });

      // The auth email is what the session mint keys on (canonical, not the
      // profile's contact_email which can differ).
      const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(targetId);
      if (authErr || !authData?.user?.email) return res.status(404).json({ error: "Host not found" });
      const targetEmail = authData.user.email;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, name, contact_email")
        .eq("id", targetId)
        .maybeSingle();

      // Mint a real session for the host (no email sent).
      const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      });
      const tokenHash = link?.properties?.hashed_token;
      if (linkErr || !tokenHash) {
        console.error("[admin/impersonation/start] mint failed:", linkErr?.message);
        return res.status(500).json({ error: "Failed to mint session" });
      }

      const { data: log, error } = await supabase
        .from("admin_impersonation_log")
        .insert({
          real_user_id: adminId,
          acting_as_user_id: targetId,
          acting_as_email: targetEmail,
        })
        .select("id")
        .single();
      if (error) throw error;

      res.json({
        ok: true,
        logId: log.id,
        tokenHash,
        target: {
          id: targetId,
          name: profile?.name || authData.user.user_metadata?.name || "",
          email: profile?.contact_email || targetEmail,
        },
      });
    } catch (err) {
      console.error("[admin/impersonation/start] error:", err.message);
      res.status(500).json({ error: "Failed to start session" });
    }
  });

  // POST /admin/impersonation/stop { logId } — close the audit window. Called
  // AFTER the client restores its own admin session, so it runs as the admin.
  // Scoped to the admin's own rows. Best-effort: the client clears + reloads
  // regardless.
  app.post("/admin/impersonation/stop", requireAdmin, async (req, res) => {
    try {
      const adminId = req.user.id;
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
