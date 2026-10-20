// /admin/sales — the sales pipeline, read straight from the Google Sheet
// (SALES_SHEET_ID). The sheet is the record: Felix edits it there, Claude
// writes to it through the Sheets connector, this page only reads it.
// Reading it also makes every Won row a client (see /admin/clients).
import { requireOwner } from "../middleware/requireOwner.js";
import { readSalesSheet, salesSheetConfigured, salesSheetUrl } from "../lib/salesSheet.js";
import { CLIENT_STAGES, parseProspects, summarizeSales, stockholmToday } from "../lib/salesSummary.js";
import { ensureClients, listClients } from "../repos/clients.js";

// Won rows become clients (create-only, idempotent).
export async function syncClients(prospectRows) {
  const won = parseProspects(prospectRows).filter((p) => p.id && CLIENT_STAGES.has(p.stage));
  await ensureClients(won);
  return listClients();
}

export function registerAdminSalesRoutes(app) {
  // GET /admin/sales[?fresh=1] — cached a minute; fresh=1 rereads the sheet.
  app.get("/admin/sales", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      const sheet = await readSalesSheet({ fresh: req.query.fresh === "1" });
      await syncClients(sheet.prospectRows);
      const summary = summarizeSales({ ...sheet, today: stockholmToday() });
      return res.json({ ...summary, readAt: sheet.readAt, sheetUrl: salesSheetUrl() });
    } catch (err) {
      console.error("[admin/sales] error:", err?.message);
      return res.status(502).json({ error: "sheet_unavailable" });
    }
  });
}
