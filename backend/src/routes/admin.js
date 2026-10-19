// Admin basics: who am I, and the site's numbers (Statistik).
import { requireOwner } from "../middleware/requireOwner.js";
import { supabase } from "../supabase.js";

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

export function registerAdminRoutes(app) {
  app.get("/admin/me", requireOwner, (req, res) => {
    res.json({ ok: true, email: req.user.email });
  });

  // GET /admin/stats?days=30 — per day: page views, CTA clicks (the "Jobba
  // med mig" form opened), requests sent. Plus the latest requests (leads).
  app.get("/admin/stats", requireOwner, async (req, res) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 1), 365);
      const since = new Date(Date.now() - days * 86400000);
      since.setUTCHours(0, 0, 0, 0);

      const [events, requests, leads] = await Promise.all([
        selectAll(() =>
          supabase
            .from("analytics_events")
            .select("event_name, occurred_at")
            .in("event_name", ["page_view", "request_open"])
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
          .select("id, created_at, name, email, company, description, preferred_time, source")
          .order("created_at", { ascending: false })
          .limit(50),
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

      const series = [...byDay.values()];
      const totals = series.reduce((t, d) => ({ views: t.views + d.views, clicks: t.clicks + d.clicks, requests: t.requests + d.requests }), { views: 0, clicks: 0, requests: 0 });
      return res.json({ days, series, totals, leads: leads.data || [] });
    } catch (err) {
      console.error("[admin/stats] error:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });
}
