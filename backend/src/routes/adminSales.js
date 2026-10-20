// /admin/sales — the sales pipeline, read straight from the Google Sheet
// (SALES_SHEET_ID). The sheet is the record: Felix edits it there, Claude
// writes to it through the Sheets connector, this page only reads it.
// Reading it also brings prospects that reached a meeting into PullUp as
// clients (see /admin/clients).
import { requireOwner } from "../middleware/requireOwner.js";
import { readSalesSheet, salesSheetConfigured, salesSheetUrl } from "../lib/salesSheet.js";
import { CLIENT_STAGES, parseProspects, summarizeSales, stockholmToday } from "../lib/salesSummary.js";
import { ensureClients, listClients } from "../repos/clients.js";

// Prospects at a meeting or beyond get a client card (create-only, idempotent).
export async function syncClients(prospectRows) {
  const warm = parseProspects(prospectRows).filter((p) => p.id && CLIENT_STAGES.has(p.stage));
  await ensureClients(warm);
  return listClients();
}

export function registerAdminSalesRoutes(app) {
  // GET /admin/sales[?fresh=1] — cached a minute; fresh=1 rereads the sheet.
  app.get("/admin/sales", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      const sheet = await readSalesSheet({ fresh: req.query.fresh === "1" });
      const clients = await syncClients(sheet.prospectRows);
      const summary = summarizeSales({ ...sheet, today: stockholmToday(), clientIds: new Set(clients.map((c) => c.prospectId)) });
      return res.json({ ...summary, readAt: sheet.readAt, sheetUrl: salesSheetUrl() });
    } catch (err) {
      console.error("[admin/sales] error:", err?.message);
      return res.status(502).json({ error: "sheet_unavailable" });
    }
  });
}
