// Admin ideas review routes — list submitted ideas and update their review status
// (new / read / done / archived). Admin-only.

import { requireAdmin } from "../middleware/auth.js";

export function registerAdminIdeaRoutes(app) {
  app.get("/admin/ideas", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      let query = supabase.from("ideas").select("*").order("created_at", { ascending: false });

      const { status } = req.query;
      if (status && ["new", "read", "done", "archived"].includes(status)) {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return res.json(data);
    } catch (err) {
      console.error("[admin] ideas list error:", err.message);
      return res.status(500).json({ error: "Failed to fetch ideas" });
    }
  });

  app.patch("/admin/ideas/:id", requireAdmin, async (req, res) => {
    try {
      const { status } = req.body || {};
      if (!status || !["new", "read", "done", "archived"].includes(status)) {
        return res.status(400).json({ error: "status must be one of: new, read, done, archived" });
      }

      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase
        .from("ideas")
        .update({ status })
        .eq("id", req.params.id)
        .select("id")
        .single();

      if (error && error.code === "PGRST116") {
        return res.status(404).json({ error: "Idea not found" });
      }
      if (error) throw error;
      return res.json({ ok: true });
    } catch (err) {
      console.error("[admin] ideas update error:", err.message);
      return res.status(500).json({ error: "Failed to update idea" });
    }
  });
}
