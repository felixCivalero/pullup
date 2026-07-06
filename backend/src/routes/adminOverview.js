// backend/src/routes/adminOverview.js
//
// The "how is PullUp actually going" read for the admin dashboard:
//   GET /admin/overview — subscriptions (mirror of Stripe state we hold),
//                         ticket sales, connected accounts, event counts
//   GET /admin/events-map — every event with coordinates + status + when,
//                           for the expansion map (filter client-side)
// One admin-gated read each, assembled from our own tables — the DB mirrors
// Stripe via webhooks, so this IS the Stripe view without an API round-trip.

import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../supabase.js";
import { TIERS } from "../config/subscriptions.js";

export function registerAdminOverviewRoutes(app) {
  app.get("/admin/overview", requireAdmin, async (req, res) => {
    try {
      const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
      const nowIso = new Date().toISOString();
      const [plans, payments, connects, eventsAgg, hostsCount] = await Promise.all([
        supabase.from("creator_billing_plans").select("host_id, plan, subscription_status, founding, cancel_at_period_end, current_period_end"),
        supabase.from("payments").select("amount, currency, status, provider, created_at, refunded_amount").order("created_at", { ascending: false }).limit(2000),
        supabase.from("profiles").select("id, name, brand, contact_email").not("stripe_connected_account_id", "is", null),
        supabase.from("events").select("id, status, starts_at, kind"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      // ── Subscriptions (the Stripe mirror we keep via webhooks) ──
      const rows = plans.data || [];
      const active = rows.filter((r) => r.subscription_status === "active");
      const pastDue = rows.filter((r) => r.subscription_status === "past_due");
      const cancelling = active.filter((r) => r.cancel_at_period_end);
      const founding = rows.filter((r) => r.founding === true).length;
      const mrr = active.reduce((s, r) => s + (TIERS[r.plan]?.priceSek ?? TIERS.creator?.priceSek ?? 0), 0);
      const byPlan = {};
      for (const r of active) byPlan[r.plan || "creator"] = (byPlan[r.plan || "creator"] || 0) + 1;

      // ── Ticket sales ──
      const pays = payments.data || [];
      const ok = pays.filter((p) => p.status === "succeeded");
      const sum = (list) => list.reduce((s, p) => s + (p.amount || 0) - (p.refunded_amount || 0), 0);
      const last30 = ok.filter((p) => p.created_at >= since30);
      const FEE_BPS = 300;

      // ── Events ──
      const evs = (eventsAgg.data || []).filter((e) => e.kind == null || e.kind === "event");
      const upcoming = evs.filter((e) => e.starts_at > nowIso && String(e.status).toUpperCase() !== "DRAFT");
      const drafts = evs.filter((e) => String(e.status).toUpperCase() === "DRAFT");

      res.json({
        subscriptions: {
          active: active.length,
          byPlan,
          mrrSek: mrr,
          pastDue: pastDue.length,
          cancelling: cancelling.length,
          founding,
        },
        ticketSales: {
          allTimeSek: Math.round(sum(ok) / 100),
          last30Sek: Math.round(sum(last30) / 100),
          count: ok.length,
          last30Count: last30.length,
          estFeesSek: Math.round((sum(ok) * FEE_BPS) / 10000 / 100),
          byProvider: ok.reduce((m, p) => ((m[p.provider || "stripe"] = (m[p.provider || "stripe"] || 0) + 1), m), {}),
        },
        connectedAccounts: {
          count: (connects.data || []).length,
          hosts: (connects.data || []).map((p) => ({ id: p.id, name: p.name || p.brand || p.contact_email || p.id })),
        },
        events: {
          total: evs.length,
          upcoming: upcoming.length,
          drafts: drafts.length,
        },
        hosts: { total: hostsCount.count ?? null },
      });
    } catch (e) {
      console.error("[admin-overview] failed:", e?.message);
      res.status(500).json({ error: "overview_failed" });
    }
  });

  // Every located event, past and future — the expansion map. The client
  // filters by time/country/city; we just hand over the pins.
  app.get("/admin/events-map", requireAdmin, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from("events")
        .select("id, title, slug, status, kind, starts_at, location, location_lat, location_lng, host_id, total_capacity")
        .not("location_lat", "is", null)
        .order("starts_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      const evs = (data || []).filter((e) => e.kind == null || e.kind === "event");

      // Coming-counts in one batched read.
      const ids = evs.map((e) => e.id);
      const coming = new Map();
      if (ids.length) {
        const { data: rs } = await supabase.from("rsvps").select("event_id, status").in("event_id", ids);
        for (const r of rs || []) {
          if (r.status === "cancelled") continue;
          coming.set(r.event_id, (coming.get(r.event_id) || 0) + 1);
        }
      }
      // Host names for the pin cards.
      const hostIds = [...new Set(evs.map((e) => e.host_id).filter(Boolean))];
      const hostName = new Map();
      if (hostIds.length) {
        const { data: hs } = await supabase.from("profiles").select("id, name, brand").in("id", hostIds);
        for (const h of hs || []) hostName.set(h.id, h.name || h.brand || null);
      }

      res.json({
        events: evs.map((e) => ({
          id: e.id,
          title: e.title || "Untitled",
          slug: e.slug,
          status: e.status,
          startsAt: e.starts_at,
          location: e.location || "",
          lat: e.location_lat,
          lng: e.location_lng,
          coming: coming.get(e.id) || 0,
          capacity: e.total_capacity || null,
          host: hostName.get(e.host_id) || null,
        })),
      });
    } catch (e) {
      console.error("[admin-events-map] failed:", e?.message);
      res.status(500).json({ error: "events_map_failed" });
    }
  });
}
