// Admin ecosystem CRM — the person-anchored god view of PullUp's whole human
// graph (waitlist → host → guest → pulled up → community). Thin route layer over
// services/adminEcosystem.js. See [[project_the_room_is_pullup]].

import { requireAdmin } from "../middleware/auth.js";

export function registerAdminEcosystemRoutes(app) {
  // GET /admin/crm/funnel — the two intertwined funnels in counts.
  app.get("/admin/crm/funnel", requireAdmin, async (req, res) => {
    try {
      const { getEcosystemFunnel } = await import("../services/adminEcosystem.js");
      res.json(await getEcosystemFunnel());
    } catch (err) {
      console.error("[admin/crm/funnel] error:", err.message);
      res.status(500).json({ error: "Failed to load funnel" });
    }
  });

  // GET /admin/crm/people — paginated person god-list with derived role facets.
  //   ?q=        free-text (name / email / instagram / phone)
  //   ?segment=  all | waitlist | host | activated | lead | guest | pulledup | community
  //   ?limit= ?offset=
  app.get("/admin/crm/people", requireAdmin, async (req, res) => {
    try {
      const { listEcosystemPeople } = await import("../services/adminEcosystem.js");
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 50, 200));
      const offset = Math.max(0, Number(req.query.offset) || 0);
      const result = await listEcosystemPeople({
        q: (req.query.q || "").toString().slice(0, 80),
        segment: (req.query.segment || "all").toString(),
        limit,
        offset,
      });
      res.json(result);
    } catch (err) {
      console.error("[admin/crm/people] error:", err.message);
      res.status(500).json({ error: "Failed to load people" });
    }
  });

  // GET /admin/crm/people/:id — full detail for the drawer. Accepts a real
  // person uuid or a silo synthetic id (waitlist:/lead:/profile:).
  app.get("/admin/crm/people/:id", requireAdmin, async (req, res) => {
    try {
      const { getEcosystemPersonDetail } = await import("../services/adminEcosystem.js");
      const detail = await getEcosystemPersonDetail(req.params.id);
      if (!detail) return res.status(404).json({ error: "not_found" });
      res.json(detail);
    } catch (err) {
      console.error("[admin/crm/people/:id] error:", err.message);
      res.status(500).json({ error: "Failed to load person" });
    }
  });

  // PATCH /admin/crm/waitlist/:id — move an applicant along the funnel.
  app.patch("/admin/crm/waitlist/:id", requireAdmin, async (req, res) => {
    try {
      const { setWaitlistStatus } = await import("../services/adminEcosystem.js");
      const data = await setWaitlistStatus(req.params.id, (req.body?.status || "").toString());
      res.json(data || { ok: true });
    } catch (err) {
      console.error("[admin/crm/waitlist/:id] error:", err.message);
      res.status(400).json({ error: err.message || "Failed to update waitlist" });
    }
  });
}
