// /admin/clients — the people Felix works for. A client is created when its
// sheet row reaches Won (synced on read). The admin uses it to pick whose
// content timeline to show (Tidslinje) and to link the client's meetings doc.
import { requireOwner } from "../middleware/requireOwner.js";
import { readSalesSheet, salesSheetConfigured } from "../lib/salesSheet.js";
import { parseProspects } from "../lib/salesSummary.js";
import { updateClient } from "../repos/clients.js";
import { syncClients } from "./adminSales.js";

export function registerAdminClientRoutes(app) {
  // GET /admin/clients — every client with its sheet stage and next step.
  app.get("/admin/clients", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      const sheet = await readSalesSheet({ fresh: req.query.fresh === "1" });
      const clients = await syncClients(sheet.prospectRows);
      const byId = new Map(parseProspects(sheet.prospectRows).map((p) => [p.id, p]));
      return res.json({
        clients: clients.map((c) => {
          const p = byId.get(c.prospectId);
          return { ...c, stage: p?.stage || "", nextStep: p?.nextStep || "", nextStepDate: p?.nextStepDate || "" };
        }),
      });
    } catch (err) {
      console.error("[admin/clients] error:", err?.message);
      return res.status(502).json({ error: "failed" });
    }
  });

  // PATCH /admin/clients/:id { docUrl }
  app.patch("/admin/clients/:id", requireOwner, async (req, res) => {
    const docUrl = String(req.body?.docUrl ?? "").trim();
    if (docUrl && !/^https:\/\//.test(docUrl)) return res.status(400).json({ error: "invalid_url" });
    try {
      return res.json({ client: await updateClient(req.params.id, { docUrl }) });
    } catch (err) {
      console.error("[admin/clients] update error:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
