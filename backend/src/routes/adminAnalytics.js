// Admin analytics series (pageviews, landing funnel, activity/signups series, partner clicks)
// + platform-event list/tagging (admin tags, AI auto-tag, admin guest list).

import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { resolveAnalyticsRange } from "../lib/analyticsRange.js";
import {
  findEventById,
  getRsvpsForEvent,
  mapEventFromDb,
  getUserEventIds,
} from "../data.js";

export function registerAdminAnalyticsRoutes(app) {
  // GET /admin/analytics/pageviews — daily page views for a date range
  app.get("/admin/analytics/pageviews", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { periodStart, periodEnd, days: numDays } = resolveAnalyticsRange(req);

      // Previous period of equal length, immediately before the current range,
      // so the change-indicator math compares like-for-like.
      const prevEnd = new Date(periodStart.getTime() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - numDays + 1);
      prevStart.setHours(0, 0, 0, 0);

      // Try new per-row table first
      let currentRows = [];
      let prevRows = [];
      let useNewTable = false;

      try {
        const [{ data: views, error: viewsErr }, { data: pv, error: pvErr }] = await Promise.all([
          supabase.from("landing_page_views")
            .select("id, visitor_id, referrer, source, device_type, created_at")
            .gte("created_at", periodStart.toISOString())
            .lte("created_at", periodEnd.toISOString())
            .order("created_at", { ascending: false }),
          supabase.from("landing_page_views")
            .select("id, visitor_id, source, created_at")
            .gte("created_at", prevStart.toISOString())
            .lte("created_at", prevEnd.toISOString()),
        ]);
        if (!viewsErr && views && views.length > 0) {
          currentRows = views;
          prevRows = pv || [];
          useNewTable = true;
        }
      } catch (e) {
        // Table doesn't exist yet — fall through to legacy
      }

      // Fallback to legacy page_views_daily if new table empty/missing
      if (!useNewTable) {
        const startStr = periodStart.toISOString().slice(0, 10);
        const prevStartStr = prevStart.toISOString().slice(0, 10);

        const { data, error } = await supabase
          .from("page_views_daily")
          .select("date, views, unique_visitors")
          .eq("page", "landing")
          .gte("date", prevStartStr)
          .order("date", { ascending: true });

        if (error) throw error;

        const rows = data || [];
        const daily = [];
        for (let i = 0; i < numDays; i++) {
          const d = new Date(periodStart);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().slice(0, 10);
          const row = rows.find((r) => r.date === dateStr);
          daily.push({
            date: dateStr,
            views: row?.unique_visitors || row?.views || 0,
            bySource: (row?.unique_visitors || row?.views) ? { direct: row?.unique_visitors || row?.views || 0 } : {},
          });
        }

        const totalViews = daily.reduce((s, r) => s + r.views, 0);
        const prevDaily = [];
        for (let i = 0; i < numDays; i++) {
          const d = new Date(prevStart);
          d.setDate(d.getDate() + i);
          const dateStr = d.toISOString().slice(0, 10);
          const row = rows.find((r) => r.date === dateStr);
          prevDaily.push({ views: row?.unique_visitors || row?.views || 0 });
        }
        const prevTotalViews = prevDaily.reduce((s, r) => s + r.views, 0);

        return res.json({
          daily,
          sources: totalViews > 0 ? [{ source: "direct", count: totalViews, percentage: 100 }] : [],
          totalViews,
          uniqueVisitors: totalViews,
          prevTotalViews,
          prevUniqueVisitors: prevTotalViews,
          viewsChange: prevTotalViews > 0 ? Math.round(((totalViews - prevTotalViews) / prevTotalViews) * 100) : null,
          uniqueChange: prevTotalViews > 0 ? Math.round(((totalViews - prevTotalViews) / prevTotalViews) * 100) : null,
          device_split: null,
          legacy: true,
        });
      }

      // --- New table path: full source-per-day analytics ---
      const uniqueVisitors = new Set(currentRows.map(v => v.visitor_id).filter(Boolean)).size;
      const prevUniqueVisitors = new Set(prevRows.map(v => v.visitor_id).filter(Boolean)).size;

      // Source breakdown
      const sourceVisitorMap = {};
      for (const v of currentRows) {
        const src = v.source || "direct";
        if (!sourceVisitorMap[src]) sourceVisitorMap[src] = new Set();
        sourceVisitorMap[src].add(v.visitor_id || v.id);
      }
      const sources = Object.entries(sourceVisitorMap)
        .map(([source, visitors]) => ({
          source,
          count: visitors.size,
          percentage: uniqueVisitors > 0 ? Math.round((visitors.size / uniqueVisitors) * 1000) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count);

      // Daily data with source stacking
      const dailyMap = {};
      const dailyVisitorSets = {};
      const cursor = new Date(periodStart);
      while (cursor <= periodEnd) {
        const day = cursor.toISOString().slice(0, 10);
        dailyMap[day] = { date: day, views: 0, bySource: {} };
        dailyVisitorSets[day] = { total: new Set(), bySource: {} };
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const v of currentRows) {
        const day = v.created_at.slice(0, 10);
        if (!dailyMap[day]) {
          dailyMap[day] = { date: day, views: 0, bySource: {} };
          dailyVisitorSets[day] = { total: new Set(), bySource: {} };
        }
        const vid = v.visitor_id || v.id;
        const src = v.source || "direct";
        dailyVisitorSets[day].total.add(vid);
        if (!dailyVisitorSets[day].bySource[src]) dailyVisitorSets[day].bySource[src] = new Set();
        dailyVisitorSets[day].bySource[src].add(vid);
      }
      for (const day of Object.keys(dailyMap)) {
        dailyMap[day].views = dailyVisitorSets[day].total.size;
        for (const [src, visitors] of Object.entries(dailyVisitorSets[day].bySource)) {
          dailyMap[day].bySource[src] = visitors.size;
        }
      }
      const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      // Device split
      const deviceVisitors = { mobile: new Set(), desktop: new Set() };
      for (const v of currentRows) {
        const dt = (v.device_type || "").toLowerCase();
        const vid = v.visitor_id || v.id;
        if (dt === "mobile") deviceVisitors.mobile.add(vid);
        else deviceVisitors.desktop.add(vid);
      }

      const totalViews = currentRows.length;
      const prevTotalViews = prevRows.length;

      return res.json({
        daily,
        sources,
        totalViews,
        uniqueVisitors,
        prevTotalViews,
        prevUniqueVisitors,
        viewsChange: prevTotalViews > 0 ? Math.round(((totalViews - prevTotalViews) / prevTotalViews) * 100) : null,
        uniqueChange: prevUniqueVisitors > 0 ? Math.round(((uniqueVisitors - prevUniqueVisitors) / prevUniqueVisitors) * 100) : null,
        device_split: { mobile: deviceVisitors.mobile.size, desktop: deviceVisitors.desktop.size },
      });
    } catch (err) {
      console.error("[pageviews] error:", err.message);
      return res.status(500).json({ error: "Failed to fetch pageviews" });
    }
  });

  // ---------------------------
  // Admin: Platform-wide events overview
  // ---------------------------
  app.get("/admin/platform-events", requireAdmin, async (req, res) => {
    try {
      const { supabase: sb } = await import("../supabase.js");
      const { filter = "upcoming" } = req.query;

      // Optional pagination. When `limit` is supplied the admin Analytics → All
      // Events tab pages through results (upcoming soonest-first, then past
      // newest-first); without it, callers get the legacy behaviour.
      const limit = req.query.limit != null
        ? Math.min(Math.max(parseInt(req.query.limit, 10) || 0, 1), 100)
        : null;
      const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

      const now = new Date().toISOString();
      const ascending = filter === "upcoming"; // upcoming: soonest first; past/all: newest first
      let query = sb
        .from("events")
        .select("id, slug, title, starts_at, ends_at, location, status, host_id, total_capacity, cocktail_capacity, ticket_type, created_at, admin_tags")
        .order("starts_at", { ascending });

      if (filter === "upcoming") {
        query = query.gte("starts_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()); // include recently started
      } else if (filter === "past") {
        query = query.lt("starts_at", now);
      }
      // filter === "all" — no date filter

      if (limit != null) {
        query = query.range(offset, offset + limit - 1);
      } else if (filter === "past") {
        query = query.limit(50); // legacy default for the Platform Events page
      }

      const { data: events, error } = await query;
      if (error) throw error;

      const hasMore = limit != null && (events || []).length === limit;

      // Batch-fetch RSVP counts + host info
      const eventIds = (events || []).map(e => e.id);
      const hostIds = [...new Set((events || []).map(e => e.host_id).filter(Boolean))];

      const [{ data: rsvps }, { data: hosts }, { data: eventHosts }] = await Promise.all([
        eventIds.length > 0
          ? sb.from("rsvps").select("event_id, party_size, total_guests, booking_status, status").in("event_id", eventIds)
          : { data: [] },
        hostIds.length > 0
          ? sb.from("profiles").select("id, name, brand, contact_email").in("id", hostIds)
          : { data: [] },
        eventIds.length > 0
          ? sb.from("event_hosts").select("event_id, user_id, role").in("event_id", eventIds)
          : { data: [] },
      ]);

      const hostMap = {};
      for (const h of (hosts || [])) hostMap[h.id] = h;

      // Count confirmed RSVPs per event
      const rsvpCountMap = {};
      for (const r of (rsvps || [])) {
        if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
          if (!rsvpCountMap[r.event_id]) rsvpCountMap[r.event_id] = 0;
          rsvpCountMap[r.event_id] += (r.total_guests ?? r.party_size ?? 1);
        }
      }

      const result = (events || []).map(ev => {
        const host = hostMap[ev.host_id];
        const capacity = ev.total_capacity || ev.cocktail_capacity || 0;
        return {
          id: ev.id,
          slug: ev.slug,
          title: ev.title,
          startsAt: ev.starts_at,
          endsAt: ev.ends_at,
          location: ev.location,
          status: ev.status,
          ticketType: ev.ticket_type,
          createdAt: ev.created_at,
          capacity,
          confirmedGuests: rsvpCountMap[ev.id] || 0,
          adminTags: Array.isArray(ev.admin_tags) ? ev.admin_tags : [],
          hostId: ev.host_id || null,
          host: host ? { id: host.id, name: host.name, brand: host.brand, email: host.contact_email } : null,
        };
      });

      return res.json({ events: result, hasMore });
    } catch (err) {
      console.error("[admin/platform-events] error:", err.message);
      return res.status(500).json({ error: "Failed to fetch events" });
    }
  });

  // Admin: PATCH /admin/platform-events/:id/tags — set internal classification
  // tags for an event. Admin-only metadata; never exposed to hosts or guests.
  // Body: { tags: string[] }  (also accepts comma-separated string for convenience)
  app.patch("/admin/platform-events/:id/tags", requireAdmin, async (req, res) => {
    try {
      const { supabase: sb } = await import("../supabase.js");
      const { id } = req.params;
      const raw = req.body?.tags;
      let tags = [];
      if (Array.isArray(raw)) {
        tags = raw;
      } else if (typeof raw === "string") {
        tags = raw.split(",");
      }
      tags = tags
        .map((t) => (typeof t === "string" ? t.trim().toLowerCase() : ""))
        .filter(Boolean);
      // Dedupe, cap to 32 tags per event so a stray paste can't blow the row up.
      tags = [...new Set(tags)].slice(0, 32);

      const { data, error } = await sb
        .from("events")
        .update({ admin_tags: tags })
        .eq("id", id)
        .select("id, admin_tags")
        .single();
      if (error) throw error;
      return res.json({ id: data.id, adminTags: data.admin_tags || [] });
    } catch (err) {
      console.error("[admin/platform-events/tags] error:", err.message);
      return res.status(500).json({ error: "Failed to update tags" });
    }
  });

  // Admin: POST /admin/platform-events/:id/auto-tag — let Claude generate tags
  // for an event and merge them with whatever's already there. Never destroys
  // manual edits.
  app.post("/admin/platform-events/:id/auto-tag", requireAdmin, async (req, res) => {
    try {
      const { supabase: sb } = await import("../supabase.js");
      const { generateTagsForEvent, getTagVocabulary, mergeTags } = await import(
        "../services/aiTaggingService.js"
      );

      const { id } = req.params;
      const { data: dbEvent, error: fetchErr } = await sb
        .from("events")
        .select("*")
        .eq("id", id)
        .single();
      if (fetchErr || !dbEvent) {
        return res.status(404).json({ error: "Event not found" });
      }

      const event = await mapEventFromDb(dbEvent);
      const vocabulary = await getTagVocabulary(sb);
      const generated = await generateTagsForEvent(event, vocabulary);
      const merged = mergeTags(event.adminTags, generated);

      const { data, error } = await sb
        .from("events")
        .update({ admin_tags: merged })
        .eq("id", id)
        .select("id, admin_tags")
        .single();
      if (error) throw error;

      return res.json({
        id: data.id,
        adminTags: data.admin_tags || [],
        generatedTags: generated,
        addedCount: (data.admin_tags || []).length - (event.adminTags || []).length,
      });
    } catch (err) {
      console.error("[admin/platform-events/auto-tag] error:", err.message);
      return res.status(500).json({ error: err.message || "Auto-tag failed" });
    }
  });

  // Host: POST /events/:id/auto-tag — host-facing version of the same flow.
  // Ownership-gated: the requester must be a host of the event.
  app.post("/events/:id/auto-tag", requireAuth, async (req, res) => {
    try {
      const { supabase: sb } = await import("../supabase.js");
      const { generateTagsForEvent, getTagVocabulary, mergeTags } = await import(
        "../services/aiTaggingService.js"
      );

      const { id } = req.params;
      const userEventIds = await getUserEventIds(req.user.id);
      if (!userEventIds.includes(id)) {
        return res.status(403).json({ error: "Not a host of this event" });
      }

      const { data: dbEvent, error: fetchErr } = await sb
        .from("events")
        .select("*")
        .eq("id", id)
        .single();
      if (fetchErr || !dbEvent) {
        return res.status(404).json({ error: "Event not found" });
      }

      const event = await mapEventFromDb(dbEvent);
      const vocabulary = await getTagVocabulary(sb);
      const generated = await generateTagsForEvent(event, vocabulary);
      const merged = mergeTags(event.adminTags, generated);

      const { data, error } = await sb
        .from("events")
        .update({ admin_tags: merged })
        .eq("id", id)
        .select("id, admin_tags")
        .single();
      if (error) throw error;

      return res.json({
        id: data.id,
        adminTags: data.admin_tags || [],
        generatedTags: generated,
        addedCount: (data.admin_tags || []).length - (event.adminTags || []).length,
      });
    } catch (err) {
      console.error("[events/auto-tag] error:", err.message);
      return res.status(500).json({ error: err.message || "Auto-tag failed" });
    }
  });

  // Admin: View guest list for any event (bypasses host ownership check)
  app.get("/admin/platform-events/:id/guests", requireAdmin, async (req, res) => {
    try {
      const event = await findEventById(req.params.id);
      if (!event) return res.status(404).json({ error: "Event not found" });

      const guests = await getRsvpsForEvent(event.id);
      res.json({ event, guests });
    } catch (err) {
      console.error("[admin/platform-events/guests] error:", err.message);
      return res.status(500).json({ error: "Failed to fetch guests" });
    }
  });

  // ---------------------------
  // Admin: Landing page conversion funnel
  // ---------------------------
  // GET /admin/analytics/landing-funnel?days=14
  // Returns unique-visitor counts for each funnel stage over the period,
  // plus a by-source breakdown so we can see which channels convert.
  //
  // Stages (ordered):
  //   1. view         — unique visitors in landing_page_views
  //   2. cta_click    — clicked the hero or nav CTA
  //   3. auth_start   — submitted email form OR clicked Continue with Google
  //   4. signed_in    — actually made it to /events signed in
  //
  // Same visitor_id is counted at most once per stage, so the numbers are
  // strictly monotonically non-increasing — later stages only count visitors
  // who also hit the earlier ones.
  app.get("/admin/analytics/landing-funnel", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { periodStart, periodEnd, days: numDays } = resolveAnalyticsRange(req);

      const [viewsRes, eventsRes] = await Promise.all([
        supabase
          .from("landing_page_views")
          .select("visitor_id, source")
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
        supabase
          .from("landing_page_events")
          .select("visitor_id, event_name, props")
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
      ]);

      if (viewsRes.error) throw viewsRes.error;
      if (eventsRes.error) throw eventsRes.error;

      const views = viewsRes.data || [];
      const events = eventsRes.data || [];

      // Build per-stage visitor sets. Enforce monotonic funnel: a visitor
      // only counts at a later stage if they also hit the earlier ones.
      const viewers = new Set(views.map((v) => v.visitor_id).filter(Boolean));
      const visitorSource = {};
      for (const v of views) {
        if (!v.visitor_id) continue;
        // first seen source wins (landing_page_views inserts are ordered by time)
        if (!(v.visitor_id in visitorSource)) visitorSource[v.visitor_id] = v.source || "direct";
      }

      const clickers = new Set();
      // 3 onboarding step buckets: 0 = Name, 1 = Brand, 2 = Auth screen.
      const stepViews = [new Set(), new Set(), new Set()];
      const authStarters = new Set();
      const signedIn = new Set();
      for (const e of events) {
        if (!e.visitor_id) continue;
        if (!viewers.has(e.visitor_id)) continue; // enforce funnel — must have viewed
        if (e.event_name === "cta_click") clickers.add(e.visitor_id);
        else if (e.event_name === "onboarding_step_view") {
          const step = Number(e.props?.step);
          if (Number.isInteger(step) && step >= 0 && step < stepViews.length) {
            stepViews[step].add(e.visitor_id);
          }
        } else if (e.event_name === "auth_start") authStarters.add(e.visitor_id);
        else if (e.event_name === "signed_in") signedIn.add(e.visitor_id);
      }
      // Strict monotonic funnel — every downstream stage is a subset of the
      // immediately upstream stage. This prevents traffic from outside the
      // onboarding flow (e.g. PublishAuthModal sign-ins from /create, or old
      // pre-redesign auth events still in the 30-day window) from inflating
      // counts below the auth-screen step.
      const clickersFinal = clickers;
      const step0Final = new Set([...stepViews[0]].filter((v) => clickersFinal.has(v)));
      const step1Final = new Set([...stepViews[1]].filter((v) => step0Final.has(v)));
      const step2Final = new Set([...stepViews[2]].filter((v) => step1Final.has(v)));
      const authStartersFinal = new Set([...authStarters].filter((v) => step2Final.has(v)));
      const signedInFinal = new Set([...signedIn].filter((v) => authStartersFinal.has(v)));

      const stages = [
        { key: "view", label: "Viewed landing", count: viewers.size },
        { key: "cta_click", label: "Clicked CTA", count: clickersFinal.size },
        { key: "step_name", label: "Step 1 · Name", count: step0Final.size },
        { key: "step_brand", label: "Step 2 · Brand", count: step1Final.size },
        { key: "step_auth", label: "Step 3 · Claim it", count: step2Final.size },
        { key: "auth_start", label: "Pressed sign-in", count: authStartersFinal.size },
        { key: "signed_in", label: "Account created", count: signedInFinal.size },
      ];
      for (let i = 0; i < stages.length; i++) {
        const prev = i === 0 ? stages[0].count : stages[i - 1].count;
        stages[i].pctOfView = stages[0].count > 0
          ? Math.round((stages[i].count / stages[0].count) * 1000) / 10
          : 0;
        stages[i].pctOfPrev = prev > 0
          ? Math.round((stages[i].count / prev) * 1000) / 10
          : 0;
      }

      // By-source breakdown: split each stage by the visitor's first-seen source
      const sourceOf = (visitorId) => visitorSource[visitorId] || "direct";
      const bySource = {};
      const upsert = (src, key) => {
        if (!bySource[src]) bySource[src] = { view: 0, cta_click: 0, auth_start: 0, signed_in: 0 };
        bySource[src][key] += 1;
      };
      for (const vid of viewers) upsert(sourceOf(vid), "view");
      for (const vid of clickersFinal) upsert(sourceOf(vid), "cta_click");
      for (const vid of authStartersFinal) upsert(sourceOf(vid), "auth_start");
      for (const vid of signedInFinal) upsert(sourceOf(vid), "signed_in");
      const sources = Object.entries(bySource)
        .map(([source, counts]) => ({ source, ...counts }))
        .sort((a, b) => b.view - a.view);

      return res.json({
        periodDays: numDays,
        stages,
        sources,
      });
    } catch (err) {
      console.error("[admin/landing-funnel] error:", err.message);
      return res.status(500).json({ error: "Failed to fetch funnel" });
    }
  });


  // ---------------------------
  // Admin: Activity time-series — events CREATED per day (bars) + RSVPs
  // collected per day (line). The two velocity KPIs: are hosts publishing,
  // are guests engaging across the platform.
  //
  // Bars are keyed by events.created_at (publication moment) — not
  // starts_at — because the question we're answering is "are users
  // creating events", not "are there events scheduled to occur today".
  //
  // "Emails collected" counts every RSVP row created that day across every
  // event on PullUp. We deliberately don't dedupe by email — each RSVP is
  // an email-submission event regardless of whether that person has RSVP'd
  // before. (For unique contact-list growth there's the `people` table,
  // but raw RSVP volume is the truer engagement signal.)
  // ---------------------------
  app.get("/admin/analytics/activity-series", requireAdmin, async (req, res) => {
    try {
      const { supabase: sb } = await import("../supabase.js");
      const { periodStart, periodEnd, days } = resolveAnalyticsRange(req);

      // Previous period of equal length for like-for-like change indicators.
      const prevEnd = new Date(periodStart.getTime() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - days + 1);
      prevStart.setHours(0, 0, 0, 0);

      const [eventsRes, rsvpsRes, prevEventsRes, prevRsvpsRes] = await Promise.all([
        sb
          .from("events")
          .select("created_at")
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
        sb
          .from("rsvps")
          .select("created_at")
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
        sb
          .from("events")
          .select("*", { count: "exact", head: true })
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString()),
        sb
          .from("rsvps")
          .select("*", { count: "exact", head: true })
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString()),
      ]);

      const eventCounts = {};
      for (const e of eventsRes.data || []) {
        const d = (e.created_at || "").slice(0, 10);
        if (d) eventCounts[d] = (eventCounts[d] || 0) + 1;
      }

      const rsvpCounts = {};
      for (const r of rsvpsRes.data || []) {
        const d = (r.created_at || "").slice(0, 10);
        if (d) rsvpCounts[d] = (rsvpCounts[d] || 0) + 1;
      }

      const buckets = [];
      for (
        let t = periodStart.getTime();
        t <= periodEnd.getTime();
        t += 24 * 60 * 60 * 1000
      ) {
        const d = new Date(t).toISOString().slice(0, 10);
        buckets.push({
          date: d,
          eventsCreated: eventCounts[d] || 0,
          rsvps: rsvpCounts[d] || 0,
        });
      }

      const totalEvents = (eventsRes.data || []).length;
      const totalRsvps = (rsvpsRes.data || []).length;
      const prevTotalEvents = prevEventsRes.count || 0;
      const prevTotalRsvps = prevRsvpsRes.count || 0;
      const eventsChange = prevTotalEvents > 0
        ? Math.round(((totalEvents - prevTotalEvents) / prevTotalEvents) * 100)
        : null;
      const rsvpsChange = prevTotalRsvps > 0
        ? Math.round(((totalRsvps - prevTotalRsvps) / prevTotalRsvps) * 100)
        : null;

      return res.json({
        periodDays: days,
        totalEvents,
        totalRsvps,
        prevTotalEvents,
        prevTotalRsvps,
        eventsChange,
        rsvpsChange,
        buckets,
      });
    } catch (err) {
      console.error("[activity-series] error:", err.message);
      return res.status(500).json({ error: "Failed to fetch activity series" });
    }
  });

  // ---------------------------
  // Admin: New-account signups time-series. Pairs with the landing-page
  // conversion funnel — answers "how many people actually finished signup
  // each day?". Bars for daily count, a cumulative line for momentum.
  // ---------------------------
  app.get("/admin/analytics/signups-series", requireAdmin, async (req, res) => {
    try {
      const { supabase: sb } = await import("../supabase.js");
      const { periodStart, periodEnd, days } = resolveAnalyticsRange(req);

      // Previous period of equal length, immediately before the current range,
      // so the change indicator compares like-for-like (matches /pageviews).
      const prevEnd = new Date(periodStart.getTime() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - days + 1);
      prevStart.setHours(0, 0, 0, 0);

      const [{ data: profiles }, { count: prevCount }, { count: preCount }] = await Promise.all([
        sb.from("profiles")
          .select("created_at")
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString()),
        sb.from("profiles")
          .select("*", { count: "exact", head: true })
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString()),
        sb.from("profiles")
          .select("*", { count: "exact", head: true })
          .lt("created_at", periodStart.toISOString()),
      ]);

      const dailyCounts = {};
      for (const p of profiles || []) {
        const d = (p.created_at || "").slice(0, 10);
        if (d) dailyCounts[d] = (dailyCounts[d] || 0) + 1;
      }

      let cumulative = preCount || 0;
      const buckets = [];
      for (
        let t = periodStart.getTime();
        t <= periodEnd.getTime();
        t += 24 * 60 * 60 * 1000
      ) {
        const d = new Date(t).toISOString().slice(0, 10);
        const daily = dailyCounts[d] || 0;
        cumulative += daily;
        buckets.push({
          date: d,
          signups: daily,
          cumulativeSignups: cumulative,
        });
      }

      const totalSignups = (profiles || []).length;
      const prevTotalSignups = prevCount || 0;
      const signupsChange = prevTotalSignups > 0
        ? Math.round(((totalSignups - prevTotalSignups) / prevTotalSignups) * 100)
        : null;

      return res.json({
        periodDays: days,
        preCumulativeSignups: preCount || 0,
        totalSignups,
        prevTotalSignups,
        signupsChange,
        buckets,
      });
    } catch (err) {
      console.error("[signups-series] error:", err.message);
      return res.status(500).json({ error: "Failed to fetch signups series" });
    }
  });

  // ---------------------------
  // Admin: Partner CTA click analytics
  // ---------------------------
  app.get("/admin/analytics/partner-clicks", requireAdmin, async (req, res) => {
    try {
      const { supabase } = await import("../supabase.js");
      const { periodStart, periodEnd, days: numDays } = resolveAnalyticsRange(req);

      const { data: clicks, error } = await supabase
        .from("partner_clicks")
        .select("id, partner_slug, event_id, placement, clicked_at, ip_address, user_id")
        .gte("clicked_at", periodStart.toISOString())
        .lte("clicked_at", periodEnd.toISOString())
        .order("clicked_at", { ascending: false });

      if (error) throw error;

      const rows = clicks || [];

      // Per-partner breakdown
      const partnerMap = {};
      for (const c of rows) {
        const slug = c.partner_slug;
        if (!partnerMap[slug]) partnerMap[slug] = { total: 0, unique: new Set(), daily: {} };
        partnerMap[slug].total++;
        partnerMap[slug].unique.add(c.ip_address || c.id);
        const day = c.clicked_at.slice(0, 10);
        if (!partnerMap[slug].daily[day]) partnerMap[slug].daily[day] = 0;
        partnerMap[slug].daily[day]++;
      }

      const partners = Object.entries(partnerMap).map(([slug, data]) => ({
        slug,
        total: data.total,
        unique: data.unique.size,
        daily: data.daily,
      })).sort((a, b) => b.total - a.total);

      // Top events driving clicks
      const eventClickMap = {};
      for (const c of rows) {
        if (!c.event_id) continue;
        if (!eventClickMap[c.event_id]) eventClickMap[c.event_id] = { total: 0, byPartner: {} };
        eventClickMap[c.event_id].total++;
        if (!eventClickMap[c.event_id].byPartner[c.partner_slug]) eventClickMap[c.event_id].byPartner[c.partner_slug] = 0;
        eventClickMap[c.event_id].byPartner[c.partner_slug]++;
      }

      // Resolve event titles for every event in the window (the detail list
      // needs them all, not just the top 10).
      const allEventIds = [...new Set(rows.map((c) => c.event_id).filter(Boolean))];
      let eventTitles = {};
      if (allEventIds.length > 0) {
        const { data: events } = await supabase
          .from("events")
          .select("id, title, slug")
          .in("id", allEventIds);
        for (const e of (events || [])) eventTitles[e.id] = { title: e.title, slug: e.slug };
      }

      // Resolve host identity for the detail list: profiles first, auth.users
      // email as a backfill (same pattern as the admin CRM/leads endpoints).
      const userIds = [...new Set(rows.map((c) => c.user_id).filter(Boolean))];
      let hostById = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, name, brand, contact_email")
          .in("id", userIds);
        for (const p of (profs || [])) {
          hostById[p.id] = {
            id: p.id,
            name: p.name || p.brand || null,
            email: p.contact_email || null,
          };
        }
        const needEmail = userIds.filter((id) => !hostById[id]?.email);
        if (needEmail.length > 0) {
          const { data: authData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
          const emailById = {};
          (authData?.users || []).forEach((u) => {
            if (u.email) emailById[u.id] = u.email;
          });
          for (const id of userIds) {
            if (!hostById[id]) hostById[id] = { id, name: null, email: emailById[id] || null };
            else if (!hostById[id].email) hostById[id].email = emailById[id] || null;
          }
        }
        // Last-resort display name from the email local part.
        for (const id of Object.keys(hostById)) {
          const h = hostById[id];
          if (!h.name && h.email) h.name = h.email.split("@")[0];
        }
      }

      const topEventIds = Object.entries(eventClickMap)
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([id]) => id);

      const topEvents = topEventIds.map(id => ({
        id,
        title: eventTitles[id]?.title || "Unknown",
        slug: eventTitles[id]?.slug,
        clicks: eventClickMap[id].total,
        byPartner: eventClickMap[id].byPartner,
      }));

      // Per-click detail (rows are already newest-first), capped so the payload
      // stays small. This is the "who clicked what, on which event, when" list.
      const recentClicks = rows.slice(0, 100).map((c) => ({
        id: c.id,
        partnerSlug: c.partner_slug,
        placement: c.placement,
        clickedAt: c.clicked_at,
        eventId: c.event_id,
        eventTitle: eventTitles[c.event_id]?.title || "Unknown event",
        eventSlug: eventTitles[c.event_id]?.slug || null,
        host: c.user_id ? (hostById[c.user_id] || { id: c.user_id, name: null, email: null }) : null,
      }));

      return res.json({
        totalClicks: rows.length,
        uniqueClickers: new Set(rows.map(c => c.ip_address || c.id)).size,
        partners,
        topEvents,
        recentClicks,
      });
    } catch (err) {
      console.error("[partner-clicks analytics] error:", err.message);
      return res.status(500).json({ error: "Failed to fetch partner click analytics" });
    }
  });
}
