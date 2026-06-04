import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { TrendingUp, TrendingDown, Minus, Monitor, Smartphone, Users, MapPin, Calendar, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { DateRangePicker } from "../components/DateRangePicker.jsx";

// Past-only quick ranges for the analytics date picker. Replaces the old
// 7/14/30/90-button row so admin gets the full calendar UX with custom
// ranges + the common presets.
function buildLastDays(n) {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setDate(start.getDate() - n + 1);
  start.setHours(0, 0, 0, 0);
  return [start, end];
}
const ANALYTICS_QUICK_RANGES = [
  { label: "Last 7 days", getRange: () => buildLastDays(7) },
  { label: "Last 14 days", getRange: () => buildLastDays(14) },
  { label: "Last 30 days", getRange: () => buildLastDays(30) },
  { label: "Last 60 days", getRange: () => buildLastDays(60) },
  { label: "Last 90 days", getRange: () => buildLastDays(90) },
];

export function AnalyticsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // Two views: platform-wide PullUp analytics (default), or a list of every
  // event that opens the same per-event analytics page the host sees.
  const [tab, setTab] = useState("pullup");

  const [overview, setOverview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pageviews, setPageviews] = useState(null);
  // Single date range drives every time-bound query on this page. Default:
  // last 30 days. Admin picks via the DateRangePicker at the top.
  const [dateRange, setDateRange] = useState(() => {
    const [s, e] = buildLastDays(30);
    return { startDate: s, endDate: e };
  });
  const rangeQuery = useMemo(() => {
    if (!dateRange.startDate || !dateRange.endDate) return "";
    return `startDate=${dateRange.startDate.toISOString()}&endDate=${dateRange.endDate.toISOString()}`;
  }, [dateRange]);
  const periodDays = useMemo(() => {
    if (!dateRange.startDate || !dateRange.endDate) return 30;
    return Math.max(
      1,
      Math.round(
        (dateRange.endDate.getTime() - dateRange.startDate.getTime()) / 86400000,
      ),
    );
  }, [dateRange]);
  const [partnerClicks, setPartnerClicks] = useState(null);
  const [funnel, setFunnel] = useState(null);
  const [activitySeries, setActivitySeries] = useState(null);
  const [signupsSeries, setSignupsSeries] = useState(null);


  // Overview + campaigns now follow the date picker too — every campaign
  // KPI on the page is scoped to the chosen window. When the picker moves,
  // we close any expanded detail (its tag may not exist in the new window)
  // and refetch.
  useEffect(() => {
    if (!user) return;
    async function fetchAll() {
      setCampaignsLoading(true);
      try {
        const [overviewRes, campaignsRes] = await Promise.all([
          authenticatedFetch(`/admin/analytics/overview?${rangeQuery}`),
          authenticatedFetch(`/admin/analytics/campaigns?${rangeQuery}`),
        ]);
        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (campaignsRes.ok) {
          const data = await campaignsRes.json();
          setCampaigns(data.campaigns || []);
        }
      } catch {
        setCampaigns([]);
      } finally {
        setCampaignsLoading(false);
      }
    }
    setSelectedCampaign(null);
    setDetail(null);
    fetchAll();
  }, [user, rangeQuery]);

  // Every time-bound query on this page is keyed off `rangeQuery` so the
  // date picker drives the whole view in lockstep. Aggregate snapshots
  // (overview, campaigns) are intentionally NOT range-bound — they're
  // all-time inventory views, not time-series.
  useEffect(() => {
    if (!user) return;
    authenticatedFetch(`/admin/analytics/pageviews?page=landing&${rangeQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPageviews(d); })
      .catch(() => {});
  }, [user, rangeQuery]);

  useEffect(() => {
    if (!user) return;
    authenticatedFetch(`/admin/analytics/landing-funnel?${rangeQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setFunnel(d); })
      .catch(() => {});
  }, [user, rangeQuery]);

  useEffect(() => {
    if (!user) return;
    authenticatedFetch(`/admin/analytics/activity-series?${rangeQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setActivitySeries(d); })
      .catch(() => {});
  }, [user, rangeQuery]);

  useEffect(() => {
    if (!user) return;
    authenticatedFetch(`/admin/analytics/signups-series?${rangeQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setSignupsSeries(d); })
      .catch(() => {});
  }, [user, rangeQuery]);

  useEffect(() => {
    if (!user) return;
    authenticatedFetch(`/admin/analytics/partner-clicks?${rangeQuery}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setPartnerClicks(d); })
      .catch(() => {});
  }, [user, rangeQuery]);

  async function loadDetail(tag) {
    if (selectedCampaign === tag) {
      setSelectedCampaign(null);
      setDetail(null);
      return;
    }
    setSelectedCampaign(tag);
    setDetailLoading(true);
    try {
      const res = await authenticatedFetch(`/admin/analytics/campaigns/${encodeURIComponent(tag)}`);
      if (!res.ok) throw new Error();
      setDetail(await res.json());
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  }

  function formatTag(tag) {
    return tag
      .replace(/_/g, " ")
      .replace(/\bw(\d+)/, "W$1")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (loading) return null;

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        padding: "72px clamp(12px, 3vw, 24px) 60px",
        background: "#fff",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            marginBottom: 16,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, color: colors.text }}>
              Analytics
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: colors.textSubtle }}>
              {tab === "pullup"
                ? "Activity, funnel and campaigns — bound to the date range below."
                : "Every event on the platform — open one to see its host analytics."}
            </p>
          </div>
          {tab === "pullup" && (
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={(s, e) => setDateRange({ startDate: s, endDate: e })}
              allowPast
              blockFuture
              quickRanges={ANALYTICS_QUICK_RANGES}
            />
          )}
        </div>

        {/* Tab strip — platform-wide analytics vs. the per-event list */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          {[
            { key: "pullup", label: "PullUp Analytics" },
            { key: "events", label: "All Events" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "6px 16px",
                borderRadius: "999px",
                border: tab === t.key ? `1px solid ${colors.accentBorder}` : `1px solid transparent`,
                background: tab === t.key ? colors.accentSoft : "transparent",
                color: tab === t.key ? colors.accent : colors.textSubtle,
                fontSize: "13px",
                fontWeight: tab === t.key ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "events" && (
          <AllEventsTab onOpenFull={(id) => navigate(`/app/events/${id}/analytics`)} />
        )}

        {tab === "pullup" && (
          <>
        {/* Landing Page Views */}
        {pageviews && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <SectionLabel>Landing Page — pullup.se</SectionLabel>
              <div style={{ fontSize: 11, color: colors.textFaded }}>
                last {periodDays}d
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: "24px", fontWeight: 700, color: colors.text }}>
                  {pageviews.totalViews.toLocaleString()}
                </span>
                <span style={{ fontSize: "12px", color: colors.textSubtle }}>views</span>
                <ChangeIndicator value={pageviews.viewsChange} />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: "24px", fontWeight: 700, color: colors.accent }}>
                  {pageviews.uniqueVisitors.toLocaleString()}
                </span>
                <span style={{ fontSize: "12px", color: colors.textSubtle }}>unique</span>
                <ChangeIndicator value={pageviews.uniqueChange} />
              </div>
              {signupsSeries && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: "24px", fontWeight: 700, color: colors.secondary }}>
                    {(signupsSeries.totalSignups ?? 0).toLocaleString()}
                  </span>
                  <span style={{ fontSize: "12px", color: colors.textSubtle }}>new users</span>
                  <ChangeIndicator value={signupsSeries.signupsChange} />
                </div>
              )}
              {pageviews.device_split && (pageviews.device_split.mobile > 0 || pageviews.device_split.desktop > 0) && (
                <DeviceDonut mobile={pageviews.device_split.mobile} desktop={pageviews.device_split.desktop} />
              )}
            </div>

            {/* Stacked bar chart — sources by day, with daily signups
                overlaid as a line on the right axis. Lets us read traffic
                shape and signup yield in one chart. */}
            {pageviews.daily && pageviews.daily.length > 0 && (
              <LandingDailyChart
                daily={pageviews.daily}
                allSources={[...new Set((pageviews.sources || []).map(s => s.source))]}
                lineOverlay={
                  signupsSeries?.buckets?.length > 0
                    ? {
                        label: "New users",
                        color: colors.secondary,
                        byDate: Object.fromEntries(
                          signupsSeries.buckets.map((b) => [b.date, b.signups]),
                        ),
                      }
                    : null
                }
              />
            )}

            {/* Source breakdown */}
            {pageviews.sources && pageviews.sources.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {pageviews.sources.map((s) => (
                  <div key={s.source} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 10px", borderRadius: 8,
                    background: colors.surface,
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: 2, background: getLandingSourceColor(s.source), flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: colors.textMuted, flex: 1 }}>{s.source}</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: colors.text }}>{s.count}</span>
                    <span style={{ fontSize: "11px", color: colors.textFaded, minWidth: 36, textAlign: "right" }}>{s.percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Landing page conversion funnel */}
        {funnel && funnel.stages && funnel.stages[0].count > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Conversion Funnel</SectionLabel>
            <div style={{
              borderRadius: 14,
              background: "#fff",
              border: `1px solid ${colors.border}`,
              padding: "16px",
              boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
            }}>
              <div style={{
                fontSize: 11,
                color: colors.textSubtle,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 12,
              }}>
                Landing → account · last {funnel.periodDays}d
              </div>

              {funnel.stages.map((s, i) => {
                const widthPct = funnel.stages[0].count > 0
                  ? Math.max(2, (s.count / funnel.stages[0].count) * 100)
                  : 0;
                const isLeak = i > 0 && s.pctOfPrev < 100;
                return (
                  <div key={s.key} style={{ marginBottom: i === funnel.stages.length - 1 ? 0 : 10 }}>
                    <div style={{
                      display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4,
                    }}>
                      <span style={{ fontSize: 13, color: colors.text, fontWeight: 500 }}>{s.label}</span>
                      <span style={{ fontSize: 13, color: colors.text, fontWeight: 700 }}>{s.count}</span>
                      <span style={{ flex: 1 }} />
                      {i > 0 && (
                        <span style={{
                          fontSize: 11,
                          color: isLeak ? colors.textSubtle : colors.success,
                        }}>
                          {s.pctOfPrev}% of previous
                        </span>
                      )}
                      <span style={{
                        fontSize: 11, color: colors.textFaded, minWidth: 46, textAlign: "right",
                      }}>
                        {s.pctOfView}% of view
                      </span>
                    </div>
                    <div style={{
                      height: 8,
                      borderRadius: 4,
                      background: colors.borderFaint,
                      overflow: "hidden",
                    }}>
                      <div style={{
                        width: `${widthPct}%`,
                        height: "100%",
                        background: s.key === "signed_in"
                          ? `linear-gradient(90deg, ${colors.gold}, rgba(180,83,9,0.6))`
                          : `linear-gradient(90deg, ${colors.accent}, ${colors.accentSoftStrong})`,
                        transition: "width 0.4s ease",
                      }} />
                    </div>
                  </div>
                );
              })}

              {funnel.sources && funnel.sources.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${colors.borderFaint}` }}>
                  <div style={{
                    fontSize: 10, color: colors.textFaded,
                    letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8,
                  }}>
                    By source
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {funnel.sources.map((s) => {
                      const rate = s.view > 0
                        ? Math.round((s.signed_in / s.view) * 1000) / 10
                        : 0;
                      return (
                        <div key={s.source} style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "5px 10px", borderRadius: 8,
                          background: colors.surface,
                          fontSize: 12,
                        }}>
                          <span style={{ color: colors.textMuted, flex: 1 }}>{s.source}</span>
                          <span style={{ color: colors.textSubtle }}>
                            {s.view} → {s.cta_click} → {s.auth_start} → {s.signed_in}
                          </span>
                          <span style={{
                            fontWeight: 600,
                            color: rate > 0 ? colors.gold : colors.textFaded,
                            minWidth: 46, textAlign: "right",
                          }}>
                            {rate}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity over time — events created (bars) + RSVPs collected
            per day (line). Sits between Conversion Funnel and Partner
            Clicks: after the funnel snapshot, this is the natural next
            question — "are hosts publishing and is the list growing?". */}
        {activitySeries && activitySeries.buckets?.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <SectionLabel>Activity</SectionLabel>
              <div style={{ fontSize: 11, color: colors.textFaded }}>
                Events created &middot; emails collected · last {activitySeries.periodDays}d
              </div>
            </div>
            <div
              style={{
                borderRadius: 14,
                background: "#fff",
                border: `1px solid ${colors.border}`,
                padding: 16,
                boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
              }}
            >
              {(() => {
                const totalEvents = activitySeries.totalEvents
                  ?? activitySeries.buckets.reduce((s, b) => s + (b.eventsCreated || 0), 0);
                const totalRsvps = activitySeries.totalRsvps
                  ?? activitySeries.buckets.reduce((s, b) => s + (b.rsvps || 0), 0);
                return (
                  <div
                    style={{
                      display: "flex",
                      gap: 24,
                      flexWrap: "wrap",
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: colors.secondary }}>
                        {totalEvents.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 12, color: colors.textSubtle }}>
                        events created
                      </span>
                      <ChangeIndicator value={activitySeries.eventsChange} />
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 24, fontWeight: 700, color: colors.accent }}>
                        {totalRsvps.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 12, color: colors.textSubtle }}>
                        emails collected (RSVPs)
                      </span>
                      <ChangeIndicator value={activitySeries.rsvpsChange} />
                    </div>
                  </div>
                );
              })()}
              <TimeSeriesChart
                buckets={activitySeries.buckets}
                bars={{ key: "eventsCreated", label: "Events created", color: colors.secondary }}
                line={{ key: "rsvps", label: "Emails collected", color: colors.accent }}
              />
            </div>
          </div>
        )}

        {/* Partner CTA Clicks */}
        {partnerClicks && partnerClicks.totalClicks > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Partner Clicks</SectionLabel>
            <div style={{
              borderRadius: 14,
              background: "#fff",
              border: `1px solid ${colors.border}`,
              padding: "16px",
              boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
            }}>
              {/* Partner rows */}
              {partnerClicks.partners.map((p, i) => (
                <div key={p.slug} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 0",
                  borderBottom: i < partnerClicks.partners.length - 1 ? `1px solid ${colors.borderFaint}` : "none",
                }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: colors.text, textTransform: "capitalize", minWidth: 100 }}>
                    {p.slug}
                  </span>
                  {/* Mini bar */}
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: colors.borderFaint, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      width: `${Math.min(100, (p.total / Math.max(...partnerClicks.partners.map(x => x.total))) * 100)}%`,
                      background: `linear-gradient(90deg, ${colors.gold}, rgba(180,83,9,0.4))`,
                    }} />
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: colors.text, minWidth: 28, textAlign: "right" }}>{p.total}</span>
                  <span style={{ fontSize: "11px", color: colors.textFaded, minWidth: 50 }}>{p.unique} uniq</span>
                </div>
              ))}

              {/* Top events */}
              {partnerClicks.topEvents && partnerClicks.topEvents.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "11px", color: colors.textFaded, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    By event
                  </div>
                  {partnerClicks.topEvents.map((ev) => (
                    <div key={ev.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "4px 0",
                    }}>
                      <span style={{ fontSize: "12px", color: colors.textSubtle, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.title}
                      </span>
                      {Object.entries(ev.byPartner).map(([partner, count]) => (
                        <span key={partner} style={{ fontSize: "11px", color: colors.textFaded, textTransform: "capitalize" }}>
                          {partner} {count}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Per-click detail: who clicked, which event, when */}
              {partnerClicks.recentClicks && partnerClicks.recentClicks.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border}` }}>
                  <div style={{ fontSize: "11px", color: colors.textFaded, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Recent clicks
                  </div>
                  {partnerClicks.recentClicks.map((c) => (
                    <div key={c.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "5px 0",
                      borderBottom: `1px solid ${colors.borderFaint}`,
                      fontSize: "12px",
                    }}>
                      <span style={{ textTransform: "capitalize", color: colors.gold, fontWeight: 600, minWidth: 84 }}>
                        {c.partnerSlug}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.host ? (c.host.name || c.host.email || "Host") : (
                          <span style={{ fontStyle: "italic", color: colors.textFaded }}>Anonymous</span>
                        )}
                        <span style={{ color: colors.textFaded }}> · {c.eventTitle}</span>
                      </span>
                      <span style={{ color: colors.textFaded, whiteSpace: "nowrap" }}>
                        {new Date(c.clickedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Email Marketing section */}
        <h2 style={{ margin: "0 0 14px", fontSize: "17px", fontWeight: 600, color: colors.text }}>
          Email Marketing
        </h2>

        {/* Overview stats */}
        {overview && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 24 }}>
              <OverviewCard label="Campaigns" value={overview.total_campaigns} />
              <OverviewCard label="Emails Sent" value={overview.total_sent} />
              <OverviewCard label="Avg Open Rate" value={`${overview.avg_open_rate}%`} color={colors.accent} />
              <OverviewCard label="Avg Click Rate" value={`${overview.avg_click_rate}%`} color={colors.success} />
            </div>

            {/* Top event views */}
            {overview.top_event_views && overview.top_event_views.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <SectionLabel>Top Event Views</SectionLabel>
                <TopList items={overview.top_event_views} color={colors.success} />
              </div>
            )}

            {/* Top spotify clicks */}
            {overview.top_spotify_clicks && overview.top_spotify_clicks.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionLabel>Top Spotify Clicks</SectionLabel>
                <TopList items={overview.top_spotify_clicks} color="rgba(30,215,96,0.8)" />
              </div>
            )}

          </>
        )}

        {/* Campaign list — only newsletter campaigns */}
        <SectionLabel>Newsletter Campaigns</SectionLabel>
        {campaignsLoading ? (
          <div style={{ fontSize: "13px", opacity: 0.5, textAlign: "center", padding: "40px 0" }}>
            Loading campaigns...
          </div>
        ) : campaigns.filter((c) => !c.campaign_tag.startsWith("vip_invite_") && !c.campaign_tag.startsWith("cohost_")).length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "14px", color: colors.textSubtle }}>
              No newsletter campaigns sent yet. Analytics will appear after your first send.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {campaigns.filter((c) => !c.campaign_tag.startsWith("vip_invite_") && !c.campaign_tag.startsWith("cohost_")).map((c) => (
              <div key={c.campaign_tag}>
                {/* Campaign row */}
                <button
                  onClick={() => loadDetail(c.campaign_tag)}
                  style={{
                    width: "100%",
                    padding: "16px",
                    borderRadius: selectedCampaign === c.campaign_tag ? "14px 14px 0 0" : "14px",
                    border: `1px solid ${selectedCampaign === c.campaign_tag ? colors.accentBorder : colors.border}`,
                    background: selectedCampaign === c.campaign_tag
                      ? colors.accentSoft
                      : "#fff",
                    color: colors.text,
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    borderBottom: selectedCampaign === c.campaign_tag ? "none" : undefined,
                    boxShadow: selectedCampaign === c.campaign_tag ? "none" : "0 8px 30px rgba(10,10,10,0.06)",
                  }}
                >
                  {/* Title + date */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>
                      {formatTag(c.campaign_tag)}
                    </span>
                    <span style={{ fontSize: "11px", color: colors.textSubtle }}>
                      {formatDate(c.sent_at)}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "flex", gap: "clamp(12px, 3vw, 24px)", flexWrap: "wrap" }}>
                    <StatPill label="Sent" value={c.total_sent} />
                    <StatPill label="Opens" value={c.unique_opens} sub={`${c.open_rate}%`} color={colors.accent} />
                    <StatPill label="Clicks" value={c.unique_clicks} sub={`${c.click_rate}%`} color={colors.success} />
                  </div>
                </button>

                {/* Detail panel */}
                {selectedCampaign === c.campaign_tag && (
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "0 0 14px 14px",
                      border: `1px solid ${colors.accentBorder}`,
                      borderTop: `1px solid ${colors.border}`,
                      background: colors.surface,
                    }}
                  >
                    {detailLoading ? (
                      <div style={{ fontSize: "13px", opacity: 0.5, textAlign: "center", padding: "12px 0" }}>
                        Loading...
                      </div>
                    ) : !detail ? (
                      <div style={{ fontSize: "13px", opacity: 0.4, textAlign: "center" }}>
                        Failed to load details
                      </div>
                    ) : (
                      <>
                        {/* Rates bar */}
                        <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                          <RateBar label="Open rate" rate={detail.open_rate} color={colors.accent} />
                          <RateBar label="Click rate" rate={detail.click_rate} color={colors.success} />
                        </div>

                        {/* Per-event breakdown with link type details */}
                        {detail.events_breakdown && detail.events_breakdown.length > 0 ? (
                          <div>
                            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textFaded, marginBottom: 8 }}>
                              Events in this campaign
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {detail.events_breakdown.map((ev, i) => {
                                const maxClicks = detail.events_breakdown[0].total_clicks;
                                return (
                                  <div
                                    key={ev.slug}
                                    style={{
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      background: "#fff",
                                      border: `1px solid ${colors.border}`,
                                      boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
                                    }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                      <span style={{
                                        width: 24, height: 24, borderRadius: 7,
                                        background: i === 0 ? colors.accentSoft : i === 1 ? colors.surface : colors.borderFaint,
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: "11px", fontWeight: 700,
                                        color: i === 0 ? colors.accent : colors.textMuted,
                                        flexShrink: 0,
                                      }}>
                                        {i + 1}
                                      </span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                          fontSize: "13px", fontWeight: 600, color: colors.text,
                                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                        }}>
                                          {ev.title}
                                        </div>
                                      </div>
                                      <div style={{ width: 60, height: 6, borderRadius: 3, background: colors.borderFaint, flexShrink: 0 }}>
                                        <div style={{
                                          height: "100%", borderRadius: 3,
                                          background: i === 0 ? colors.accent : colors.success,
                                          width: `${Math.round((ev.total_clicks / maxClicks) * 100)}%`,
                                        }} />
                                      </div>
                                      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 50 }}>
                                        <div style={{ fontSize: "14px", fontWeight: 700, color: i === 0 ? colors.accent : colors.text }}>
                                          {ev.unique_clicks} <span style={{ fontSize: "10px", fontWeight: 400, color: colors.textFaded }}>/ {ev.total_clicks}</span>
                                        </div>
                                        <div style={{ fontSize: "10px", color: colors.textFaded }}>
                                          unique / total
                                        </div>
                                      </div>
                                    </div>
                                    {/* Per-link-type breakdown */}
                                    <div style={{ display: "flex", gap: 12, marginTop: 6, marginLeft: 34 }}>
                                      {ev.links.map((l, li) => (
                                        <div key={li} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          <span style={{
                                            width: 6, height: 6, borderRadius: "50%",
                                            background: l.label === "spotify" ? "#16a34a" : colors.secondary,
                                            flexShrink: 0,
                                          }} />
                                          <span style={{ fontSize: "11px", color: colors.textFaded }}>
                                            {formatLinkLabel(l.label)}
                                          </span>
                                          <span style={{ fontSize: "11px", fontWeight: 600, color: l.label === "spotify" ? "#16a34a" : colors.textMuted }}>
                                            {l.total_clicks}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div style={{ fontSize: "12px", color: colors.textFaded, textAlign: "center", padding: "8px 0" }}>
                            No clicks recorded yet.
                          </div>
                        )}

                        {/* Recipient activity */}
                        {detail.recipients && detail.recipients.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textFaded, marginBottom: 8 }}>
                              Recipient Activity
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {detail.recipients.map((r, i) => (
                                <div
                                  key={i}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    background: "#fff",
                                    border: `1px solid ${colors.border}`,
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{
                                      width: 6, height: 6, borderRadius: "50%",
                                      background: r.clicked ? colors.success : r.opened ? colors.accent : colors.border,
                                      flexShrink: 0,
                                    }} />
                                    <div style={{ flex: 1, fontSize: "12px", color: colors.text, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {r.email}
                                    </div>
                                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                      {r.opened && (
                                        <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: 4, background: colors.accentSoft, color: colors.accent }}>
                                          opened
                                        </span>
                                      )}
                                      {r.clicked && (
                                        <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: 4, background: colors.successRgba, color: colors.success }}>
                                          clicked
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {r.clicks.length > 0 && (
                                    <div style={{ marginTop: 4, marginLeft: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                                      {r.clicks.map((c, ci) => (
                                        <div key={ci} style={{ fontSize: "11px", color: colors.textFaded, display: "flex", gap: 6 }}>
                                          <span style={{ color: colors.textSubtle }}>
                                            {c.event_title || truncateUrl(c.link_url)}
                                          </span>
                                          <span style={{ color: c.link_label === "spotify" ? colors.success : colors.textFaded }}>
                                            {formatLinkLabel(c.link_label)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}

// Derive a live/upcoming/past status from the event's start/end the same way
// the admin Platform Events page does, so badges read consistently.
const EVENT_STATUS_BADGE = {
  live: { bg: "rgba(22,163,74,0.10)", text: "#16a34a", border: "rgba(22,163,74,0.25)", label: "Live" },
  upcoming: { bg: "rgba(236,23,143,0.08)", text: "#ec178f", border: "rgba(236,23,143,0.25)", label: "Upcoming" },
  past: { bg: "rgba(10,10,10,0.06)", text: "rgba(10,10,10,0.45)", border: "rgba(10,10,10,0.12)", label: "Past" },
};

function eventStatus(ev) {
  const now = new Date();
  const start = new Date(ev.startsAt);
  const end = ev.endsAt ? new Date(ev.endsAt) : new Date(start.getTime() + 3 * 60 * 60 * 1000);
  if (now > end) return "past";
  if (now >= start && now <= end) return "live";
  return "upcoming";
}

const PAGE_SIZE = 10;

// All Events tab — every event on the platform, ongoing and past. The list
// pages in chronologically (10 upcoming soonest-first, then past newest-first)
// with a Load more button, so it scales as the platform grows. Clicking a row
// expands a compact analytics overview inline (fetched on demand); a link in
// the panel opens the full host analytics page.
function AllEventsTab({ onOpenFull }) {
  const [events, setEvents] = useState([]);
  // Cursor walks the virtual list: upcoming first, then past, then null (done).
  const [cursor, setCursor] = useState({ phase: "upcoming", offset: 0 });
  const [loading, setLoading] = useState(true); // first page
  const [loadingMore, setLoadingMore] = useState(false);
  const [done, setDone] = useState(false);

  const [expandedId, setExpandedId] = useState(null);
  const [analytics, setAnalytics] = useState({}); // id -> { loading, data }

  async function fetchPage(phase, offset) {
    const res = await authenticatedFetch(
      `/admin/platform-events?filter=${phase}&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    const data = res.ok ? await res.json() : { events: [] };
    return data.events || [];
  }

  // Load the next batch from `startCursor`, skipping any exhausted phase so a
  // click never lands on an empty result. Appends unless `isInitial`.
  async function loadBatch(startCursor, isInitial) {
    if (isInitial) setLoading(true); else setLoadingMore(true);
    let { phase, offset } = startCursor;
    let collected = null;
    while (phase) {
      let got = [];
      try { got = await fetchPage(phase, offset); } catch { got = []; }
      if (got.length > 0) {
        collected = got;
        if (got.length < PAGE_SIZE) {
          // phase drained — advance for next click
          if (phase === "upcoming") setCursor({ phase: "past", offset: 0 });
          else { setCursor({ phase: null, offset: 0 }); setDone(true); }
        } else {
          setCursor({ phase, offset: offset + got.length });
        }
        break;
      }
      if (phase === "upcoming") { phase = "past"; offset = 0; }
      else { phase = null; setDone(true); }
    }
    if (collected) setEvents((prev) => (isInitial ? collected : [...prev, ...collected]));
    if (isInitial) setLoading(false); else setLoadingMore(false);
  }

  useEffect(() => {
    loadBatch({ phase: "upcoming", offset: 0 }, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(ev) {
    if (expandedId === ev.id) { setExpandedId(null); return; }
    setExpandedId(ev.id);
    if (analytics[ev.id]) return; // cached
    setAnalytics((a) => ({ ...a, [ev.id]: { loading: true, data: null } }));
    // Window the query to the event's lifetime so past events still show their
    // numbers (a 30-day default would read zero). Activity can't predate the
    // event row, so start a day before it was created and run through now.
    const start = ev.createdAt
      ? new Date(new Date(ev.createdAt).getTime() - 86400000)
      : new Date("2020-01-01");
    const params = new URLSearchParams({
      startDate: start.toISOString(),
      endDate: new Date().toISOString(),
    });
    try {
      const res = await authenticatedFetch(`/host/events/${ev.id}/analytics?${params}`);
      const data = res.ok ? await res.json() : null;
      setAnalytics((a) => ({ ...a, [ev.id]: { loading: false, data } }));
    } catch {
      setAnalytics((a) => ({ ...a, [ev.id]: { loading: false, data: null } }));
    }
  }

  function fmtDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: colors.textFaded, fontSize: 13 }}>
        Loading…
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 0", color: colors.textFaded, fontSize: 13 }}>
        No events found
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.map((ev) => {
        const badge = EVENT_STATUS_BADGE[eventStatus(ev)];
        const isOpen = expandedId === ev.id;
        const entry = analytics[ev.id];
        return (
          <div key={ev.id}>
            {/* Row header — click to expand the inline overview */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggle(ev)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(ev); } }}
              style={{
                cursor: "pointer",
                background: isOpen ? colors.surface : "#fff",
                border: isOpen ? `1px solid ${colors.borderStrong}` : `1px solid ${colors.border}`,
                borderRadius: isOpen ? "14px 14px 0 0" : 14,
                padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 10,
                boxShadow: isOpen ? "none" : "0 2px 8px rgba(10,10,10,0.04)",
              }}
            >
              <span style={{
                padding: "2px 8px", borderRadius: "999px", fontSize: "10px", fontWeight: 600,
                background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`,
                textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
              }}>
                {badge.label}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ev.title || "Untitled"}
                  </span>
                  {ev.host && (
                    <span style={{
                      fontSize: 11, color: colors.textSubtle, flexShrink: 0,
                      padding: "1px 7px", borderRadius: "999px",
                      background: colors.surface, border: `1px solid ${colors.border}`,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200,
                    }}>
                      {ev.host.name || ev.host.email}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: colors.textSubtle, marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {ev.location && (
                    <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <MapPin size={10} /> {ev.location.length > 30 ? ev.location.slice(0, 30) + "…" : ev.location}
                    </span>
                  )}
                  <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Calendar size={10} /> {fmtDate(ev.startsAt)}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, fontSize: 13, fontWeight: 600, color: colors.textMuted }}>
                <Users size={14} />
                {ev.confirmedGuests}{ev.capacity > 0 && <span style={{ opacity: 0.5 }}>/{ev.capacity}</span>}
              </div>
              <div style={{ flexShrink: 0, color: colors.textSubtle, display: "flex" }}>
                {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>

            {/* Inline analytics overview */}
            {isOpen && (
              <div style={{
                background: colors.surface,
                border: `1px solid ${colors.borderStrong}`,
                borderTop: "none",
                borderRadius: "0 0 14px 14px",
                padding: "14px 16px 16px",
              }}>
                <EventOverview entry={entry} onOpenFull={() => onOpenFull(ev.id)} />
              </div>
            )}
          </div>
        );
      })}

      {/* Load more */}
      {!done && (
        <button
          onClick={() => loadBatch(cursor, false)}
          disabled={loadingMore}
          style={{
            marginTop: 4, padding: "10px 16px", borderRadius: 12,
            border: `1px solid ${colors.border}`,
            background: "#fff",
            color: loadingMore ? colors.textFaded : colors.textMuted,
            fontSize: 13, fontWeight: 500, cursor: loadingMore ? "default" : "pointer",
          }}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

// Compact per-event analytics shown inline under an event row. Headline funnel
// numbers + top sources; "Open full analytics" jumps to the host page.
function EventOverview({ entry, onOpenFull }) {
  if (!entry || entry.loading) {
    return <div style={{ fontSize: 13, color: colors.textFaded, padding: "8px 0" }}>Loading analytics…</div>;
  }
  const d = entry.data;
  if (!d) {
    return <div style={{ fontSize: 13, color: colors.textFaded, padding: "8px 0" }}>Couldn’t load analytics.</div>;
  }
  const noData = (d.total_views || 0) === 0 && (d.unique_visitors || 0) === 0;
  const sources = (d.sources || []).slice(0, 4);

  return (
    <div>
      {noData ? (
        <div style={{ fontSize: 13, color: colors.textFaded, padding: "4px 0 10px" }}>
          No visitors recorded yet.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: sources.length ? 12 : 4 }}>
            <Stat label="Unique" value={(d.unique_visitors || 0).toLocaleString()} color={colors.accent} />
            <Stat label="Views" value={(d.total_views || 0).toLocaleString()} />
            <Stat label="RSVPs" value={(d.rsvp_count || 0).toLocaleString()} color={colors.secondary} />
            <Stat label="Pulled up" value={(d.pulled_up || 0).toLocaleString()} color={colors.success} />
            {d.is_paid && (
              <Stat label="Revenue" value={fmtRevenue(d.revenue, d.ticket_currency)} color={colors.gold} />
            )}
          </div>

          {sources.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {sources.map((s) => (
                <span key={s.source} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 11, color: colors.textMuted,
                  padding: "3px 9px", borderRadius: 999,
                  background: colors.surface, border: `1px solid ${colors.border}`,
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: getSourceColorLocal(s.source) }} />
                  <span style={{ textTransform: "capitalize" }}>{s.source}</span>
                  <span style={{ color: colors.text, fontWeight: 600 }}>{s.count}</span>
                </span>
              ))}
            </div>
          )}
        </>
      )}

      <button
        onClick={onOpenFull}
        style={{
          marginTop: 12, display: "inline-flex", alignItems: "center", gap: 5,
          padding: "5px 12px", borderRadius: 999,
          border: `1px solid ${colors.accentBorder}`, background: colors.accentSoft,
          color: colors.accent, fontSize: 12, fontWeight: 500, cursor: "pointer",
        }}
      >
        Open full analytics <ExternalLink size={12} />
      </button>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || colors.text, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.textSubtle, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function fmtRevenue(cents, currency = "sek") {
  if (!cents) return currency === "sek" ? "0 kr" : "0";
  const amount = cents / 100;
  const sym = currency === "sek" ? " kr" : currency === "eur" ? "€" : currency === "gbp" ? "£" : "$";
  return ["eur", "gbp", "usd"].includes(currency)
    ? `${sym}${amount.toLocaleString()}`
    : `${amount.toLocaleString()}${sym}`;
}

// Local copy of the per-event source palette (the host analytics page has its
// own); keeps the inline source pills colour-consistent without a shared dep.
const ALL_EVENTS_SOURCE_COLORS = {
  direct: "rgba(10,10,10,0.45)",
  instagram: "rgba(225,48,108,0.85)",
  facebook: "rgba(66,103,178,0.85)",
  twitter: "rgba(29,155,240,0.85)",
  linkedin: "rgba(10,102,194,0.85)",
  tiktok: "rgba(10,10,10,0.55)",
  pullup: "rgba(10,10,10,0.35)",
  pullup_newsletter: "#b45309",
  other: "rgba(168,85,247,0.7)",
};
function getSourceColorLocal(name) {
  return ALL_EVENTS_SOURCE_COLORS[name]
    || `rgba(${60 + ((name.charCodeAt(0) * 37) % 180)},${80 + ((name.charCodeAt(1 % name.length) * 53) % 150)},${120 + ((name.charCodeAt(2 % name.length) * 71) % 130)},0.6)`;
}

function OverviewCard({ label, value, color }) {
  return (
    <div style={{
      padding: 14,
      borderRadius: 12,
      background: "#fff",
      border: `1px solid ${colors.border}`,
      boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      <div style={{ fontSize: "11px", color: colors.textFaded, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: color || colors.text }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em",
      fontWeight: 600, color: colors.textSubtle, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function StatPill({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span style={{ fontSize: "16px", fontWeight: 600, color: color || colors.text }}>
        {value}
      </span>
      <span style={{ fontSize: "11px", color: colors.textFaded }}>
        {label}
      </span>
      {sub && (
        <span style={{ fontSize: "11px", color: color || colors.textFaded, fontWeight: 500 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function RateBar({ label, rate, color }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "11px", color: colors.textSubtle }}>{label}</span>
        <span style={{ fontSize: "12px", fontWeight: 600, color }}>{rate}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: colors.borderFaint }}>
        <div style={{
          height: "100%", borderRadius: 3,
          background: color,
          width: `${Math.min(rate, 100)}%`,
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

function truncateUrl(url) {
  if (!url) return "";
  try {
    const u = new URL(url);
    const path = u.pathname.length > 30 ? u.pathname.slice(0, 30) + "..." : u.pathname;
    return u.hostname + path;
  } catch {
    return url.slice(0, 50);
  }
}

function formatLinkLabel(label) {
  if (!label) return "Link";
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function TopList({ items, color }) {
  const max = items[0]?.clicks || 1;
  return (
    <div style={{
      borderRadius: 14,
      background: "#fff",
      border: `1px solid ${colors.border}`,
      overflow: "hidden",
      boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderBottom: i < items.length - 1 ? `1px solid ${colors.borderFaint}` : "none",
          }}
        >
          <span style={{
            width: 22, height: 22, borderRadius: 6,
            background: i === 0 ? colors.accentSoft : i === 1 ? colors.surface : colors.borderFaint,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "11px", fontWeight: 700,
            color: i === 0 ? colors.accent : colors.textMuted,
            flexShrink: 0,
          }}>
            {i + 1}
          </span>
          <div style={{
            flex: 1, minWidth: 0, fontSize: "12px", fontWeight: 500, color: colors.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.title}
          </div>
          <div style={{ width: 60, height: 4, borderRadius: 2, background: colors.borderFaint, flexShrink: 0 }}>
            <div style={{
              height: "100%", borderRadius: 2, background: color,
              width: `${Math.round((item.clicks / max) * 100)}%`,
            }} />
          </div>
          <div style={{ fontSize: "13px", fontWeight: 600, color, minWidth: 32, textAlign: "right" }}>
            {item.clicks}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChangeIndicator({ value }) {
  if (value === null || value === undefined) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? colors.success : isDown ? colors.danger : colors.textFaded;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "11px", fontWeight: 600, color }}>
      <Icon size={12} />
      {Math.abs(value)}%
    </span>
  );
}

const LANDING_SOURCE_COLORS = {
  direct: "rgba(10,10,10,0.45)",
  instagram: "rgba(225,48,108,0.85)",
  facebook: "rgba(66,103,178,0.85)",
  twitter: "rgba(29,155,240,0.85)",
  linkedin: "rgba(10,102,194,0.85)",
  google: "rgba(66,133,244,0.85)",
  pullup: "rgba(10,10,10,0.35)",
  other: "rgba(168,85,247,0.7)",
};

function getLandingSourceColor(name) {
  return LANDING_SOURCE_COLORS[name] || `rgba(${60 + ((name.charCodeAt(0) * 37) % 180)},${80 + ((name.charCodeAt(1 % name.length) * 53) % 150)},${120 + ((name.charCodeAt(2 % name.length) * 71) % 130)},0.6)`;
}

function DeviceDonut({ mobile, desktop }) {
  const total = mobile + desktop;
  if (total === 0) return null;
  const mobileP = mobile / total;
  const r = 20, stroke = 5, cx = 28, cy = 28;
  const circ = 2 * Math.PI * r;
  const mobileArc = mobileP * circ;
  const desktopArc = (1 - mobileP) * circ;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        {/* Desktop arc */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={colors.accent} strokeWidth={stroke}
          strokeDasharray={`${desktopArc} ${circ}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Mobile arc */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke={colors.secondary} strokeWidth={stroke}
          strokeDasharray={`${mobileArc} ${circ}`}
          strokeDashoffset={-desktopArc}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "11px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: colors.textMuted }}>
          <Smartphone size={11} style={{ color: colors.secondary }} />
          {mobile} <span style={{ color: colors.textFaded }}>({Math.round(mobileP * 100)}%)</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: colors.textMuted }}>
          <Monitor size={11} style={{ color: colors.accent }} />
          {desktop} <span style={{ color: colors.textFaded }}>({Math.round((1 - mobileP) * 100)}%)</span>
        </span>
      </div>
    </div>
  );
}

function LandingDailyChart({ daily, allSources, lineOverlay }) {
  const [hoverDay, setHoverDay] = useState(null);

  const maxDailyViews = Math.max(...daily.map(d => d.views), 1);
  const step = Math.max(1, Math.floor(daily.length / 7));
  const xLabels = daily.map((_, i) => i).filter(i => i % step === 0 || i === daily.length - 1);

  // Right-axis scale for the optional line overlay (e.g. daily signups).
  // Independent of the bar scale so a line of small numbers stays visible
  // even when the views axis is large.
  const lineByDate = lineOverlay?.byDate || null;
  const lineValues = lineByDate
    ? daily.map((d) => Number(lineByDate[d.date] || 0))
    : [];
  const maxLine = lineByDate ? Math.max(1, ...lineValues) : 1;

  const W = 720, H = 160;
  const PAD = { top: 10, right: lineOverlay ? 36 : 8, bottom: 24, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const niceMax = Math.ceil(maxDailyViews / (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1)) * (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1) || 1;
  const barWidth = Math.max(3, (chartW / daily.length) * 0.7);

  const linePoints = lineByDate
    ? daily
        .map((d, i) => {
          const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
          const v = Number(lineByDate[d.date] || 0);
          const y = PAD.top + chartH - (v / maxLine) * chartH;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ")
    : "";

  return (
    <div style={{
      borderRadius: 14, background: "#fff",
      border: `1px solid ${colors.border}`,
      padding: "14px 12px 8px", position: "relative",
      boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHoverDay(null)}
      >
        {/* Grid */}
        {[0, 0.5, 1].map(f => {
          const y = PAD.top + chartH - f * chartH;
          const val = Math.round(f * niceMax);
          return (
            <g key={f}>
              <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke="rgba(10,10,10,0.07)" strokeDasharray="4,4" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fill="rgba(10,10,10,0.35)" fontSize="10">{val}</text>
              {lineOverlay && (
                <text
                  x={PAD.left + chartW + 6}
                  y={y + 3}
                  textAnchor="start"
                  fill={lineOverlay.color}
                  opacity={0.8}
                  fontSize="10"
                >
                  {Math.round(maxLine * f)}
                </text>
              )}
            </g>
          );
        })}

        {/* Stacked bars */}
        {daily.map((d, i) => {
          const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW - barWidth / 2;
          let yOffset = 0;
          const bySource = d.bySource || {};
          const segments = [];
          for (let si = allSources.length - 1; si >= 0; si--) {
            const src = allSources[si];
            const val = bySource[src] || 0;
            if (val === 0) continue;
            const segH = (val / niceMax) * chartH;
            const y = PAD.top + chartH - yOffset - segH;
            segments.push(
              <rect key={`${i}-${src}`} x={x} y={y} width={barWidth} height={segH}
                rx={yOffset === 0 ? 2 : 0} fill={getLandingSourceColor(src)} />
            );
            yOffset += segH;
          }
          return (
            <g key={i} onMouseEnter={() => setHoverDay(i)}>
              <rect x={PAD.left + (i / (daily.length - 1 || 1)) * chartW - chartW / daily.length / 2}
                y={PAD.top} width={chartW / daily.length} height={chartH}
                fill="transparent" style={{ cursor: "crosshair" }} />
              {segments}
            </g>
          );
        })}

        {/* Optional line overlay (e.g. daily signups). Drawn after bars so
            it sits on top, with its own scale on the right axis. */}
        {lineOverlay && linePoints && (
          <>
            <polyline
              points={linePoints}
              fill="none"
              stroke={lineOverlay.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {daily.map((d, i) => {
              const v = Number(lineByDate[d.date] || 0);
              const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
              const y = PAD.top + chartH - (v / maxLine) * chartH;
              return (
                <circle
                  key={`lp-${d.date}`}
                  cx={x}
                  cy={y}
                  r={1.6}
                  fill={lineOverlay.color}
                  opacity={0.85}
                />
              );
            })}
          </>
        )}

        {/* Hover line */}
        {hoverDay !== null && (
          <line
            x1={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
            y1={PAD.top}
            x2={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
            y2={PAD.top + chartH}
            stroke="rgba(10,10,10,0.12)" strokeWidth="1"
          />
        )}

        {/* X-axis labels */}
        {xLabels.map(i => {
          const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
          const label = new Date(daily[i].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          return <text key={i} x={x} y={H - 4} textAnchor="middle" fill="rgba(10,10,10,0.35)" fontSize="10">{label}</text>;
        })}
      </svg>

      {/* Tooltip */}
      {hoverDay !== null && daily[hoverDay] && (
        <div style={{
          position: "absolute",
          left: `${((PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW) / W) * 100}%`,
          top: 12,
          transform: `translateX(${hoverDay > daily.length * 0.65 ? "calc(-100% - 10px)" : "10px"})`,
          background: "#fff", border: `1px solid ${colors.border}`,
          borderRadius: 8, padding: "8px 12px", fontSize: "12px", color: colors.text,
          lineHeight: 1.6, boxShadow: "0 4px 16px rgba(10,10,10,0.10)", pointerEvents: "none", zIndex: 10, whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {new Date(daily[hoverDay].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </div>
          <div style={{ color: colors.textMuted }}>{daily[hoverDay].views} unique visitors</div>
          {lineOverlay && (
            <div
              style={{
                color: lineOverlay.color,
                marginTop: 1,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 2,
                  background: lineOverlay.color,
                  flexShrink: 0,
                }}
              />
              <span>
                {lineOverlay.label}:{" "}
                {Number(lineByDate[daily[hoverDay].date] || 0)}
              </span>
            </div>
          )}
          {Object.entries(daily[hoverDay].bySource || {}).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
              <div style={{ width: 5, height: 5, borderRadius: 1, background: getLandingSourceColor(src), flexShrink: 0 }} />
              <span style={{ color: colors.textSubtle }}>{src}: {count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {(allSources.length > 0 || lineOverlay) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, paddingLeft: PAD.left }}>
          {allSources.map(src => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "10px", color: colors.textSubtle }}>
              <div style={{ width: 7, height: 7, borderRadius: 1.5, background: getLandingSourceColor(src) }} />
              {src}
            </div>
          ))}
          {lineOverlay && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "10px", color: colors.textMuted }}>
              <div style={{ width: 14, height: 2, background: lineOverlay.color }} />
              {lineOverlay.label}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * TimeSeriesChart — bars + line, two-axis SVG chart.
 *
 * Lightweight by design: no external chart library, no canvas, just SVG
 * primitives so it stays consistent with the rest of the page's styling
 * and renders crisply at any size.
 *
 * Props:
 *   buckets: [{ date: "YYYY-MM-DD", ...metricKeys }]
 *   bars: { key, label, color }     – left axis, daily bar values
 *   line: { key, label, color }     – right axis, can be cumulative
 */
// Build dedupe-aware integer ticks for a Y-axis. Without this, tiny maxes
// like 2 produce duplicates ("0, 1, 1, 2, 2") because each fractional
// step rounds to the same integer. We compute the unique sorted set of
// integer values across the fractions [0, 0.25, 0.5, 0.75, 1] so the
// axis always reads cleanly regardless of scale.
function buildTicks(max) {
  const fractions = [0, 0.25, 0.5, 0.75, 1];
  const seen = new Set();
  const ticks = [];
  for (const f of fractions) {
    const v = Math.round(max * f);
    if (seen.has(v)) continue;
    seen.add(v);
    ticks.push({ value: v, fraction: max > 0 ? v / max : 0 });
  }
  return ticks.sort((a, b) => a.value - b.value);
}

function TimeSeriesChart({ buckets, bars, line, height = 180 }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!buckets || buckets.length === 0) return null;

  const W = 720;
  const H = height;
  const padL = 30;
  const padR = 36;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const barValues = buckets.map((b) => Number(b[bars.key] || 0));
  const lineValues = buckets.map((b) => Number(b[line.key] || 0));
  const maxBar = Math.max(1, ...barValues);
  const maxLine = Math.max(1, ...lineValues);

  const barSlot = innerW / buckets.length;
  const barWidth = Math.max(2, Math.min(barSlot - 2, 18));

  const linePoints = buckets
    .map((b, i) => {
      const x = padL + i * barSlot + barSlot / 2;
      const y = padT + innerH - (Number(b[line.key] || 0) / maxLine) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Sparse x-axis date labels: ~5 across the period
  const labelCount = Math.min(5, buckets.length);
  const labelEvery = Math.max(1, Math.ceil(buckets.length / labelCount));

  const barTicks = buildTicks(maxBar);
  const lineTicks = buildTicks(maxLine);

  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  const hover = hoverIndex !== null ? buckets[hoverIndex] : null;
  const hoverX =
    hoverIndex !== null ? padL + hoverIndex * barSlot + barSlot / 2 : 0;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ width: "100%", height, display: "block" }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {/* Grid + bar axis labels (left) */}
        {barTicks.map((t) => {
          const y = padT + innerH - t.fraction * innerH;
          return (
            <g key={`bt-${t.value}`}>
              <line
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="rgba(10,10,10,0.07)"
                strokeWidth={1}
              />
              <text
                x={padL - 4}
                y={y + 3}
                textAnchor="end"
                fill="rgba(10,10,10,0.35)"
                fontSize={9}
              >
                {t.value.toLocaleString()}
              </text>
            </g>
          );
        })}
        {/* Line axis labels (right) — separate set so scales don't conflict */}
        {lineTicks.map((t) => {
          const y = padT + innerH - t.fraction * innerH;
          return (
            <text
              key={`lt-${t.value}`}
              x={W - padR + 4}
              y={y + 3}
              textAnchor="start"
              fill={line.color}
              opacity={0.55}
              fontSize={9}
            >
              {t.value.toLocaleString()}
            </text>
          );
        })}

        {/* Bars */}
        {buckets.map((b, i) => {
          const v = Number(b[bars.key] || 0);
          const h = (v / maxBar) * innerH;
          const x = padL + i * barSlot + (barSlot - barWidth) / 2;
          const y = padT + innerH - h;
          return (
            <rect
              key={b.date}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              rx={2}
              fill={bars.color}
            />
          );
        })}

        {/* Line */}
        <polyline
          points={linePoints}
          fill="none"
          stroke={line.color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {buckets.map((b, i) => {
          const x = padL + i * barSlot + barSlot / 2;
          const y =
            padT + innerH - (Number(b[line.key] || 0) / maxLine) * innerH;
          return (
            <circle
              key={`p-${b.date}`}
              cx={x}
              cy={y}
              r={1.6}
              fill={line.color}
              opacity={0.85}
            />
          );
        })}

        {/* Hover guide line */}
        {hoverIndex !== null && (
          <line
            x1={hoverX}
            x2={hoverX}
            y1={padT}
            y2={padT + innerH}
            stroke="rgba(10,10,10,0.12)"
            strokeWidth={1}
          />
        )}

        {/* Per-day hit-rect for hover */}
        {buckets.map((b, i) => (
          <rect
            key={`hit-${b.date}`}
            x={padL + i * barSlot}
            y={padT}
            width={barSlot}
            height={innerH}
            fill="transparent"
            style={{ cursor: "crosshair" }}
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}

        {/* X-axis date labels */}
        {buckets.map((b, i) => {
          if (i % labelEvery !== 0 && i !== buckets.length - 1) return null;
          const x = padL + i * barSlot + barSlot / 2;
          return (
            <text
              key={`l-${b.date}`}
              x={x}
              y={H - 8}
              textAnchor="middle"
              fill="rgba(10,10,10,0.35)"
              fontSize={9}
            >
              {fmtDate(b.date)}
            </text>
          );
        })}
      </svg>

      {/* Hover tooltip — rendered as a positioned div so it floats clear of
          the SVG and reads at the same size regardless of viewBox scaling. */}
      {hover && (
        <div
          style={{
            position: "absolute",
            left: `${(hoverX / W) * 100}%`,
            top: 8,
            transform: `translateX(${hoverIndex > buckets.length * 0.65 ? "calc(-100% - 10px)" : "10px"})`,
            background: "#fff",
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: 12,
            color: colors.text,
            lineHeight: 1.6,
            boxShadow: "0 4px 16px rgba(10,10,10,0.10)",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {fmtDate(hover.date)}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: colors.textMuted,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: bars.color,
                display: "inline-block",
              }}
            />
            {bars.label}: {Number(hover[bars.key] || 0).toLocaleString()}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              color: colors.textMuted,
            }}
          >
            <span
              style={{
                width: 12,
                height: 2,
                background: line.color,
                display: "inline-block",
              }}
            />
            {line.label}: {Number(hover[line.key] || 0).toLocaleString()}
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        style={{
          display: "flex",
          gap: 16,
          fontSize: 11,
          color: colors.textMuted,
          marginTop: 6,
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: bars.color,
              display: "inline-block",
            }}
          />
          {bars.label}
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 14,
              height: 2,
              background: line.color,
              display: "inline-block",
            }}
          />
          {line.label}
        </span>
      </div>
    </div>
  );
}
