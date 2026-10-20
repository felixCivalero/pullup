// /admin/clients — Kunder: everyone Felix is working with. A client card is
// created when the sheet row reaches a meeting (synced on read), or by hand
// ("Ta in i PullUp") for anyone on the list. Stage and next step come live
// from the sheet; meeting time and prep notes are kept here.
import { requireOwner } from "../middleware/requireOwner.js";
import { readSalesSheet, salesSheetConfigured, salesSheetUrl } from "../lib/salesSheet.js";
import { parseProspects } from "../lib/salesSummary.js";
import { ensureClients, updateClient } from "../repos/clients.js";
import { syncClients } from "./adminSales.js";

export function registerAdminClientRoutes(app) {
  // GET /admin/clients — cards, each with its sheet row's live facts.
  app.get("/admin/clients", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      const sheet = await readSalesSheet({ fresh: req.query.fresh === "1" });
      const clients = await syncClients(sheet.prospectRows);
      const byId = new Map(parseProspects(sheet.prospectRows).map((p) => [p.id, p]));
      return res.json({
        clients: clients.map((c) => ({ ...c, sheet: byId.get(c.prospectId) || null })),
        readAt: sheet.readAt,
        sheetUrl: salesSheetUrl(),
      });
    } catch (err) {
      console.error("[admin/clients] error:", err?.message);
      return res.status(502).json({ error: "failed" });
    }
  });

  // POST /admin/clients { prospectId } — pull a prospect into PullUp now.
  app.post("/admin/clients", requireOwner, async (req, res) => {
    const prospectId = String(req.body?.prospectId || "").trim();
    if (!/^P-\d+$/.test(prospectId)) return res.status(400).json({ error: "invalid_prospect" });
    try {
      const sheet = await readSalesSheet();
      const p = parseProspects(sheet.prospectRows).find((x) => x.id === prospectId);
      if (!p) return res.status(404).json({ error: "not_in_sheet" });
      await ensureClients([p]);
      return res.json({ ok: true });
    } catch (err) {
      console.error("[admin/clients] create error:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // PATCH /admin/clients/:id { meetingAt?, prep? }
  app.patch("/admin/clients/:id", requireOwner, async (req, res) => {
    try {
      const { meetingAt, prep } = req.body || {};
      if (meetingAt && Number.isNaN(Date.parse(meetingAt))) return res.status(400).json({ error: "invalid_date" });
      return res.json({ client: await updateClient(req.params.id, { meetingAt, prep }) });
    } catch (err) {
      console.error("[admin/clients] update error:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
