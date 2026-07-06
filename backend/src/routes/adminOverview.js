// backend/src/routes/adminOverview.js
//
// The "how is PullUp actually going" read for the admin dashboard:
//   GET /admin/overview — subscriptions (mirror of Stripe state we hold),
//                         ticket sales, connected accounts, event counts
//   GET /admin/events-map — every event with coordinates + status + when,
//                           for the expansion map (filter client-side)
// One admin-gated read each, assembled from our own tables — the DB mirrors
// Stripe via webhooks, so this IS the Stripe view without an API round-trip.

import Stripe from "stripe";
import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../supabase.js";
import { getStripeSecretKey } from "../stripe.js";
import { TIERS } from "../config/subscriptions.js";

// Ticket-sales ledger starts at the subscription launch — anything earlier is
// Connect verification tests / imports, never host revenue.
const SALES_EPOCH = "2026-07-06";

// Ticket sales, STRAIGHT from Stripe: destination charges (transfer_data →
// a connected account) are exactly the ticket money — subscription invoices
// carry no transfer, so they can never leak in. Window in unix seconds.
async function stripeTicketSales(gte, lte) {
  const stripe = new Stripe(getStripeSecretKey());
  let sek = 0, count = 0, startingAfter;
  for (let page = 0; page < 20; page++) {
    const res = await stripe.charges.list({
      created: { gte, lte }, limit: 100, ...(startingAfter ? { starting_after: startingAfter } : {}),
    });
    for (const c of res.data) {
      if (!c.paid || c.status !== "succeeded") continue;
      if (!c.transfer_data?.destination) continue; // not a ticket charge
      sek += (c.amount - (c.amount_refunded || 0)) / 100;
      count += 1;
    }
    if (!res.has_more) break;
    startingAfter = res.data[res.data.length - 1]?.id;
  }
  return { sek: Math.round(sek), count };
}

export function registerAdminOverviewRoutes(app) {
  app.get("/admin/overview", requireAdmin, async (req, res) => {
    try {
      const nowIso = new Date().toISOString();
      // Sales window: ?from=YYYY-MM-DD&to=YYYY-MM-DD; defaults = launch → now.
      const parseDay = (v, fallback) => {
        const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? `${v}T00:00:00Z` : NaN);
        return Number.isNaN(d.getTime()) ? fallback : d;
      };
      const fromDate = parseDay(req.query.from, new Date(`${SALES_EPOCH}T00:00:00Z`));
      const toDate = parseDay(req.query.to, new Date());
      const gte = Math.floor(fromDate.getTime() / 1000);
      const lte = Math.floor(toDate.getTime() / 1000) + 86400; // inclusive of the picked end day

      const [plans, connects, eventsAgg, hostsCount, sales] = await Promise.all([
        supabase.from("creator_billing_plans").select("host_id, plan, subscription_status, founding, cancel_at_period_end, current_period_end, stripe_subscription_id"),
        supabase.from("profiles").select("id, name, brand, contact_email").not("stripe_connected_account_id", "is", null),
        supabase.from("events").select("id, status, starts_at, kind"),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        stripeTicketSales(gte, lte).catch((e) => {
          console.error("[admin-overview] stripe sales failed:", e?.message);
          return { sek: null, count: null }; // Stripe down ≠ dashboard down
        }),
      ]);

      // ── Subscriptions (the Stripe mirror we keep via webhooks) ──
      // Only rows with a real Stripe subscription behind them count: probe
      // hosts get grantHosting'd "active" rows with no stripe ids, and a
      // crashed gate run can leave one behind — it must never read as MRR.
      const allRows = plans.data || [];
      const rows = allRows.filter((r) => r.stripe_subscription_id);
      const active = rows.filter((r) => r.subscription_status === "active");
      const pastDue = rows.filter((r) => r.subscription_status === "past_due");
      const cancelling = active.filter((r) => r.cancel_at_period_end);
      const founding = allRows.filter((r) => r.founding === true).length;
      const mrr = active.reduce((s, r) => s + (TIERS[r.plan]?.priceSek ?? TIERS.creator?.priceSek ?? 0), 0);
      const byPlan = {};
      for (const r of active) byPlan[r.plan || "creator"] = (byPlan[r.plan || "creator"] || 0) + 1;

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
          sek: sales.sek, // null = Stripe unreachable (FE shows —)
          count: sales.count,
          from: fromDate.toISOString().slice(0, 10),
          to: toDate.toISOString().slice(0, 10),
          launch: SALES_EPOCH,
          source: "stripe",
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
