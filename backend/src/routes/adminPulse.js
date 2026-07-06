// backend/src/routes/adminPulse.js
//
// The two questions the dashboard's deep views answer:
//   GET /admin/pulse    — is PullUp more alive than last week? 8 weeks of the
//                         weekly rhythm: pull-ups, RSVPs, events published,
//                         hosts active, messages sent.
//   GET /admin/journeys — who needs us? Every host positioned on the
//                         activation ladder (signed up → published → RSVPs →
//                         pull-ups → repeat → paying), sorted stalled-first
//                         so each row is a concierge action, not a statistic.

import { requireAdmin } from "../middleware/auth.js";
import { supabase } from "../supabase.js";

const WEEK_MS = 7 * 86400_000;

function weekStart(d) {
  const x = new Date(d);
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export function registerAdminPulseRoutes(app) {
  app.get("/admin/pulse", requireAdmin, async (req, res) => {
    try {
      const WEEKS = 8;
      const start = new Date(weekStart(new Date()).getTime() - (WEEKS - 1) * WEEK_MS);
      const sinceIso = start.toISOString();

      const [pe, rs, evs] = await Promise.all([
        supabase.from("person_events").select("type, occurred_at, host_id").gte("occurred_at", sinceIso).limit(20000),
        supabase.from("rsvps").select("created_at, status").gte("created_at", sinceIso).limit(20000),
        supabase.from("events").select("created_at, status, kind, host_id").gte("created_at", sinceIso),
      ]);

      const weeks = Array.from({ length: WEEKS }, (_, i) => {
        const ws = new Date(start.getTime() + i * WEEK_MS);
        return {
          week: ws.toISOString().slice(0, 10),
          pullups: 0,
          rsvps: 0,
          published: 0,
          activeHosts: new Set(),
          messages: 0,
        };
      });
      const idx = (iso) => {
        const i = Math.floor((weekStart(new Date(iso)).getTime() - start.getTime()) / WEEK_MS);
        return i >= 0 && i < WEEKS ? i : -1;
      };

      for (const e of pe.data || []) {
        const i = idx(e.occurred_at);
        if (i < 0) continue;
        if (e.type === "attended") weeks[i].pullups += 1;
        if (e.type === "message_out") weeks[i].messages += 1;
        if (e.host_id) weeks[i].activeHosts.add(e.host_id);
      }
      for (const r of rs.data || []) {
        if (r.status === "cancelled") continue;
        const i = idx(r.created_at);
        if (i >= 0) weeks[i].rsvps += 1;
      }
      for (const e of evs.data || []) {
        if (e.kind != null && e.kind !== "event") continue;
        if (String(e.status).toUpperCase() === "DRAFT") continue;
        const i = idx(e.created_at);
        if (i >= 0) {
          weeks[i].published += 1;
          if (e.host_id) weeks[i].activeHosts.add(e.host_id);
        }
      }

      res.json({
        weeks: weeks.map((w) => ({ ...w, activeHosts: w.activeHosts.size })),
      });
    } catch (e) {
      console.error("[admin-pulse] failed:", e?.message);
      res.status(500).json({ error: "pulse_failed" });
    }
  });

  app.get("/admin/journeys", requireAdmin, async (req, res) => {
    try {
      const [profiles, evs, billing, admins, attended] = await Promise.all([
        supabase.from("profiles").select("id, name, brand, contact_email, created_at"),
        supabase.from("events").select("id, host_id, status, kind, created_at, starts_at"),
        supabase.from("creator_billing_plans").select("host_id, subscription_status, founding, stripe_subscription_id"),
        supabase.from("platform_admins").select("user_id"),
        supabase.from("person_events").select("host_id, type").eq("type", "attended").limit(50000),
      ]);

      const adminIds = new Set((admins.data || []).map((a) => a.user_id).filter(Boolean));

      // Events per host (real events only, drafts counted separately).
      const byHost = new Map();
      const eventIds = [];
      for (const e of evs.data || []) {
        if (e.kind != null && e.kind !== "event") continue;
        if (!e.host_id) continue;
        if (!byHost.has(e.host_id)) byHost.set(e.host_id, { published: 0, drafts: 0, lastEventAt: null, eventIds: [] });
        const h = byHost.get(e.host_id);
        if (String(e.status).toUpperCase() === "DRAFT") h.drafts += 1;
        else {
          h.published += 1;
          h.eventIds.push(e.id);
          eventIds.push(e.id);
          if (!h.lastEventAt || e.created_at > h.lastEventAt) h.lastEventAt = e.created_at;
        }
      }

      // RSVPs per event → per host (chunked .in()).
      const rsvpsByEvent = new Map();
      for (let i = 0; i < eventIds.length; i += 100) {
        const chunk = eventIds.slice(i, i + 100);
        const { data } = await supabase.from("rsvps").select("event_id, status").in("event_id", chunk);
        for (const r of data || []) {
          if (r.status === "cancelled") continue;
          rsvpsByEvent.set(r.event_id, (rsvpsByEvent.get(r.event_id) || 0) + 1);
        }
      }

      const attendedByHost = new Map();
      for (const a of attended.data || []) {
        if (a.host_id) attendedByHost.set(a.host_id, (attendedByHost.get(a.host_id) || 0) + 1);
      }
      const plan = new Map();
      for (const b of billing.data || []) plan.set(b.host_id, b);

      const now = Date.now();
      const days = (iso) => (iso ? Math.floor((now - new Date(iso).getTime()) / 86400_000) : null);

      const hosts = (profiles.data || [])
        .filter((p) => !adminIds.has(p.id) && !String(p.contact_email || "").endsWith("@pullup.se"))
        .map((p) => {
          const h = byHost.get(p.id) || { published: 0, drafts: 0, lastEventAt: null, eventIds: [] };
          const rsvps = h.eventIds.reduce((s, id) => s + (rsvpsByEvent.get(id) || 0), 0);
          const pullups = attendedByHost.get(p.id) || 0;
          const b = plan.get(p.id);
          const paying = !!(b && b.stripe_subscription_id && b.subscription_status === "active");
          const founding = !!b?.founding;

          // The ladder. Highest rung wins.
          let stage, stageRank, detail;
          if (paying) {
            stage = "paying"; stageRank = 6;
            detail = `${h.published} events · ${rsvps} RSVPs`;
          } else if (h.published >= 2) {
            stage = "repeat host"; stageRank = 5;
            detail = `${h.published} events · last ${days(h.lastEventAt)}d ago`;
          } else if (pullups > 0) {
            stage = "first pull-ups"; stageRank = 4;
            detail = `${pullups} pull-ups · ${rsvps} RSVPs — worth a nudge to go again`;
          } else if (rsvps > 0) {
            stage = "got RSVPs"; stageRank = 3;
            detail = `${rsvps} RSVPs on ${h.published} event${h.published === 1 ? "" : "s"}`;
          } else if (h.published >= 1) {
            stage = "published, no guests"; stageRank = 2;
            detail = `published ${days(h.lastEventAt)}d ago · 0 RSVPs — help them fill it`;
          } else if (h.drafts > 0) {
            stage = "drafting"; stageRank = 1;
            detail = `${h.drafts} draft${h.drafts === 1 ? "" : "s"}, nothing published`;
          } else {
            stage = "signed up"; stageRank = 0;
            detail = `joined ${days(p.created_at)}d ago, no event yet`;
          }

          return {
            hostId: p.id,
            name: p.name || p.brand || p.contact_email || "Unknown",
            email: p.contact_email || null,
            stage,
            stageRank,
            detail,
            founding,
            published: h.published,
            rsvps,
            pullups,
            joinedDaysAgo: days(p.created_at),
          };
        });

      // Stalled-first: the rows where a nudge moves the needle — mid-ladder
      // (published/drafting/RSVPs) before fresh signups, paying last.
      const actionability = { 2: 0, 3: 1, 4: 2, 1: 3, 0: 4, 5: 5, 6: 6 };
      hosts.sort((a, b) => (actionability[a.stageRank] - actionability[b.stageRank]) || (b.joinedDaysAgo ?? 0) - (a.joinedDaysAgo ?? 0));

      res.json({ hosts, ladder: ["signed up", "drafting", "published, no guests", "got RSVPs", "first pull-ups", "repeat host", "paying"] });
    } catch (e) {
      console.error("[admin-journeys] failed:", e?.message);
      res.status(500).json({ error: "journeys_failed" });
    }
  });
}
