// /admin/clients — the people Felix works for, one project each. A client is
// created when its sheet row reaches Won (synced on read), or by hand from
// Projekt ("Nytt projekt") for any row, so a brand gets its project as soon as
// there is a pitch. The project's name can differ from the sheet's company
// (e.g. an artist name); the sheet row stays the record of the deal.
import { requireOwner } from "../middleware/requireOwner.js";
import { readSalesSheet, salesSheetConfigured } from "../lib/salesSheet.js";
import { parseProspects } from "../lib/salesSummary.js";
import { ensureClients, listClients, updateClient } from "../repos/clients.js";
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

  // GET /admin/clients/candidates?q= — sheet rows to start a project for.
  app.get("/admin/clients/candidates", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q.length < 2) return res.json({ candidates: [] });
    try {
      const sheet = await readSalesSheet({});
      const taken = new Set((await listClients()).map((c) => c.prospectId));
      const rows = parseProspects(sheet.prospectRows)
        .filter((p) => p.id && !taken.has(p.id) && (String(p.company || "").toLowerCase().includes(q) || p.id.toLowerCase() === q))
        .slice(0, 8)
        .map((p) => ({ prospectId: p.id, company: p.company, person: p.person || "", stage: p.stage || "" }));
      return res.json({ candidates: rows });
    } catch (err) {
      console.error("[admin/clients] candidates:", err?.message);
      return res.status(502).json({ error: "failed" });
    }
  });

  // POST /admin/clients { prospectId } — start a project for a sheet row.
  app.post("/admin/clients", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    const prospectId = String(req.body?.prospectId || "").trim();
    if (!/^P-\d{1,6}$/.test(prospectId)) return res.status(400).json({ error: "invalid_id" });
    try {
      const sheet = await readSalesSheet({});
      const row = parseProspects(sheet.prospectRows).find((p) => p.id === prospectId);
      if (!row) return res.status(404).json({ error: "not_in_sheet" });
      await ensureClients([row]);
      const client = (await listClients()).find((c) => c.prospectId === prospectId);
      return res.json({ client: { ...client, stage: row.stage || "", nextStep: row.nextStep || "", nextStepDate: row.nextStepDate || "" } });
    } catch (err) {
      console.error("[admin/clients] create:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // PATCH /admin/clients/:id { docUrl?, company? } — company = the project's name.
  app.patch("/admin/clients/:id", requireOwner, async (req, res) => {
    const docUrl = req.body?.docUrl === undefined ? undefined : String(req.body.docUrl).trim();
    const company = req.body?.company === undefined ? undefined : String(req.body.company).trim().slice(0, 80);
    if (docUrl && !/^https:\/\//.test(docUrl)) return res.status(400).json({ error: "invalid_url" });
    if (company !== undefined && !company) return res.status(400).json({ error: "invalid_name" });
    try {
      return res.json({ client: await updateClient(req.params.id, { docUrl, company }) });
    } catch (err) {
      console.error("[admin/clients] update error:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
