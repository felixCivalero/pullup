// /admin/sales — the sales pipeline, read straight from the Google Sheet
// (SALES_SHEET_ID). The sheet is the record: Felix edits it there, Claude
// writes to it through the Sheets connector, this page only reads it.
import { requireOwner } from "../middleware/requireOwner.js";
import { batchGetValues, sheetsConfigured } from "../lib/googleSheets.js";
import { summarizeSales, stockholmToday } from "../lib/salesSummary.js";

const CACHE_MS = 60_000;
let cache = null; // { at, data }

export function registerAdminSalesRoutes(app) {
  // GET /admin/sales[?fresh=1] — cached a minute; fresh=1 rereads the sheet.
  app.get("/admin/sales", requireOwner, async (req, res) => {
    const sheetId = process.env.SALES_SHEET_ID;
    if (!sheetId || !sheetsConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      if (!cache || req.query.fresh === "1" || Date.now() - cache.at > CACHE_MS) {
        const [prospectRows, logRows, overviewRows] = await batchGetValues(sheetId, ["Prospects!A:U", "Log!A:E", "Overview!A1:B40"]);
        cache = { at: Date.now(), raw: { prospectRows, logRows, overviewRows } };
      }
      const summary = summarizeSales({ ...cache.raw, today: stockholmToday() });
      return res.json({
        ...summary,
        readAt: new Date(cache.at).toISOString(),
        sheetUrl: `https://docs.google.com/spreadsheets/d/${sheetId}/edit`,
      });
    } catch (err) {
      console.error("[admin/sales] error:", err?.message);
      return res.status(502).json({ error: "sheet_unavailable" });
    }
  });
}
