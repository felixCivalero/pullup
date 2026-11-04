// GET /admin/overview?days=30 (owner only) — Översikt: the agency and the
// event tool as one picture (lib/overview.js), plus today's work from both:
// Sälj's mail of the day and what waits on Felix, the event tool's mail and
// new accounts. Reads what Sälj, Eventverktyget and Sajten already read.
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";
import { readSalesSheet, salesSheetConfigured } from "../lib/salesSheet.js";
import { parseProspects, stockholmToday, summarizeSales } from "../lib/salesSummary.js";
import { summarizeFreeTool } from "../lib/freeToolOutreach.js";
import { summarizeVisits } from "../lib/visitJourneys.js";
import { summarizeOverview } from "../lib/overview.js";
import { mailClicks } from "./adminSales.js";
import { platformStats } from "./adminPlatform.js";
import { VISIT_COLUMNS, VISIT_EVENTS, selectAll } from "./admin.js";

function addDays(d, n) {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export function registerAdminOverviewRoutes(app) {
  app.get("/admin/overview", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
      const today = stockholmToday();
      const since = addDays(today, -(days - 1));
      const from = `${since}T00:00:00+01:00`;
      const [sheet, clicks, platform, events, requests, checks] = await Promise.all([
        readSalesSheet({ fresh: req.query.fresh === "1" }),
        mailClicks(),
        platformStats(),
        selectAll(() => supabase.from("analytics_events").select(VISIT_COLUMNS).in("event_name", VISIT_EVENTS)
          .neq("source", "localhost").gte("occurred_at", from).order("occurred_at", { ascending: true })),
        selectAll(() => supabase.from("agency_requests").select("id, created_at, name, company, email, meta").gte("created_at", from)),
        selectAll(() => supabase.from("site_checks").select("domain, score, outcome, source, visit_id, created_at").gte("created_at", from)),
      ]);
      const prospects = parseProspects(sheet.prospectRows);
      const { visits } = summarizeVisits({ events, requests });
      const overview = summarizeOverview({
        prospects, clicks, accounts: platform.accounts, visits, checks, since,
        requests: requests.map((r) => ({ ...r, visit_id: r.meta?.visitId || null })),
      });

      // Today, from both sides.
      const sales = summarizeSales({ ...sheet, today });
      const tool = summarizeFreeTool({ prospects, clicks, accounts: platform.accounts, today });
      const todayWork = {
        agency: {
          sent: sales.sentToday,
          perDay: sales.perDay,
          waiting: sales.toAnswer.length + sales.followUps.length + sales.due.length,
          meetings: sales.meetings.length,
          paceDelta: sales.plan?.started ? sales.plan.delta : null,
        },
        tool: {
          mailedToday: tool.totals.today,
          accounts7: platform.totals.new7,
          published: platform.totals.published,
          upcoming: platform.totals.upcoming,
        },
      };
      return res.json({ days, today, ...overview, todayWork, readAt: sheet.readAt });
    } catch (err) {
      console.error("[admin/overview] error:", err?.message);
      return res.status(502).json({ error: "failed" });
    }
  });
}
