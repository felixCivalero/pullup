// /admin/sales — the sales pipeline, read straight from the Google Sheet
// (SALES_SHEET_ID). The sheet is the record: Felix edits it there, Claude
// writes to it through the Sheets connector. The one write here is the mail
// sync: Uppdatera first records Felix's sent mail and replies in the sheet.
// Reading it also makes every Won row a client (see /admin/clients).
import { requireOwner } from "../middleware/requireOwner.js";
import { readSalesSheet, salesSheetConfigured, salesSheetUrl } from "../lib/salesSheet.js";
import { CLIENT_STAGES, parseProspects, summarizeSales, stockholmToday } from "../lib/salesSummary.js";
import { ensureClients, listClients } from "../repos/clients.js";
import { salesMailboxConfigured, syncSalesMail } from "../lib/salesMailbox.js";

// Won rows become clients (create-only, idempotent).
export async function syncClients(prospectRows) {
  const won = parseProspects(prospectRows).filter((p) => p.id && CLIENT_STAGES.has(p.stage));
  await ensureClients(won);
  return listClients();
}

// The pipeline as Sälj shows it: today's queue, follow-ups, meetings, pace.
export async function salesOverview({ fresh = false } = {}) {
  const sheet = await readSalesSheet({ fresh });
  await syncClients(sheet.prospectRows);
  return { ...summarizeSales({ ...sheet, today: stockholmToday() }), readAt: sheet.readAt, sheetUrl: salesSheetUrl() };
}

export function registerAdminSalesRoutes(app) {
  // GET /admin/sales[?fresh=1] — cached a minute; fresh=1 rereads the sheet.
  app.get("/admin/sales", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      return res.json(await salesOverview({ fresh: req.query.fresh === "1" }));
    } catch (err) {
      console.error("[admin/sales] error:", err?.message);
      return res.status(502).json({ error: "sheet_unavailable" });
    }
  });

  // POST /admin/sales/sync-mail — the last two weeks of INBOX + Sent into the
  // sheet (Date sent, Last contact, Stage forward, Log rows). Then the page
  // rereads the sheet with ?fresh=1.
  app.post("/admin/sales/sync-mail", requireOwner, async (req, res) => {
    if (!salesMailboxConfigured()) return res.status(503).json({ error: "mail_not_configured" });
    try {
      const result = await syncSalesMail({ sinceDays: 14 });
      return res.json(result);
    } catch (err) {
      console.error("[admin/sales/sync-mail] error:", err?.message);
      return res.status(502).json({ error: "mail_sync_failed" });
    }
  });
}
