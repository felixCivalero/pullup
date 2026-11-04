// /admin/free-tool (owner only): the free event tool's outreach — the event
// organisers on the sales sheet (Track = Event), who Felix has mailed, who
// opened their link, who made an account and whether they've made events.
// Reads the sheet, the mail clicks (adminSales.mailClicks) and the platform's
// accounts (adminPlatform.platformStats); lib/freeToolOutreach.js joins them.
import { requireOwner } from "../middleware/requireOwner.js";
import { readSalesSheet, salesSheetConfigured, salesSheetUrl } from "../lib/salesSheet.js";
import { parseProspects, stockholmToday } from "../lib/salesSummary.js";
import { summarizeFreeTool } from "../lib/freeToolOutreach.js";
import { mailClicks } from "./adminSales.js";
import { platformStats } from "./adminPlatform.js";

export function registerAdminFreeToolRoutes(app) {
  app.get("/admin/free-tool", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      const sheet = await readSalesSheet({ fresh: req.query.fresh === "1" });
      const [clicks, platform] = await Promise.all([mailClicks(), platformStats()]);
      const out = summarizeFreeTool({ prospects: parseProspects(sheet.prospectRows), clicks, accounts: platform.accounts, today: stockholmToday() });
      return res.json({ ...out, platform: platform.totals, readAt: sheet.readAt, sheetUrl: salesSheetUrl() });
    } catch (err) {
      console.error("[admin/free-tool] error:", err?.message);
      return res.status(502).json({ error: "failed" });
    }
  });
}
