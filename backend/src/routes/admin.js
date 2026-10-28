// Admin basics: who am I (any organiser), and the site's numbers (Statistik, owner).
import { requireOwner } from "../middleware/requireOwner.js";
import { requireUser } from "../middleware/requireUser.js";
import { supabase } from "../supabase.js";
import { summarizeVisits, visitTimeline } from "../lib/visitJourneys.js";
import { uniqueVisitors } from "../lib/uniqueVisitors.js";
import { brandScope, brandShape } from "../lib/brands.js";
import { myInvites } from "../lib/teams.js";

// The stats cookie (opt-in, frontend lib/consent.js) went live this day; before
// it no visitor was kept, so unique visitors are counted from here on.
const UNIQUES_SINCE = "2026-10-26T00:00:00+02:00";

const TZ = "Europe/Stockholm";
const dayKey = (iso) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

// Page through a query 1000 rows at a time (PostgREST caps a single read).
async function selectAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

const VISIT_COLUMNS = "session_id, visitor_id, event_name, occurred_at, source, device_type, props";
const VISIT_EVENTS = [
  "page_view", "section_view", "engagement", "click", "cta_click", "copy",
  "request_open", "request_field", "request_close", "request_error", "request_sent",
];

// The site's numbers for the last `days`: views, CTA clicks and requests per
// day, where views came from, which pages were read, the latest requests.
export async function siteStats(days = 30) {
  days = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  const since = new Date(Date.now() - days * 86400000);
  since.setUTCHours(0, 0, 0, 0);

  const [events, requests, leads, uniqueRows] = await Promise.all([
    selectAll(() =>
      supabase
        .from("analytics_events")
        .select("event_name, occurred_at, source, props")
        .in("event_name", ["page_view", "request_open"])
        .neq("source", "localhost")
        .gte("occurred_at", since.toISOString())
        .order("occurred_at", { ascending: true }),
    ),
    selectAll(() =>
      supabase
        .from("agency_requests")
        .select("created_at")
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true }),
    ),
    supabase
      .from("agency_requests")
      .select("id, created_at, name, email, company, description, preferred_time, source, visit_id:meta->>visitId")
      .order("created_at", { ascending: false })
      .limit(50),
    // All of it since the cookie went live, not just the period: the running
    // total counts everyone ever counted.
    selectAll(() =>
      supabase
        .from("analytics_events")
        .select("visitor_id, session_id, occurred_at, event_name, props")
        .in("event_name", ["page_view", "consent"])
        .neq("source", "localhost")
        .gte("occurred_at", UNIQUES_SINCE)
        .order("occurred_at", { ascending: true }),
    ),
  ]);
  if (leads.error) throw leads.error;

  // One row per calendar day (Stockholm), oldest first, zero-filled.
  const byDay = new Map();
  for (let i = days; i >= 0; i--) {
    byDay.set(dayKey(new Date(Date.now() - i * 86400000).toISOString()), { date: null, views: 0, clicks: 0, requests: 0 });
  }
  for (const [k, v] of byDay) v.date = k;
  for (const e of events) {
    const d = byDay.get(dayKey(e.occurred_at));
    if (!d) continue;
    if (e.event_name === "page_view") d.views += 1;
    else d.clicks += 1;
  }
  for (const r of requests) {
    const d = byDay.get(dayKey(r.created_at));
    if (d) d.requests += 1;
  }

  // Per source: views and CTA clicks. Per page: views.
  const bySource = new Map();
  const byPage = new Map();
  for (const e of events) {
    const src = e.source === "ig" ? "instagram" : e.source || "direct"; // older rows say "ig"
    const s = bySource.get(src) || { source: src, views: 0, clicks: 0 };
    if (e.event_name === "page_view") {
      s.views += 1;
      const page = e.props?.page || "landing";
      byPage.set(page, (byPage.get(page) || 0) + 1);
    } else s.clicks += 1;
    bySource.set(src, s);
  }
  const sources = [...bySource.values()].sort((a, b) => b.views - a.views || b.clicks - a.clicks);
  const pages = [...byPage].map(([page, views]) => ({ page, views })).sort((a, b) => b.views - a.views);

  // Unique visitors (only those who said yes to the stats cookie): new per
  // day and the running total since the cookie went live.
  const uniques = uniqueVisitors(uniqueRows, [...byDay.keys()], dayKey);
  const series = [...byDay.values()].map((d, i) => ({ ...d, ...uniques.series[i] }));
  const totals = series.reduce((t, d) => ({ views: t.views + d.views, clicks: t.clicks + d.clicks, requests: t.requests + d.requests }), { views: 0, clicks: 0, requests: 0 });
  totals.uniques = uniques.total;
  totals.uniquesInPeriod = uniques.inPeriod;
  return { days, series, totals, consent: uniques.consent, uniquesSince: UNIQUES_SINCE.slice(0, 10), sources, pages, leads: leads.data || [] };
}

export function registerAdminRoutes(app) {
  // Who is signed in: any organiser, and whether it's the owner (the admin
  // pages only he uses are shown to him alone).
  // Who's signed in, their brands and whether they've made anything yet — the
  // admin decides from this whether a person needs the start (onboarding).
  app.get("/admin/me", requireUser, async (req, res) => {
    try {
      const [{ brands, brand }, invites] = await Promise.all([brandScope(req.caller), myInvites(req.caller)]);
      const { count, error } = await supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("host_id", req.caller.hostId);
      if (error) throw error;
      return res.json({
        ok: true,
        email: req.caller.email,
        owner: req.caller.isOwner,
        brands: brands.map(brandShape),
        brand: brand?.id || null,
        events: count || 0,
        invites,
      });
    } catch (err) {
      console.error("[admin/me]", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // GET /admin/stats?days=30 — per day: page views, CTA clicks (the "Jobba
  // med mig" form opened), requests sent. Where the views came from (source)
  // and which pages they read. Plus the latest requests (leads). Visits from a
  // dev server (source "localhost") are left out everywhere.
  app.get("/admin/stats", requireOwner, async (req, res) => {
    try {
      return res.json(await siteStats(req.query.days));
    } catch (err) {
      console.error("[admin/stats] error:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // GET /admin/visits?days=30 — every visit as a journey: how far they read,
  // where the time went, what they clicked, whether the form was opened,
  // started or sent (a sent request is linked by meta.visitId). Plus the
  // funnel and, per page and section, how many got there and how long they
  // read. See lib/visitJourneys.js.
  app.get("/admin/visits", requireOwner, async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
      const since = new Date(Date.now() - days * 86400000);
      since.setUTCHours(0, 0, 0, 0);
      const [events, requests] = await Promise.all([
        selectAll(() =>
          supabase
            .from("analytics_events")
            .select(VISIT_COLUMNS)
            .in("event_name", VISIT_EVENTS)
            .neq("source", "localhost")
            .gte("occurred_at", since.toISOString())
            .order("occurred_at", { ascending: true }),
        ),
        selectAll(() =>
          supabase.from("agency_requests").select("id, name, company, created_at, meta").gte("created_at", since.toISOString()),
        ),
      ]);
      const { visits, funnel, pages } = summarizeVisits({ events, requests });
      return res.json({ days, funnel, pages, visits: visits.slice(0, 300), total: visits.length });
    } catch (err) {
      console.error("[admin/visits] error:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // GET /admin/visits/:id — one visit, step by step.
  app.get("/admin/visits/:id", requireOwner, async (req, res) => {
    try {
      const id = String(req.params.id || "").slice(0, 128);
      const [events, request] = await Promise.all([
        selectAll(() =>
          supabase.from("analytics_events").select(VISIT_COLUMNS).eq("session_id", id).in("event_name", VISIT_EVENTS).order("occurred_at", { ascending: true }),
        ),
        supabase.from("agency_requests").select("id, name, email, company, created_at, meta").eq("meta->>visitId", id).limit(1).maybeSingle(),
      ]);
      if (request.error) throw request.error;
      if (!events.length) return res.status(404).json({ error: "not_found" });
      return res.json(visitTimeline({ events, request: request.data }));
    } catch (err) {
      console.error("[admin/visits/:id] error:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
