// Admin rooms overview — GET /admin/analytics/rooms-view.
//
// One Postgres round trip via analytics_rooms_overview() (migration 081):
// platform room KPIs (views, people, alive rooms, pulse, afterlife) + the
// per-room table (reach, pulse, afterlife, host-drop-after) the Rooms tab
// renders. Afterlife = of the people who PULLED UP, who came back to the
// room after the night ended — the thesis metric.

import { requireAdmin } from "../middleware/auth.js";
import { resolveAnalyticsRange } from "../lib/analyticsRange.js";

export function registerAdminAnalyticsRoomsRoutes(app) {
  app.get("/admin/analytics/rooms-view", requireAdmin, async (req, res) => {
    try {
      const { periodStart, periodEnd } = resolveAnalyticsRange(req);
      const toDateStr = (d) => d.toISOString().slice(0, 10);

      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.rpc("analytics_rooms_overview", {
        p_from: toDateStr(periodStart),
        p_to: toDateStr(periodEnd),
      });
      if (error) throw error;

      return res.json(data);
    } catch (err) {
      console.error("[admin/analytics/rooms-view] error:", err.message);
      return res.status(500).json({ error: "Failed to load rooms analytics" });
    }
  });
}
