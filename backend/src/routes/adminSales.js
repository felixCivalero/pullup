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
import { clickSessions, summarizeMailClicks } from "../lib/mailClicks.js";
import { supabase } from "../supabase.js";

const CLICK_COLUMNS = "session_id, visitor_id, event_name, occurred_at, source, device_type, props, utm";
const VISIT_EVENTS = [
  "page_view", "section_view", "engagement", "click", "cta_click", "copy", "consent",
  "request_open", "request_field", "request_close", "request_error", "request_sent",
];

async function selectAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

// Who opened pullup.se from an outreach mail (their own link code), and
// everything they read, across visits if they said yes to the cookie.
export async function mailClicks() {
  const sheet = await readSalesSheet();
  const prospects = parseProspects(sheet.prospectRows).filter((p) => p.linkCode);
  if (!prospects.length) return [];
  const codes = new Set(prospects.map((p) => p.linkCode));
  const linkRows = (await selectAll(() =>
    supabase.from("analytics_events").select("session_id, visitor_id, utm").eq("utm->>utm_source", "mejl").not("utm->>utm_content", "is", null).order("occurred_at"),
  )).filter((e) => codes.has(e.utm?.utm_content));
  const { sessions, visitors } = clickSessions(linkRows);
  if (!sessions.length) return [];
  const chunks = (xs) => Array.from({ length: Math.ceil(xs.length / 200) }, (_, i) => xs.slice(i * 200, i * 200 + 200));
  const events = new Map();
  for (const [col, ids] of [["session_id", sessions], ["visitor_id", visitors]]) {
    for (const chunk of chunks(ids)) {
      const rows = await selectAll(() =>
        supabase.from("analytics_events").select(`id, ${CLICK_COLUMNS}`).in(col, chunk).in("event_name", VISIT_EVENTS).order("occurred_at"),
      );
      for (const r of rows) events.set(r.id, r);
    }
  }
  return summarizeMailClicks({ prospects, events: [...events.values()] });
}

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

  // GET /admin/sales/clicks — prospects who opened their link, latest first.
  app.get("/admin/sales/clicks", requireOwner, async (req, res) => {
    if (!salesSheetConfigured()) return res.status(503).json({ error: "not_configured" });
    try {
      return res.json({ clicks: await mailClicks() });
    } catch (err) {
      console.error("[admin/sales/clicks] error:", err?.message);
      return res.status(502).json({ error: "failed" });
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
