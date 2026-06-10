// Host analytics routes: global cross-event dashboard (GET /host/analytics)
// + per-event page-view/RSVP/campaign analytics (GET /host/events/:id/analytics).
import { requireAuth } from "../middleware/auth.js";
import {
  getUserEventIds,
  generateDinnerTimeSlots,
  getEventCounts,
  findEventById,
  isUserEventHost,
  getUserProfile,
} from "../data.js";

export function registerHostAnalyticsRoutes(app) {
  // GET /admin/analytics/campaigns — list campaigns sent in the date range
  // with open/click stats. Filtered by outbox.created_at so admin can scope
  // the campaign list to the same window the rest of the page is showing.
  app.get("/host/analytics", requireAuth, async (req, res) => {
    try {
      const { supabase: sb } = await import("../supabase.js");

      // Get all event IDs where user is a host
      const eventIds = await getUserEventIds(req.user.id);
      if (!eventIds || eventIds.length === 0) {
        return res.json({ events: [], total_views: 0, total_unique_visitors: 0, total_rsvps: 0 });
      }

      // Get page views for all host events
      const { data: views } = await sb
        .from("event_page_views")
        .select("event_id, visitor_id, utm_source, utm_campaign, referrer, device_type, created_at")
        .in("event_id", eventIds);

      // Get event details + RSVP counts
      const { data: events } = await sb
        .from("events")
        .select("id, title, slug, starts_at, ends_at, cover_image_url, image_url, host_id, total_capacity, cocktail_capacity, ticket_type, ticket_price, ticket_currency, dinner_enabled, dinner_max_seats_per_slot, dinner_slots, dinner_start_time, dinner_end_time, dinner_seating_interval_hours")
        .in("id", eventIds)
        .order("starts_at", { ascending: false });

      // Batch-fetch RSVP counts for all events in one query instead of N+1
      const { data: rsvpRows } = await sb
        .from("rsvps")
        .select("id, event_id, party_size, total_guests, booking_status, status, visitor_id, created_at, pulled_up, pulled_up_count, wants_dinner, dinner, dinner_party_size, dinner_status")
        .in("event_id", eventIds);

      // Date range filtering — supports ?startDate=&endDate= or ?days=
      const now = new Date();
      let periodStart, periodEnd, days;
      if (req.query.startDate && req.query.endDate) {
        periodStart = new Date(req.query.startDate + "T00:00:00");
        periodEnd = new Date(req.query.endDate + "T23:59:59.999");
        days = Math.round((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1;
      } else {
        days = parseInt(req.query.days) || 30;
        periodEnd = new Date(now);
        periodEnd.setHours(23, 59, 59, 999);
        periodStart = new Date(periodEnd);
        periodStart.setDate(periodStart.getDate() - days + 1);
        periodStart.setHours(0, 0, 0, 0);
      }
      const prevEnd = new Date(periodStart);
      prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
      const prevStart = new Date(prevEnd);
      prevStart.setDate(prevStart.getDate() - days + 1);
      prevStart.setHours(0, 0, 0, 0);

      // Build event title lookup
      const eventTitleMap = {};
      for (const e of (events || [])) {
        eventTitleMap[e.id] = e.title;
      }

      // Aggregate views filtered by selected period
      const eventViewMap = {};
      const eventSourceMap = {}; // { eventId: { source: count } }
      const eventDailyMap = {}; // { eventId: { "2026-03-10": count } }
      const eventDailySourceMap = {}; // { eventId: { "2026-03-10": { source: count } } }
      const allVisitors = new Set();
      let newsletterViews = 0;
      const eventDeviceMap = {}; // { eventId: { mobile: Set, desktop: Set, unknown: Set } }

      // Daily views per event + totals (current period)
      const currentDays = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(periodStart);
        d.setDate(d.getDate() + i);
        currentDays.push(d.toISOString().slice(0, 10));
      }

      const dailyPerEvent = {};
      const dailyTotal = {};
      const prevDailyTotal = {};

      for (const v of (views || [])) {
        const day = v.created_at.slice(0, 10);
        const vDate = new Date(v.created_at);

        if (vDate >= periodStart && vDate <= periodEnd) {
          // Period-filtered per-event aggregation
          if (!eventViewMap[v.event_id]) {
            eventViewMap[v.event_id] = { views: 0, visitors: new Set() };
          }
          eventViewMap[v.event_id].views++;
          eventViewMap[v.event_id].visitors.add(v.visitor_id);
          // Device split tracked via visitor sets (unique per device)
          if (!eventDeviceMap[v.event_id]) eventDeviceMap[v.event_id] = { mobile: new Set(), desktop: new Set(), unknown: new Set() };
          const vid = v.visitor_id || v.event_id + v.created_at;
          if (v.device_type === "mobile") eventDeviceMap[v.event_id].mobile.add(vid);
          else if (v.device_type === "desktop") eventDeviceMap[v.event_id].desktop.add(vid);
          else eventDeviceMap[v.event_id].unknown.add(vid);
          allVisitors.add(v.visitor_id);
          if (v.utm_source === "pullup_newsletter") newsletterViews++;

          // Per-event source tracking. A recognized social referrer beats
          // utm_source: the UTM can be baked into a shared link (e.g.
          // ?utm_source=chatgpt.com pasted on Instagram), but the referrer
          // header reflects where the click physically came from.
          let source = "direct";
          if (v.referrer) {
            try {
              const host = new URL(v.referrer).hostname.replace("www.", "");
              if (host.includes("instagram")) source = "instagram";
              else if (host.includes("facebook") || host.includes("fb.")) source = "facebook";
              else if (host.includes("twitter") || host.includes("x.com")) source = "twitter";
              else if (host.includes("linkedin")) source = "linkedin";
              else if (v.utm_source) source = v.utm_source;
              else if (host.includes("pullup")) source = "pullup";
              else source = host;
            } catch { source = v.utm_source || "other"; }
          } else if (v.utm_source) {
            source = v.utm_source;
          }
          if (!eventSourceMap[v.event_id]) eventSourceMap[v.event_id] = {};
          if (!eventSourceMap[v.event_id][source]) eventSourceMap[v.event_id][source] = new Set();
          eventSourceMap[v.event_id][source].add(v.visitor_id || v.event_id + v.created_at);

          // Per-event daily-by-source (unique visitors)
          if (!eventDailySourceMap[v.event_id]) eventDailySourceMap[v.event_id] = {};
          if (!eventDailySourceMap[v.event_id][day]) eventDailySourceMap[v.event_id][day] = {};
          if (!eventDailySourceMap[v.event_id][day][source]) eventDailySourceMap[v.event_id][day][source] = new Set();
          eventDailySourceMap[v.event_id][day][source].add(vid);

          // Per-event daily unique visitors
          if (!eventDailyMap[v.event_id]) eventDailyMap[v.event_id] = {};
          if (!eventDailyMap[v.event_id][day]) eventDailyMap[v.event_id][day] = new Set();
          eventDailyMap[v.event_id][day].add(vid);

          // Daily breakdown for chart (unique visitors)
          if (!dailyTotal[day]) dailyTotal[day] = new Set();
          dailyTotal[day].add(vid);
          if (!dailyPerEvent[v.event_id]) dailyPerEvent[v.event_id] = {};
          if (!dailyPerEvent[v.event_id][day]) dailyPerEvent[v.event_id][day] = new Set();
          dailyPerEvent[v.event_id][day].add(vid);
        } else if (vDate >= prevStart && vDate <= prevEnd) {
          const dayOffset = Math.floor((vDate - prevStart) / (1000 * 60 * 60 * 24));
          const mappedDay = currentDays[dayOffset] || day;
          prevDailyTotal[mappedDay] = (prevDailyTotal[mappedDay] || 0) + 1;
        }
      }

      // RSVPs filtered by period
      const rsvpCountMap = {};
      let totalRsvps = 0;
      for (const r of (rsvpRows || [])) {
        if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
          const rDate = new Date(r.created_at);
          if (rDate >= periodStart && rDate <= periodEnd) {
            const count = r.total_guests ?? r.party_size ?? 1;
            rsvpCountMap[r.event_id] = (rsvpCountMap[r.event_id] || 0) + count;
          }
        }
      }

      // Per-event RSVP daily breakdown (+ VIP RSVP daily)
      const rsvpDailyMap = {}; // { eventId: { "2026-03-10": count } }
      const vipRsvpDailyMap = {}; // { eventId: { "2026-03-10": count } }
      for (const r of (rsvpRows || [])) {
        if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
          const rDate = new Date(r.created_at);
          if (rDate >= periodStart && rDate <= periodEnd) {
            const day = r.created_at.slice(0, 10);
            const count = r.total_guests ?? r.party_size ?? 1;
            if (!rsvpDailyMap[r.event_id]) rsvpDailyMap[r.event_id] = {};
            rsvpDailyMap[r.event_id][day] = (rsvpDailyMap[r.event_id][day] || 0) + count;
          }
        }
      }

      // Batch-fetch VIP invites for all events
      const { data: vipRows } = await sb
        .from("vip_invites")
        .select("id, event_id, email, max_guests, free_entry, used_at, used_rsvp_id, created_at")
        .in("event_id", eventIds);

      // Group VIP invites per event
      const vipByEvent = {};
      for (const v of (vipRows || [])) {
        if (!vipByEvent[v.event_id]) vipByEvent[v.event_id] = [];
        vipByEvent[v.event_id].push({
          email: v.email,
          maxGuests: v.max_guests,
          freeEntry: v.free_entry,
          redeemed: !!v.used_at,
          createdAt: v.created_at,
        });
      }

      // Build set of VIP RSVP IDs for golden-dot tracking
      const vipRsvpIds = new Set();
      for (const v of (vipRows || [])) {
        if (v.used_rsvp_id) vipRsvpIds.add(v.used_rsvp_id);
      }

      // Now populate VIP RSVP daily map using the vipRsvpIds set
      // Count VIP bookings (not total guests) — each redeemed VIP invite = 1 VIP RSVP
      for (const r of (rsvpRows || [])) {
        if (r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending") {
          const rDate = new Date(r.created_at);
          if (rDate >= periodStart && rDate <= periodEnd && vipRsvpIds.has(r.id)) {
            const day = r.created_at.slice(0, 10);
            if (!vipRsvpDailyMap[r.event_id]) vipRsvpDailyMap[r.event_id] = {};
            vipRsvpDailyMap[r.event_id][day] = (vipRsvpDailyMap[r.event_id][day] || 0) + 1;
          }
        }
      }

      // Compute pulled_up counts per event (period-filtered like rsvpCountMap)
      const pulledUpMap = {};
      for (const r of (rsvpRows || [])) {
        if (r.pulled_up === true && (r.booking_status === "CONFIRMED" || r.status === "attending")) {
          const rDate = new Date(r.created_at);
          if (rDate >= periodStart && rDate <= periodEnd) {
            const count = r.pulled_up_count ?? r.total_guests ?? r.party_size ?? 1;
            pulledUpMap[r.event_id] = (pulledUpMap[r.event_id] || 0) + count;
          }
        }
      }

      // Compute dinner counts per event (period-filtered)
      const dinnerMap = {};
      const dinnerEventIds = new Set((events || []).filter(e => e.dinner_enabled).map(e => e.id));
      for (const r of (rsvpRows || [])) {
        if (!dinnerEventIds.has(r.event_id)) continue;
        const hasDinner = ((r.dinner && r.dinner.enabled) || r.wants_dinner) &&
          (r.dinner_status === "confirmed" || (r.dinner && r.dinner.bookingStatus === "CONFIRMED"));
        if (hasDinner && (r.booking_status === "CONFIRMED" || r.status === "attending")) {
          const rDate = new Date(r.created_at);
          if (rDate >= periodStart && rDate <= periodEnd) {
            const count = r.dinner_party_size ?? r.total_guests ?? r.party_size ?? 1;
            dinnerMap[r.event_id] = (dinnerMap[r.event_id] || 0) + count;
          }
        }
      }

      // Batch-query payments for paid events
      const paidEventIds = (events || []).filter(e => e.ticket_type === "paid").map(e => e.id);
      const revenueMap = {};
      if (paidEventIds.length > 0) {
        const { data: paymentRows } = await sb
          .from("payments")
          .select("event_id, amount")
          .in("event_id", paidEventIds)
          .eq("status", "succeeded");
        for (const p of (paymentRows || [])) {
          revenueMap[p.event_id] = (revenueMap[p.event_id] || 0) + (p.amount || 0);
        }
      }

      // Build events list filtered by period
      const eventsWithAnalytics = (events || []).map((e) => {
        const rsvps = rsvpCountMap[e.id] || 0;
        totalRsvps += rsvps;
        const ev = eventViewMap[e.id] || { views: 0, visitors: new Set() };

        // Per-event sources (unique visitors)
        const srcMap = eventSourceMap[e.id] || {};
        const uniqueCount = ev.visitors.size;
        const sources = Object.entries(srcMap)
          .map(([source, visitors]) => ({ source, count: visitors.size, percentage: uniqueCount > 0 ? Math.round((visitors.size / uniqueCount) * 1000) / 10 : 0 }))
          .sort((a, b) => b.count - a.count);

        // Per-event daily unique visitors + RSVPs + per-source breakdown for the period
        const dailySourceData = eventDailySourceMap[e.id] || {};
        const dailyViews = currentDays.map(date => {
          const bySourceSets = dailySourceData[date] || {};
          const bySource = {};
          for (const [src, visitors] of Object.entries(bySourceSets)) {
            bySource[src] = visitors.size;
          }
          return {
            date,
            views: (eventDailyMap[e.id] && eventDailyMap[e.id][date]) ? eventDailyMap[e.id][date].size : 0,
            rsvps: (rsvpDailyMap[e.id] && rsvpDailyMap[e.id][date]) || 0,
            vipRsvps: (vipRsvpDailyMap[e.id] && vipRsvpDailyMap[e.id][date]) || 0,
            bySource,
          };
        });

        const capacity = e.total_capacity || e.cocktail_capacity || 0;
        const pulledUp = pulledUpMap[e.id] || 0;
        const dinnerCount = dinnerMap[e.id] || 0;
        const isPaid = e.ticket_type === "paid";
        const revenue = revenueMap[e.id] || 0;
        const showRate = rsvps > 0 ? Math.round((pulledUp / rsvps) * 1000) / 10 : 0;

        // Compute dinner capacity from slot config
        let dinnerCapacity = 0;
        if (e.dinner_enabled) {
          const slots = generateDinnerTimeSlots({
            dinnerEnabled: true,
            dinnerStartTime: e.dinner_start_time,
            dinnerEndTime: e.dinner_end_time,
            dinnerSeatingIntervalHours: e.dinner_seating_interval_hours,
            dinnerSlots: e.dinner_slots,
          });
          for (const slotTime of slots) {
            let slotCap = e.dinner_max_seats_per_slot || 0;
            if (Array.isArray(e.dinner_slots)) {
              const match = e.dinner_slots.find(s => {
                if (!s || typeof s === 'string') return false;
                try { return new Date(s.time).getTime() === new Date(slotTime).getTime(); } catch { return false; }
              });
              if (match && typeof match.capacity === 'number') slotCap = match.capacity;
            }
            dinnerCapacity += slotCap;
          }
        }

        return {
          id: e.id,
          title: e.title,
          slug: e.slug,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          cover_image_url: e.cover_image_url || e.image_url,
          views: ev.visitors.size,
          unique_visitors: ev.visitors.size,
          rsvps,
          dinner: dinnerCount,
          dinner_enabled: !!e.dinner_enabled,
          dinner_capacity: dinnerCapacity,
          pulled_up: pulledUp,
          capacity,
          is_paid: isPaid,
          ticket_price: e.ticket_price || 0,
          ticket_currency: e.ticket_currency || "sek",
          revenue,
          show_rate: showRate,
          conversion_rate: uniqueCount > 0
            ? Math.round((rsvps / uniqueCount) * 1000) / 10
            : 0,
          sources,
          daily: dailyViews,
          device_split: (() => {
            const dm = eventDeviceMap[e.id];
            if (!dm) return { mobile: 0, desktop: 0, unknown: 0 };
            return { mobile: dm.mobile.size, desktop: dm.desktop.size, unknown: dm.unknown.size };
          })(),
        };
      });
      eventsWithAnalytics.sort((a, b) => b.unique_visitors - a.unique_visitors);

      // Build chart data arrays
      const current = currentDays.map((date) => ({
        date,
        views: dailyTotal[date] ? dailyTotal[date].size : 0,
      }));
      const previous = currentDays.map((date) => ({
        date,
        views: prevDailyTotal[date] || 0,
      }));

      // Build per-event stacked data (top events only)
      const topEventIds = eventsWithAnalytics.filter(e => e.unique_visitors > 0).slice(0, 8).map(e => e.id);
      const stackedData = currentDays.map((date) => {
        const entry = { date };
        let accounted = 0;
        for (const eid of topEventIds) {
          const val = (dailyPerEvent[eid] && dailyPerEvent[eid][date]) ? dailyPerEvent[eid][date].size : 0;
          entry[eid] = val;
          accounted += val;
        }
        entry._other = Math.max(0, (dailyTotal[date] ? dailyTotal[date].size : 0) - accounted);
        return entry;
      });

      // Previous period aggregate stats
      const prevViews = (views || []).filter(v => {
        const d = new Date(v.created_at);
        return d >= prevStart && d <= prevEnd;
      });
      // Use sum of per-event unique visitors (not global deduped) to match event list totals
      const currentUniqueVisitors = eventsWithAnalytics.reduce((s, e) => s + e.unique_visitors, 0);

      // For previous period, compute per-event unique visitors the same way
      const prevEventVisitors = {};
      for (const v of (views || [])) {
        const d = new Date(v.created_at);
        if (d >= prevStart && d <= prevEnd) {
          if (!prevEventVisitors[v.event_id]) prevEventVisitors[v.event_id] = new Set();
          prevEventVisitors[v.event_id].add(v.visitor_id);
        }
      }
      const prevUniqueVisitors = Object.values(prevEventVisitors).reduce((s, set) => s + set.size, 0);

      const viewsChange = prevUniqueVisitors > 0
        ? Math.round(((currentUniqueVisitors - prevUniqueVisitors) / prevUniqueVisitors) * 100)
        : null;
      const uniqueChange = viewsChange;

      const totalPeriodViews = Object.values(dailyTotal).reduce((s, v) => s + v.size, 0);

      // Aggregate device split from per-event unique visitor sets
      const deviceCounts = { mobile: 0, desktop: 0, unknown: 0 };
      for (const dm of Object.values(eventDeviceMap)) {
        deviceCounts.mobile += dm.mobile.size;
        deviceCounts.desktop += dm.desktop.size;
        deviceCounts.unknown += dm.unknown.size;
      }

      // ── Campaign funnel tracking ──
      // Fetch email_outbox for campaigns related to this host's events
      // Get all event slugs for campaign_tag matching
      const eventSlugMap = {};
      for (const e of (events || [])) {
        eventSlugMap[e.id] = e.slug;
      }
      const allSlugs = Object.values(eventSlugMap);

      // Restrict campaigns to those THIS host actually sent. Without this,
      // every host saw the union of every host's campaigns because the
      // campaign_tag prefix is shared platform-wide. Look up the user's
      // own campaign ids first, build the matching tag list, then scope
      // the outbox query to those tags only.
      const { data: ownedCampaigns } = await sb
        .from("email_campaigns")
        .select("id")
        .eq("user_id", req.user.id);
      const ownedTagList = (ownedCampaigns || []).map(
        (c) => `host_campaign_${c.id}`,
      );

      const { data: outboxRows } = ownedTagList.length === 0
        ? { data: [] }
        : await sb
            .from("email_outbox")
            .select("id, tracking_id, to_email, campaign_tag, status, created_at")
            .in("campaign_tag", ownedTagList)
            .gte("created_at", periodStart.toISOString())
            .lte("created_at", periodEnd.toISOString());

      // Build campaign data if we have outbox rows
      let campaigns = [];
      if (outboxRows && outboxRows.length > 0) {
        // Group by campaign_tag
        const campaignMap = {};
        const allTrackingIds = [];
        for (const row of outboxRows) {
          if (!row.campaign_tag) continue;
          if (!campaignMap[row.campaign_tag]) {
            campaignMap[row.campaign_tag] = { sent: 0, emails: new Set(), trackingIds: [] };
          }
          campaignMap[row.campaign_tag].sent++;
          campaignMap[row.campaign_tag].emails.add(row.to_email);
          if (row.tracking_id) {
            campaignMap[row.campaign_tag].trackingIds.push(row.tracking_id);
            allTrackingIds.push(row.tracking_id);
          }
        }

        // Batch fetch opens and clicks for all tracking IDs
        let opensSet = new Set();
        let clicksSet = new Set();
        if (allTrackingIds.length > 0) {
          const { data: openRows } = await sb
            .from("email_opens")
            .select("tracking_id")
            .in("tracking_id", allTrackingIds);
          for (const o of (openRows || [])) opensSet.add(o.tracking_id);

          const { data: clickRows } = await sb
            .from("email_clicks")
            .select("tracking_id")
            .in("tracking_id", allTrackingIds);
          for (const c of (clickRows || [])) clicksSet.add(c.tracking_id);
        }

        // Count page views and RSVPs per campaign using utm_campaign
        // Also build per-event campaign view counts
        const campaignViewMap = {}; // { campaign_tag: count }
        const campaignVisitorMap = {}; // { campaign_tag: Set<visitor_id> }
        const eventCampaignMap = {}; // { event_id: { campaign_tag: count } }
        for (const v of (views || [])) {
          if (!v.utm_campaign) continue;
          // Only count host campaign views, skip admin/VIP campaigns
          if (!v.utm_campaign.startsWith("host_campaign_")) continue;
          const vDate = new Date(v.created_at);
          if (vDate >= periodStart && vDate <= periodEnd) {
            campaignViewMap[v.utm_campaign] = (campaignViewMap[v.utm_campaign] || 0) + 1;
            if (!campaignVisitorMap[v.utm_campaign]) campaignVisitorMap[v.utm_campaign] = new Set();
            campaignVisitorMap[v.utm_campaign].add(v.visitor_id);

            // Per-event campaign breakdown
            if (!eventCampaignMap[v.event_id]) eventCampaignMap[v.event_id] = {};
            eventCampaignMap[v.event_id][v.utm_campaign] = (eventCampaignMap[v.event_id][v.utm_campaign] || 0) + 1;
          }
        }

        // Match RSVPs to campaigns via visitor_id
        const campaignRsvpMap = {}; // { campaign_tag: count }
        for (const r of (rsvpRows || [])) {
          if (!(r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending")) continue;
          if (!r.visitor_id) continue;
          const rDate = new Date(r.created_at);
          if (rDate < periodStart || rDate > periodEnd) continue;
          // Check which campaigns this visitor came from
          for (const [tag, visitors] of Object.entries(campaignVisitorMap)) {
            if (visitors.has(r.visitor_id)) {
              campaignRsvpMap[tag] = (campaignRsvpMap[tag] || 0) + 1;
            }
          }
        }

        // Batch-fetch campaign names
        const hostCampaignIds = Object.keys(campaignMap)
          .filter(t => t.startsWith("host_campaign_"))
          .map(t => t.replace("host_campaign_", ""));
        let campaignNameMap = {};
        if (hostCampaignIds.length > 0) {
          try {
            const { data: campaignRows } = await sb
              .from("campaign_campaigns")
              .select("id, name, subject")
              .in("id", hostCampaignIds);
            for (const row of (campaignRows || [])) {
              campaignNameMap[row.id] = row.name || row.subject || `host_campaign_${row.id}`;
            }
          } catch {}
        }

        // Build campaign array
        for (const [tag, data] of Object.entries(campaignMap)) {
          const opened = data.trackingIds.filter(t => opensSet.has(t)).length;
          const clicked = data.trackingIds.filter(t => clicksSet.has(t)).length;
          const visited = campaignViewMap[tag] || 0;
          const rsvps = campaignRsvpMap[tag] || 0;

          let name = tag;
          if (tag.startsWith("host_campaign_")) {
            const cId = tag.replace("host_campaign_", "");
            if (campaignNameMap[cId]) name = campaignNameMap[cId];
          }

          campaigns.push({
            tag,
            name,
            sent: data.sent,
            opened,
            clicked,
            visited,
            rsvps,
            openRate: data.sent > 0 ? Math.round((opened / data.sent) * 1000) / 10 : 0,
            clickRate: opened > 0 ? Math.round((clicked / opened) * 1000) / 10 : 0,
            visitRate: clicked > 0 ? Math.round((visited / clicked) * 1000) / 10 : 0,
            conversionRate: visited > 0 ? Math.round((rsvps / visited) * 1000) / 10 : 0,
          });
        }
        campaigns.sort((a, b) => b.sent - a.sent);

        // Attach campaign breakdowns to events
        for (const ev of eventsWithAnalytics) {
          const ecm = eventCampaignMap[ev.id];
          if (ecm) {
            ev.campaignBreakdown = Object.entries(ecm)
              .map(([tag, count]) => ({ tag, count }))
              .sort((a, b) => b.count - a.count);
          }
        }
      }

      // Also need utm_campaign in the views query — it's already selected, let's add it to per-event source tracking
      // (utm_campaign is captured but we need to pass it through the event source data)

      return res.json({
        events: eventsWithAnalytics,
        total_views: eventsWithAnalytics.reduce((s, e) => s + e.unique_visitors, 0),
        total_unique_visitors: eventsWithAnalytics.reduce((s, e) => s + e.unique_visitors, 0),
        total_rsvps: totalRsvps,
        total_pulled_up: Object.values(pulledUpMap).reduce((s, v) => s + v, 0),
        total_dinner: Object.values(dinnerMap).reduce((s, v) => s + v, 0),
        has_dinner_events: dinnerEventIds.size > 0,
        total_revenue: Object.values(revenueMap).reduce((s, v) => s + v, 0),
        revenue_by_currency: (() => {
          const byCur = {};
          for (const e of (events || [])) {
            if (e.ticket_type === "paid" && revenueMap[e.id]) {
              const cur = e.ticket_currency || "sek";
              byCur[cur] = (byCur[cur] || 0) + revenueMap[e.id];
            }
          }
          return byCur;
        })(),
        has_paid_events: paidEventIds.length > 0,
        avg_show_rate: totalRsvps > 0
          ? Math.round((Object.values(pulledUpMap).reduce((s, v) => s + v, 0) / totalRsvps) * 1000) / 10
          : 0,
        newsletter_views: newsletterViews,
        device_split: deviceCounts,
        campaigns,
        daily_views: dailyTotal,
        avg_conversion: totalPeriodViews > 0
          ? Math.round((totalRsvps / totalPeriodViews) * 1000) / 10
          : 0,
        chart: {
          current,
          previous,
          stacked: stackedData,
          eventLabels: topEventIds.map(id => ({ id, title: eventTitleMap[id] || "Unknown" })),
        },
        period: {
          days,
          currentViews: currentUniqueVisitors,
          currentUnique: currentUniqueVisitors,
          prevViews: prevUniqueVisitors,
          prevUnique: prevUniqueVisitors,
          viewsChange,
          uniqueChange,
        },
      });
    } catch (err) {
      console.error("[host] aggregate analytics error:", err.message);
      return res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });

  // GET /host/events/:id/analytics — page view analytics for hosts
  app.get("/host/events/:id/analytics", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Verify the user has access to this event. Admins can read any event's
      // analytics (admin Analytics → All Events tab).
      const { isHost } = await isUserEventHost(req.user.id, id);
      if (!isHost) {
        const profile = await getUserProfile(req.user.id);
        if (!profile?.isAdmin) {
          return res.status(403).json({ error: "Forbidden", message: "You don't have access to this event" });
        }
      }

      const { supabase: sb } = await import("../supabase.js");

      // Date range (default last 30 days)
      const days = 30;
      const periodEnd = req.query.endDate ? new Date(req.query.endDate) : new Date();
      const periodStart = req.query.startDate
        ? new Date(req.query.startDate)
        : new Date(periodEnd.getTime() - days * 86400000);
      const periodLenMs = periodEnd.getTime() - periodStart.getTime();
      const prevEnd = new Date(periodStart.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - periodLenMs);

      // Get page views for current + previous period (filter at DB level)
      const [{ data: views, error: viewsErr }, { data: prevViews, error: prevViewsErr }] = await Promise.all([
        sb.from("event_page_views")
          .select("id, visitor_id, referrer, utm_source, utm_medium, utm_campaign, utm_content, device_type, created_at")
          .eq("event_id", id)
          .gte("created_at", periodStart.toISOString())
          .lte("created_at", periodEnd.toISOString())
          .order("created_at", { ascending: false }),
        sb.from("event_page_views")
          .select("id, visitor_id, referrer, utm_source, utm_medium, utm_campaign, utm_content, device_type, created_at")
          .eq("event_id", id)
          .gte("created_at", prevStart.toISOString())
          .lte("created_at", prevEnd.toISOString())
          .order("created_at", { ascending: false }),
      ]);

      if (viewsErr) throw viewsErr;

      const totalViews = views.length;
      const uniqueVisitors = new Set(views.map(v => v.visitor_id).filter(Boolean)).size;
      const prevUniqueVisitors = new Set(prevViews.map(v => v.visitor_id).filter(Boolean)).size;

      // Period comparison (based on unique visitors)
      const viewsChange = prevUniqueVisitors > 0
        ? Math.round(((uniqueVisitors - prevUniqueVisitors) / prevUniqueVisitors) * 1000) / 10
        : uniqueVisitors > 0 ? 100 : 0;
      const uniqueChange = viewsChange;

      // Device split (unique visitors per device)
      const device_split = { mobile: 0, desktop: 0, unknown: 0 };
      const deviceVisitors = { mobile: new Set(), desktop: new Set(), unknown: new Set() };
      for (const v of views) {
        const dt = (v.device_type || "").toLowerCase();
        const vid = v.visitor_id || v.id;
        if (dt === "mobile") deviceVisitors.mobile.add(vid);
        else if (dt === "desktop") deviceVisitors.desktop.add(vid);
        else deviceVisitors.unknown.add(vid);
      }
      device_split.mobile = deviceVisitors.mobile.size;
      device_split.desktop = deviceVisitors.desktop.size;
      device_split.unknown = deviceVisitors.unknown.size;

      // Source detection helper. A recognized social referrer beats
      // utm_source: the UTM can be baked into a shared link (e.g.
      // ?utm_source=chatgpt.com pasted on Instagram), but the referrer
      // header reflects where the click physically came from.
      function detectSource(v) {
        let source = "direct";
        if (v.referrer) {
          try {
            const host = new URL(v.referrer).hostname.replace("www.", "");
            if (host.includes("instagram")) source = "instagram";
            else if (host.includes("facebook") || host.includes("fb.")) source = "facebook";
            else if (host.includes("twitter") || host.includes("x.com")) source = "twitter";
            else if (host.includes("linkedin")) source = "linkedin";
            else if (v.utm_source) source = v.utm_source;
            else if (host.includes("pullup")) source = "pullup";
            else source = host;
          } catch {
            source = v.utm_source || "other";
          }
        } else if (v.utm_source) {
          source = v.utm_source;
        }
        return source;
      }

      // Traffic sources breakdown (unique visitors per source)
      const sourceVisitorMap = {};
      for (const v of views) {
        const source = detectSource(v);
        if (!sourceVisitorMap[source]) sourceVisitorMap[source] = new Set();
        sourceVisitorMap[source].add(v.visitor_id || v.id);
      }
      const sources = Object.entries(sourceVisitorMap)
        .map(([source, visitors]) => ({ source, count: visitors.size, percentage: uniqueVisitors > 0 ? Math.round((visitors.size / uniqueVisitors) * 1000) / 10 : 0 }))
        .sort((a, b) => b.count - a.count);

      // Fetch RSVPs
      const { data: rsvpRows } = await sb
        .from("rsvps")
        .select("id, event_id, party_size, total_guests, booking_status, status, visitor_id, created_at, pulled_up, pulled_up_count, wants_dinner, dinner, dinner_party_size, dinner_status")
        .eq("event_id", id);

      const validRsvps = (rsvpRows || []).filter(r =>
        r.booking_status === "CONFIRMED" || r.booking_status === "PENDING_PAYMENT" || r.status === "attending"
      );
      const periodRsvps = validRsvps.filter(r => {
        const d = new Date(r.created_at);
        return d >= periodStart && d <= periodEnd;
      });

      // Get RSVP count for conversion funnel
      const counts = await getEventCounts(id);
      const rsvp_count = (counts?.confirmed || 0) + (counts?.waitlist || 0);

      // Pulled up count
      const pulledUpCount = validRsvps.filter(r => r.pulled_up === true)
        .reduce((s, r) => s + (r.pulled_up_count ?? r.total_guests ?? r.party_size ?? 1), 0);

      // Get event details for capacity and ticket info
      const eventDetails = await findEventById(id);
      const capacity = eventDetails?.total_capacity || eventDetails?.cocktail_capacity || 0;
      const isPaid = eventDetails?.ticket_type === "paid" || eventDetails?.ticketType === "paid";
      const ticketPrice = eventDetails?.ticket_price || eventDetails?.ticketPrice || 0;
      const ticketCurrency = eventDetails?.ticket_currency || eventDetails?.ticketCurrency || "sek";
      const dinnerEnabled = eventDetails?.dinnerEnabled || eventDetails?.dinner_enabled || false;

      // Dinner count + capacity
      let dinnerCount = 0;
      let dinnerCapacity = 0;
      if (dinnerEnabled) {
        dinnerCount = validRsvps.filter(r => {
          const d = r.dinner || {};
          return ((d.enabled) || r.wants_dinner) &&
            (r.dinner_status === "confirmed" || (d.bookingStatus === "CONFIRMED"));
        }).reduce((s, r) => s + (r.dinner_party_size ?? r.total_guests ?? r.party_size ?? 1), 0);

        const dinnerSlots = generateDinnerTimeSlots({
          dinnerEnabled: true,
          dinnerStartTime: eventDetails?.dinnerStartTime || eventDetails?.dinner_start_time,
          dinnerEndTime: eventDetails?.dinnerEndTime || eventDetails?.dinner_end_time,
          dinnerSeatingIntervalHours: eventDetails?.dinnerSeatingIntervalHours || eventDetails?.dinner_seating_interval_hours,
          dinnerSlots: eventDetails?.dinnerSlots || eventDetails?.dinner_slots,
        });
        const defaultSlotCap = eventDetails?.dinnerMaxSeatsPerSlot || eventDetails?.dinner_max_seats_per_slot || 0;
        const slotsConfig = eventDetails?.dinnerSlots || eventDetails?.dinner_slots;
        for (const slotTime of dinnerSlots) {
          let slotCap = defaultSlotCap;
          if (Array.isArray(slotsConfig)) {
            const match = slotsConfig.find(s => {
              if (!s || typeof s === 'string') return false;
              try { return new Date(s.time).getTime() === new Date(slotTime).getTime(); } catch { return false; }
            });
            if (match && typeof match.capacity === 'number') slotCap = match.capacity;
          }
          dinnerCapacity += slotCap;
        }
      }

      // Revenue for paid events
      let revenue = 0;
      if (isPaid) {
        const { data: paymentRows } = await sb
          .from("payments")
          .select("amount")
          .eq("event_id", id)
          .eq("status", "succeeded");
        revenue = (paymentRows || []).reduce((s, p) => s + (p.amount || 0), 0);
      }

      // VIP invites — only need rsvp IDs for golden dots on chart
      let vipRsvpIds = new Set();
      try {
        const { data: vipRows } = await sb
          .from("vip_invites")
          .select("used_rsvp_id")
          .eq("event_id", id)
          .not("used_rsvp_id", "is", null);
        for (const v of (vipRows || [])) {
          if (v.used_rsvp_id) vipRsvpIds.add(v.used_rsvp_id);
        }
      } catch (e) {
        console.error("[host] vip invites fetch error:", e.message);
      }

      // Daily data with unique visitors per source + RSVPs + VIP RSVPs
      const dailyMap = {};
      const dailyVisitorSets = {};
      // Initialize all days in range
      const cursor = new Date(periodStart);
      while (cursor <= periodEnd) {
        const day = cursor.toISOString().slice(0, 10);
        dailyMap[day] = { date: day, views: 0, rsvps: 0, vipRsvps: 0, bySource: {} };
        dailyVisitorSets[day] = { total: new Set(), bySource: {} };
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const v of views) {
        const day = v.created_at.slice(0, 10);
        if (!dailyMap[day]) {
          dailyMap[day] = { date: day, views: 0, rsvps: 0, vipRsvps: 0, bySource: {} };
          dailyVisitorSets[day] = { total: new Set(), bySource: {} };
        }
        const vid = v.visitor_id || v.id;
        dailyVisitorSets[day].total.add(vid);
        const src = detectSource(v);
        if (!dailyVisitorSets[day].bySource[src]) dailyVisitorSets[day].bySource[src] = new Set();
        dailyVisitorSets[day].bySource[src].add(vid);
      }
      // Convert sets to counts
      for (const day of Object.keys(dailyMap)) {
        dailyMap[day].views = dailyVisitorSets[day].total.size;
        for (const [src, visitors] of Object.entries(dailyVisitorSets[day].bySource)) {
          dailyMap[day].bySource[src] = visitors.size;
        }
      }
      for (const r of periodRsvps) {
        const day = r.created_at.slice(0, 10);
        if (!dailyMap[day]) continue;
        dailyMap[day].rsvps++;
        if (vipRsvpIds.has(r.id)) dailyMap[day].vipRsvps++;
      }
      const daily = Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));

      // Newsletter impact
      const newsletterViews = views.filter(v => v.utm_source === "pullup_newsletter").length;

      // VIP email views on event page
      const vipViews = views.filter(v =>
        v.utm_campaign && v.utm_campaign.startsWith("vip_invite_")
      ).length;

      // VIP invite email impact (existing VIP stats)
      const event = eventDetails;
      let vipStats = null;
      if (event?.slug) {
        try {
          const campaignTag = `vip_invite_${event.slug}`;
          const { data: vipOutbox } = await sb
            .from("email_outbox")
            .select("id, tracking_id")
            .eq("campaign_tag", campaignTag);

          if (vipOutbox && vipOutbox.length > 0) {
            const trackingIds = vipOutbox.map(r => r.tracking_id).filter(Boolean);
            const [opensRes, clicksRes] = await Promise.all([
              trackingIds.length > 0
                ? sb.from("email_opens").select("tracking_id").in("tracking_id", trackingIds)
                : { data: [] },
              trackingIds.length > 0
                ? sb.from("email_clicks").select("tracking_id").in("tracking_id", trackingIds)
                : { data: [] },
            ]);
            const uniqueOpens = new Set((opensRes.data || []).map(o => o.tracking_id)).size;
            const uniqueClicks = new Set((clicksRes.data || []).map(c => c.tracking_id)).size;
            vipStats = {
              totalSent: vipOutbox.length,
              uniqueOpens,
              uniqueClicks,
              openRate: vipOutbox.length > 0 ? Math.round((uniqueOpens / vipOutbox.length) * 1000) / 10 : 0,
              clickRate: vipOutbox.length > 0 ? Math.round((uniqueClicks / vipOutbox.length) * 1000) / 10 : 0,
            };
          }
        } catch (vipErr) {
          console.error("[host] vip analytics error:", vipErr.message);
        }
      }

      // Host campaign funnel — only campaigns that featured THIS event
      let campaigns = [];
      try {
        // First, find campaign IDs that are linked to this event
        const { data: eventCampaigns } = await sb
          .from("campaign_campaigns")
          .select("id")
          .eq("event_id", id);

        const eventCampaignTags = (eventCampaigns || []).map(c => `host_campaign_${c.id}`);

        // Only fetch outbox rows for campaigns that include this event
        let outboxRows = [];
        if (eventCampaignTags.length > 0) {
          const { data: rows } = await sb
            .from("email_outbox")
            .select("id, tracking_id, to_email, campaign_tag, status, created_at")
            .in("campaign_tag", eventCampaignTags)
            .gte("created_at", periodStart.toISOString())
            .lte("created_at", periodEnd.toISOString());
          outboxRows = rows || [];
        }

        if (outboxRows && outboxRows.length > 0) {
          const campaignMap = {};
          const allTrackingIds = [];
          for (const row of outboxRows) {
            if (!row.campaign_tag) continue;
            if (!campaignMap[row.campaign_tag]) {
              campaignMap[row.campaign_tag] = { sent: 0, emails: new Set(), trackingIds: [] };
            }
            campaignMap[row.campaign_tag].sent++;
            campaignMap[row.campaign_tag].emails.add(row.to_email);
            if (row.tracking_id) {
              campaignMap[row.campaign_tag].trackingIds.push(row.tracking_id);
              allTrackingIds.push(row.tracking_id);
            }
          }

          let opensSet = new Set();
          let clicksSet = new Set();
          // Per-tracking-id breakdown: tracking_id -> array of { link_label, link_url }
          const clicksByTracking = new Map();
          if (allTrackingIds.length > 0) {
            const { data: openRows } = await sb
              .from("email_opens")
              .select("tracking_id")
              .in("tracking_id", allTrackingIds);
            for (const o of (openRows || [])) opensSet.add(o.tracking_id);

            const { data: clickRows } = await sb
              .from("email_clicks")
              .select("tracking_id, link_url, link_label")
              .in("tracking_id", allTrackingIds);
            for (const c of (clickRows || [])) {
              clicksSet.add(c.tracking_id);
              if (!clicksByTracking.has(c.tracking_id)) clicksByTracking.set(c.tracking_id, []);
              clicksByTracking.get(c.tracking_id).push({ link_url: c.link_url, link_label: c.link_label });
            }
          }

          // Count page views and RSVPs per campaign using utm_campaign
          const campaignViewMap = {};
          const campaignVisitorMap = {};
          for (const v of views) {
            if (!v.utm_campaign || !v.utm_campaign.startsWith("host_campaign_")) continue;
            campaignViewMap[v.utm_campaign] = (campaignViewMap[v.utm_campaign] || 0) + 1;
            if (!campaignVisitorMap[v.utm_campaign]) campaignVisitorMap[v.utm_campaign] = new Set();
            campaignVisitorMap[v.utm_campaign].add(v.visitor_id);
          }

          // Match RSVPs to campaigns via visitor_id
          const campaignRsvpMap = {};
          for (const r of periodRsvps) {
            if (!r.visitor_id) continue;
            for (const [tag, visitors] of Object.entries(campaignVisitorMap)) {
              if (visitors.has(r.visitor_id)) {
                campaignRsvpMap[tag] = (campaignRsvpMap[tag] || 0) + 1;
              }
            }
          }

          // Batch-fetch campaign names + template_type
          const campaignIds = Object.keys(campaignMap)
            .filter(t => t.startsWith("host_campaign_"))
            .map(t => t.replace("host_campaign_", ""));
          let campaignNameMap = {};
          let campaignTemplateTypeMap = {};
          if (campaignIds.length > 0) {
            try {
              const { data: campaignRows } = await sb
                .from("campaign_campaigns")
                .select("id, name, subject, template_type")
                .in("id", campaignIds);
              for (const row of (campaignRows || [])) {
                campaignNameMap[row.id] = row.name || row.subject || `host_campaign_${row.id}`;
                campaignTemplateTypeMap[row.id] = row.template_type || "event";
              }
            } catch {}
          }

          // Build campaign array
          for (const [tag, data] of Object.entries(campaignMap)) {
            const opened = data.trackingIds.filter(t => opensSet.has(t)).length;
            const clicked = data.trackingIds.filter(t => clicksSet.has(t)).length;
            const visited = campaignViewMap[tag] || 0;
            const rsvps = campaignRsvpMap[tag] || 0;

            let name = tag;
            let templateType = "event";
            if (tag.startsWith("host_campaign_")) {
              const cId = tag.replace("host_campaign_", "");
              if (campaignNameMap[cId]) name = campaignNameMap[cId];
              if (campaignTemplateTypeMap[cId]) templateType = campaignTemplateTypeMap[cId];
            }

            // Per-link breakdown across this campaign's recipients
            const linkMap = new Map();
            for (const tid of data.trackingIds) {
              const rows = clicksByTracking.get(tid) || [];
              for (const r of rows) {
                const label = r.link_label || "";
                const url = r.link_url || "";
                const key = label + "|" + url;
                const existing = linkMap.get(key) || { linkLabel: label, linkUrl: url, clicks: 0 };
                existing.clicks += 1;
                linkMap.set(key, existing);
              }
            }
            const linkBreakdown = Array.from(linkMap.values()).sort((a, b) => b.clicks - a.clicks);

            campaigns.push({
              tag,
              name,
              templateType,
              sent: data.sent,
              opened,
              clicked,
              visited,
              rsvps,
              openRate: data.sent > 0 ? Math.round((opened / data.sent) * 1000) / 10 : 0,
              clickRate: opened > 0 ? Math.round((clicked / opened) * 1000) / 10 : 0,
              visitRate: clicked > 0 ? Math.round((visited / clicked) * 1000) / 10 : 0,
              conversionRate: visited > 0 ? Math.round((rsvps / visited) * 1000) / 10 : 0,
              linkBreakdown,
            });
          }
          campaigns.sort((a, b) => b.sent - a.sent);
        }
      } catch (campErr) {
        console.error("[host] campaign funnel error:", campErr.message);
      }

      return res.json({
        total_views: uniqueVisitors,
        unique_visitors: uniqueVisitors,
        sources,
        daily,
        device_split,
        newsletter_views: newsletterViews,
        vip_stats: vipStats,
        vip_views: vipViews,
        campaigns,
        rsvp_count,
        pulled_up: pulledUpCount,
        dinner: dinnerCount,
        dinner_enabled: dinnerEnabled,
        dinner_capacity: dinnerCapacity,
        capacity,
        is_paid: isPaid,
        ticket_price: ticketPrice,
        ticket_currency: ticketCurrency,
        revenue,
        show_rate: rsvp_count > 0 ? Math.round((pulledUpCount / rsvp_count) * 1000) / 10 : 0,
        fill_rate: capacity > 0 ? Math.round((rsvp_count / capacity) * 1000) / 10 : 0,
        conversion_rate: uniqueVisitors > 0
          ? Math.round((rsvp_count / uniqueVisitors) * 1000) / 10
          : 0,
        period: {
          currentViews: uniqueVisitors,
          currentUnique: uniqueVisitors,
          prevViews: prevUniqueVisitors,
          prevUnique: prevUniqueVisitors,
          viewsChange,
          uniqueChange,
        },
      });
    } catch (err) {
      console.error("[host] event analytics error:", err.message);
      return res.status(500).json({ error: "Failed to fetch analytics" });
    }
  });
}
