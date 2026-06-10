// Admin analytics overview dashboard payload — campaign email send/open/click
// totals plus top event-view and Spotify link clicks for the selected range.
import { requireAdmin } from "../middleware/auth.js";
import { resolveAnalyticsRange } from "../lib/analyticsRange.js";

export function registerAdminAnalyticsOverviewRoutes(app) {
// ---------------------------
app.get("/admin/analytics/overview", requireAdmin, async (req, res) => {
  try {
    const { supabase: sb } = await import("../supabase.js");
    const { periodStart, periodEnd } = resolveAnalyticsRange(req);

    const { data: outboxRows } = await sb
      .from("email_outbox")
      .select("id, tracking_id, campaign_tag")
      .not("campaign_tag", "is", null)
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString());

    const allOutbox = outboxRows || [];
    const totalSent = allOutbox.length;
    const totalCampaigns = new Set(allOutbox.map(r => r.campaign_tag)).size;
    const campaignTrackingIds = allOutbox.map(r => r.tracking_id);

    // Fetch opens and clicks scoped to campaign tracking_ids in this range.
    // Top-link aggregation must use the SAME tracking_id scope so "Top
    // event views" reflects only the campaigns sent in the picker's
    // window — otherwise it leaks lifetime clicks into a windowed view.
    const [opensRes, clicksRes, topLinksRes] = await Promise.all([
      campaignTrackingIds.length > 0
        ? sb.from("email_opens").select("tracking_id").in("tracking_id", campaignTrackingIds)
        : Promise.resolve({ data: [] }),
      campaignTrackingIds.length > 0
        ? sb.from("email_clicks").select("tracking_id").in("tracking_id", campaignTrackingIds)
        : Promise.resolve({ data: [] }),
      campaignTrackingIds.length > 0
        ? sb.from("email_clicks").select("link_url, link_label").in("tracking_id", campaignTrackingIds)
        : Promise.resolve({ data: [] }),
    ]);

    const uniqueOpens = new Set((opensRes.data || []).map(o => o.tracking_id)).size;
    const uniqueClicks = new Set((clicksRes.data || []).map(c => c.tracking_id)).size;

    // Aggregate clicks per URL
    const linkClickMap = {};
    for (const c of (topLinksRes.data || [])) {
      const key = c.link_url;
      if (!linkClickMap[key]) {
        linkClickMap[key] = { link_url: c.link_url, link_label: c.link_label, clicks: 0 };
      }
      linkClickMap[key].clicks++;
    }
    const allLinks = Object.values(linkClickMap);

    // Collect slugs and external URLs for title resolution
    const ovSlugSet = new Set();
    const ovExternalUrls = [];
    for (const l of allLinks) {
      try {
        const u = new URL(l.link_url);
        const m = u.pathname.match(/^\/e\/([^/?]+)/);
        if (m) {
          ovSlugSet.add(m[1]);
        } else if (l.link_label === "view_event" || l.link_label === "link") {
          ovExternalUrls.push(l.link_url);
        }
      } catch {}
    }

    const ovUrlToTitle = {};
    if (ovSlugSet.size > 0) {
      try {
        const { data: evs } = await sb.from("events").select("slug, title").in("slug", [...ovSlugSet]);
        for (const ev of (evs || [])) {
          if (ev.slug && ev.title) ovUrlToTitle[`slug:${ev.slug}`] = ev.title;
        }
      } catch {}
    }
    if (ovExternalUrls.length > 0) {
      try {
        const { data: sthlmEvs } = await sb.from("stockholm_events").select("title, url").in("url", ovExternalUrls);
        for (const ev of (sthlmEvs || [])) {
          if (ev.url && ev.title) ovUrlToTitle[`url:${ev.url}`] = ev.title;
        }
      } catch {}
    }

    // Resolve title for each link and group by event
    function resolveTitle(l) {
      try {
        const u = new URL(l.link_url);
        const m = u.pathname.match(/^\/e\/([^/?]+)/);
        if (m && ovUrlToTitle[`slug:${m[1]}`]) return ovUrlToTitle[`slug:${m[1]}`];
        if (ovUrlToTitle[`url:${l.link_url}`]) return ovUrlToTitle[`url:${l.link_url}`];
      } catch {}
      return null;
    }

    // Group by event title for event views (view_event, link, cta labels)
    const eventViewMap = {};
    const spotifyMap = {};
    for (const l of allLinks) {
      const title = resolveTitle(l);
      const displayTitle = title || l.link_url;
      if (l.link_label === "spotify") {
        if (!spotifyMap[displayTitle]) spotifyMap[displayTitle] = { title: displayTitle, clicks: 0 };
        spotifyMap[displayTitle].clicks += l.clicks;
      } else if (["view_event", "link", "cta"].includes(l.link_label)) {
        if (!eventViewMap[displayTitle]) eventViewMap[displayTitle] = { title: displayTitle, clicks: 0 };
        eventViewMap[displayTitle].clicks += l.clicks;
      }
    }

    const topEventViews = Object.values(eventViewMap)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5);
    const topSpotifyClicks = Object.values(spotifyMap)
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 5);

    return res.json({
      total_campaigns: totalCampaigns,
      total_sent: totalSent,
      total_opens: uniqueOpens,
      total_clicks: uniqueClicks,
      avg_open_rate: totalSent > 0 ? Math.round((uniqueOpens / totalSent) * 1000) / 10 : 0,
      avg_click_rate: totalSent > 0 ? Math.round((uniqueClicks / totalSent) * 1000) / 10 : 0,
      top_event_views: topEventViews,
      top_spotify_clicks: topSpotifyClicks,
    });
  } catch (err) {
    console.error("[admin] analytics overview error:", err.message);
    return res.status(500).json({ error: "Failed to fetch analytics overview" });
  }
});
}
