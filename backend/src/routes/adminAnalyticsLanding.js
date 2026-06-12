// Admin landing-page overview — GET /admin/analytics/landing-view.
//
// The whole "front door" payload in one call, computed in one Postgres round
// trip by analytics_landing_overview() (migration 079): visit series from the
// daily rollups (today scanned live), range-unique visitors/sessions/bounce,
// the section scroll funnel, the CTA funnel, signups split by origin
// (landing-born vs RSVP-born) and the all-time origin x hostness matrix.

import { requireAdmin } from "../middleware/auth.js";
import { resolveAnalyticsRange } from "../lib/analyticsRange.js";

export function registerAdminAnalyticsLandingRoutes(app) {
  app.get("/admin/analytics/landing-view", requireAdmin, async (req, res) => {
    try {
      const { periodStart, periodEnd } = resolveAnalyticsRange(req);
      const toDateStr = (d) => d.toISOString().slice(0, 10);

      const { supabase } = await import("../supabase.js");
      const { data, error } = await supabase.rpc("analytics_landing_overview", {
        p_from: toDateStr(periodStart),
        p_to: toDateStr(periodEnd),
      });
      if (error) throw error;

      return res.json(data);
    } catch (err) {
      console.error("[admin/analytics/landing-view] error:", err.message);
      return res.status(500).json({ error: "Failed to load landing analytics" });
    }
  });
}
