// Internal: live request metrics (admin-only). The read side of
// middleware/requestMetrics.js — per-route counts, error rates, p50/p95.
import { requireAdmin } from "../middleware/auth.js";
import { metricsSnapshot } from "../middleware/requestMetrics.js";

export function registerInternalMetricsRoutes(app) {
  app.get("/internal/metrics", requireAdmin, (req, res) => {
    res.json(metricsSnapshot());
  });
}
