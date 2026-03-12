import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { TrendingUp, TrendingDown, Minus, Download, ChevronDown, Eye, EyeOff, Smartphone, Monitor, HelpCircle } from "lucide-react";
import { generateReport } from "../lib/reportGenerator.js";
import { DateRangePicker } from "../components/DateRangePicker.jsx";

// Consistent color palette for stacked bars
const EVENT_COLORS = [
  "rgba(59,130,246,0.75)",   // blue
  "rgba(139,92,246,0.75)",   // purple
  "rgba(236,72,153,0.75)",   // pink
  "rgba(34,197,94,0.75)",    // green
  "rgba(251,146,60,0.75)",   // orange
  "rgba(14,165,233,0.75)",   // sky
  "rgba(168,85,247,0.75)",   // violet
  "rgba(245,158,11,0.75)",   // amber
];

function formatRevenue(cents, currency = 'sek') {
  if (!cents && cents !== 0) return 'N/A';
  const amount = cents / 100;
  const sym = currency === 'sek' ? ' kr' : currency === 'eur' ? '€' : currency === 'gbp' ? '£' : '$';
  const prefix = ['eur','gbp','usd'].includes(currency);
  return prefix ? `${sym}${amount.toLocaleString()}` : `${amount.toLocaleString()}${sym}`;
}

function formatRevenueByCurrency(byCurrency) {
  if (!byCurrency || typeof byCurrency !== 'object') return 'N/A';
  const entries = Object.entries(byCurrency).filter(([, v]) => v > 0);
  if (entries.length === 0) return 'N/A';
  return entries.map(([cur, cents]) => formatRevenue(cents, cur)).join(' + ');
}

export function HostAnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPrevious, setShowPrevious] = useState(true);
  const [profile, setProfile] = useState(null);
  const [expandedEvent, setExpandedEvent] = useState(null);
  const [hiddenEvents, setHiddenEvents] = useState(new Set());

  // Date range — defaults to last 30 days
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [dateEnd, setDateEnd] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  });

  // Backward-looking quick ranges for analytics
  const analyticsQuickRanges = [
    { label: "Last 7 days", getRange: () => {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const start = new Date(); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
      return [start, end];
    }},
    { label: "Last 14 days", getRange: () => {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const start = new Date(); start.setDate(start.getDate() - 13); start.setHours(0, 0, 0, 0);
      return [start, end];
    }},
    { label: "Last 30 days", getRange: () => {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const start = new Date(); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
      return [start, end];
    }},
    { label: "Last 90 days", getRange: () => {
      const end = new Date(); end.setHours(23, 59, 59, 999);
      const start = new Date(); start.setDate(start.getDate() - 89); start.setHours(0, 0, 0, 0);
      return [start, end];
    }},
    { label: "This month", getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(); end.setHours(23, 59, 59, 999);
      return [start, end];
    }},
    { label: "Last month", getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0); end.setHours(23, 59, 59, 999);
      return [start, end];
    }},
  ];

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  // Fetch profile for brand name
  useEffect(() => {
    if (!user) return;
    authenticatedFetch("/host/profile")
      .then(res => res.ok ? res.json() : null)
      .then(p => { if (p) setProfile(p); })
      .catch(() => {});
  }, [user]);

  // Compute days from date range for display/report
  const days = dateStart && dateEnd
    ? Math.round((dateEnd - dateStart) / (1000 * 60 * 60 * 24)) + 1
    : 30;

  function toggleEvent(id) {
    setHiddenEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Compute filtered data based on hidden events
  const isFiltered = hiddenEvents.size > 0;
  const visibleEvents = data ? data.events.filter(e => !hiddenEvents.has(e.id)) : [];
  const filteredViews = visibleEvents.reduce((s, e) => s + e.views, 0);
  const filteredUnique = visibleEvents.reduce((s, e) => s + e.unique_visitors, 0);
  const filteredRsvps = visibleEvents.reduce((s, e) => s + e.rsvps, 0);
  const filteredConversion = filteredViews > 0 ? Math.round((filteredRsvps / filteredViews) * 1000) / 10 : 0;
  const filteredPulledUp = visibleEvents.reduce((s, e) => s + (e.pulled_up || 0), 0);
  const filteredRevenue = visibleEvents.reduce((s, e) => s + (e.revenue || 0), 0);
  const filteredRevenueByCurrency = (() => {
    const byCur = {};
    for (const e of visibleEvents) {
      if (e.is_paid && e.revenue > 0) {
        const cur = e.ticket_currency || 'sek';
        byCur[cur] = (byCur[cur] || 0) + e.revenue;
      }
    }
    return byCur;
  })();
  const filteredHasPaid = visibleEvents.some(e => e.is_paid);
  const filteredShowRate = filteredRsvps > 0 ? Math.round((filteredPulledUp / filteredRsvps) * 1000) / 10 : 0;
  const filteredHasDinner = visibleEvents.some(e => e.dinner_enabled);
  const filteredDinner = filteredHasDinner ? visibleEvents.reduce((s, e) => s + (e.dinner_enabled ? (e.dinner || 0) : 0), 0) : null;
  const filteredCapacity = visibleEvents.reduce((s, e) => s + (e.capacity || 0), 0);
  const filteredDinnerCapacity = filteredHasDinner ? visibleEvents.reduce((s, e) => s + (e.dinner_enabled ? (e.dinner_capacity || 0) : 0), 0) : 0;

  // Build filtered report data (only visible events + filtered chart + device split + period)
  const filteredData = data ? (() => {
    const visibleIds = new Set(visibleEvents.map(e => e.id));

    // Recompute device split from per-event device data
    const filteredDeviceSplit = { mobile: 0, desktop: 0, unknown: 0 };
    for (const ev of visibleEvents) {
      if (ev.device_split) {
        filteredDeviceSplit.mobile += ev.device_split.mobile || 0;
        filteredDeviceSplit.desktop += ev.device_split.desktop || 0;
        filteredDeviceSplit.unknown += ev.device_split.unknown || 0;
      }
    }

    // Recompute chart stacked data
    const filteredChart = data.chart ? {
      ...data.chart,
      eventLabels: (data.chart.eventLabels || []).filter(e => visibleIds.has(e.id)),
      stacked: (data.chart.stacked || []).map(day => {
        const filtered = { date: day.date };
        for (const key of Object.keys(day)) {
          if (key === "date") continue;
          if (key === "_other") { if (!isFiltered) filtered._other = day._other; continue; }
          if (visibleIds.has(key)) filtered[key] = day[key];
        }
        return filtered;
      }),
      // Recompute current period views from stacked for period stats
      current: data.chart.stacked ? data.chart.stacked.map(day => {
        let total = 0;
        for (const key of Object.keys(day)) {
          if (key === "date" || key === "_other") continue;
          if (visibleIds.has(key)) total += day[key] || 0;
        }
        if (!isFiltered) total += day._other || 0;
        return { date: day.date, views: total };
      }) : data.chart.current,
    } : data.chart;

    // Recompute period comparison from filtered daily data
    let filteredPeriod = data.period;
    if (data.period && isFiltered) {
      const currentViews = filteredViews;
      const currentUnique = filteredUnique;
      // Previous period isn't per-event, so we can't perfectly filter it.
      // Keep previous period as-is (it represents the full comparison baseline)
      filteredPeriod = {
        ...data.period,
        currentViews,
        currentUnique,
      };
    }

    return {
      ...data,
      events: visibleEvents,
      total_views: filteredViews,
      total_unique_visitors: filteredUnique,
      total_rsvps: filteredRsvps,
      total_pulled_up: filteredPulledUp,
      total_revenue: filteredRevenue,
      revenue_by_currency: filteredRevenueByCurrency,
      has_paid_events: filteredHasPaid,
      avg_show_rate: filteredShowRate,
      avg_conversion: filteredConversion,
      total_dinner: filteredDinner,
      total_dinner_capacity: filteredDinnerCapacity,
      has_dinner_events: filteredHasDinner,
      total_capacity: filteredCapacity,
      device_split: isFiltered ? filteredDeviceSplit : data.device_split,
      period: filteredPeriod,
      chart: filteredChart,
    };
  })() : null;

  const fetchData = useCallback(async () => {
    if (!user || !dateStart || !dateEnd) return;
    setLoading(true);
    try {
      const startStr = dateStart.toISOString().slice(0, 10);
      const endStr = dateEnd.toISOString().slice(0, 10);
      const res = await authenticatedFetch(`/host/analytics?startDate=${startStr}&endDate=${endStr}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Failed to load analytics:", err);
    }
    setLoading(false);
  }, [user, dateStart, dateEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (authLoading || (loading && !data)) {
    return (
      <div className="page-with-header" style={{ minHeight: "100vh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "13px", color: colors.textFaded }}>Loading...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-with-header" style={{ minHeight: "100vh", background: colors.background, padding: "60px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "14px", color: colors.textSubtle }}>Could not load analytics.</div>
      </div>
    );
  }

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        background: colors.background,
        paddingLeft: "clamp(12px, 3vw, 24px)",
        paddingRight: "clamp(12px, 3vw, 24px)",
        paddingBottom: "60px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "clamp(16px, 3vw, 24px)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, color: colors.text }}>
              Analytics
            </h1>
            <DateRangePicker
              startDate={dateStart}
              endDate={dateEnd}
              allowPast
              blockFuture
              quickRanges={analyticsQuickRanges}
              onChange={(s, e) => { setDateStart(s); setDateEnd(e); }}
              onClear={() => {
                const end = new Date(); end.setHours(23, 59, 59, 999);
                const start = new Date(); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
                setDateStart(start);
                setDateEnd(end);
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 4 }}>
            <p style={{ margin: 0, fontSize: "13px", color: colors.textSubtle }}>
              Performance across all your events.
            </p>
            {data && (
              <button
                onClick={() => filteredData && filteredData.total_views > 0 && generateReport({
                  data: filteredData,
                  days,
                  startDate: dateStart,
                  endDate: dateEnd,
                  brandName: profile?.brand || profile?.name || user?.user_metadata?.name || "My Events",
                })}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "#fff", fontSize: "12px", fontWeight: 500,
                  cursor: filteredData?.total_views > 0 ? "pointer" : "not-allowed",
                  opacity: filteredData?.total_views > 0 ? 1 : 0.4,
                  transition: "all 0.2s ease",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { if (filteredData?.total_views > 0) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
              >
                <Download size={13} />
                Export Report
              </button>
            )}
          </div>
        </div>

            {/* Conversion funnel */}
            <FunnelChart
              views={filteredData.total_views}
              rsvps={filteredData.total_rsvps}
              dinner={filteredData.has_dinner_events ? filteredData.total_dinner : null}
              dinnerCapacity={filteredData.has_dinner_events ? filteredData.total_dinner_capacity : null}
              pulledUp={filteredData.total_pulled_up}
              revenue={filteredData.has_paid_events ? filteredData.total_revenue : null}
              revenueByCurrency={filteredData.has_paid_events ? filteredData.revenue_by_currency : null}
              uniqueVisitors={filteredData.total_unique_visitors}
              capacity={filteredData.total_capacity}
            />

            {/* Device split donut */}
            {filteredData.device_split && ((filteredData.device_split.mobile || 0) + (filteredData.device_split.desktop || 0) + (filteredData.device_split.unknown || 0)) > 0 && (
              <DeviceSplitDonut split={filteredData.device_split} />
            )}

            {/* Campaigns */}
            <div style={{ marginBottom: 24 }}>
              <SectionLabel>Campaigns</SectionLabel>
              {(data.campaigns || []).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(data.campaigns || []).map(c => (
                    <CampaignCard key={c.tag} campaign={c} />
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.25)", margin: 0 }}>No campaigns sent in this period</p>
              )}
            </div>

            {/* Views chart */}
            {filteredData.chart && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ marginBottom: 12 }}>
                  <SectionLabel>Views</SectionLabel>
                </div>

                {/* Stats row with period comparison */}
                {filteredData.period && (
                  <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>
                        {filteredData.period.currentViews.toLocaleString()}
                      </span>
                      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>views</span>
                      {!isFiltered && <ChangeIndicator value={filteredData.period.viewsChange} />}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: "24px", fontWeight: 700, color: "rgba(59,130,246,0.9)" }}>
                        {filteredData.period.currentUnique.toLocaleString()}
                      </span>
                      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>unique</span>
                      {!isFiltered && <ChangeIndicator value={filteredData.period.uniqueChange} />}
                    </div>
                    <button
                      onClick={() => setShowPrevious(!showPrevious)}
                      style={{
                        marginLeft: "auto",
                        padding: "3px 10px",
                        borderRadius: "999px",
                        border: showPrevious ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
                        background: showPrevious ? "rgba(255,255,255,0.06)" : "transparent",
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "11px",
                        cursor: "pointer",
                      }}
                    >
                      {showPrevious ? "Hide" : "Show"} prev. period
                    </button>
                  </div>
                )}

                {/* Stacked bar chart */}
                <StackedBarChart
                  stacked={filteredData.chart.stacked}
                  eventLabels={data.chart.eventLabels}
                  previous={showPrevious && !isFiltered ? data.chart.previous : null}
                  hiddenEvents={hiddenEvents}
                />

                {/* Legend — click to toggle events */}
                {data.chart.eventLabels && data.chart.eventLabels.length > 1 && (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
                    {data.chart.eventLabels.map((ev, i) => {
                      const isHidden = hiddenEvents.has(ev.id);
                      return (
                        <div
                          key={ev.id}
                          onClick={() => toggleEvent(ev.id)}
                          style={{
                            display: "flex", alignItems: "center", gap: 5,
                            cursor: "pointer",
                            opacity: isHidden ? 0.35 : 1,
                            transition: "opacity 0.2s ease",
                          }}
                        >
                          {isHidden
                            ? <EyeOff size={10} style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
                            : <div style={{
                                width: 8, height: 8, borderRadius: 2,
                                background: EVENT_COLORS[i % EVENT_COLORS.length],
                                flexShrink: 0,
                                transition: "background 0.2s ease",
                              }} />
                          }
                          <span style={{
                            fontSize: "11px",
                            color: isHidden ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.5)",
                            maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            textDecoration: isHidden ? "line-through" : "none",
                            transition: "color 0.2s ease",
                          }}>
                            {ev.title}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Events ranked by views */}
            <SectionLabel>Your Events</SectionLabel>
            <div style={{
              borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              overflow: "hidden",
              marginBottom: 24,
            }}>
              {data.events.filter((e) => e.views > 0).map((ev, i, arr) => {
                const isExpanded = expandedEvent === ev.id;
                const isHidden = hiddenEvents.has(ev.id);
                const maxViews = arr[0]?.views || 1;
                return (
                  <div key={ev.id}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 14px",
                        borderBottom: (i < arr.length - 1 && !isExpanded) ? "1px solid rgba(255,255,255,0.04)" : "none",
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        background: isExpanded ? "rgba(255,255,255,0.03)" : "transparent",
                        opacity: isHidden ? 0.35 : 1,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isExpanded ? "rgba(255,255,255,0.03)" : "transparent"; }}
                    >
                      {/* Eye toggle */}
                      <span
                        onClick={(e) => { e.stopPropagation(); toggleEvent(ev.id); }}
                        title={isHidden ? "Show in chart & report" : "Hide from chart & report"}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "center",
                          flexShrink: 0, cursor: "pointer",
                          color: isHidden ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.35)",
                          transition: "color 0.2s ease",
                        }}
                      >
                        {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      </span>

                      {/* Rank */}
                      <span style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: isHidden ? "rgba(255,255,255,0.04)" : (i === 0 ? "rgba(59,130,246,0.3)" : i === 1 ? "rgba(192,192,192,0.2)" : "rgba(255,255,255,0.06)"),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "11px", fontWeight: 700, color: isHidden ? "rgba(255,255,255,0.3)" : "#fff",
                        flexShrink: 0,
                        transition: "all 0.2s ease",
                      }}>
                        {i + 1}
                      </span>

                      {/* Event info — click to expand */}
                      <div
                        onClick={() => !isHidden && setExpandedEvent(isExpanded ? null : ev.id)}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <div style={{
                          fontSize: "13px", fontWeight: 500, color: "#fff",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          textDecoration: isHidden ? "line-through" : "none",
                        }}>
                          {ev.title}
                        </div>
                        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
                          {formatEventTime(ev.starts_at, ev.ends_at)}
                        </div>
                        <div style={{ fontSize: "11px", color: colors.textFaded }}>
                          {ev.unique_visitors} visitors · {ev.rsvps} RSVPs · {ev.pulled_up || 0} pulled up
                        </div>
                      </div>

                      {/* Views bar + count */}
                      <div
                        onClick={() => !isHidden && setExpandedEvent(isExpanded ? null : ev.id)}
                        style={{ display: "flex", alignItems: "center", gap: 12 }}
                      >
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
                          <div style={{
                            height: "100%", borderRadius: 2,
                            background: isHidden ? "rgba(255,255,255,0.15)" : "rgba(59,130,246,0.6)",
                            width: `${Math.round((ev.views / maxViews) * 100)}%`,
                            transition: "background 0.2s ease",
                          }} />
                        </div>
                        <div style={{
                          fontSize: "13px", fontWeight: 600,
                          color: isHidden ? "rgba(255,255,255,0.3)" : "rgba(59,130,246,0.8)",
                          minWidth: 32, textAlign: "right",
                          transition: "color 0.2s ease",
                        }}>
                          {ev.views}
                        </div>
                        <ChevronDown size={14} style={{
                          color: "rgba(255,255,255,0.3)",
                          transition: "transform 0.2s ease",
                          transform: isExpanded && !isHidden ? "rotate(180deg)" : "rotate(0deg)",
                          flexShrink: 0,
                        }} />
                      </div>
                    </div>

                    {/* Expanded detail panel — only when visible */}
                    {isExpanded && !isHidden && <EventDetailPanel event={ev} />}

                    {/* Bottom border after expanded panel */}
                    {((isExpanded && !isHidden) || i < arr.length - 1) && (
                      <div style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }} />
                    )}
                  </div>
                );
              })}

              {data.events.filter((e) => e.views > 0).length === 0 && (
                <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: colors.textFaded }}>
                  No event views in this period.
                </div>
              )}
            </div>
      </div>
    </div>
  );
}

const SOURCE_COLORS = {
  direct: "rgba(255,255,255,0.35)",
  instagram: "rgba(225,48,108,0.75)",
  facebook: "rgba(66,103,178,0.75)",
  twitter: "rgba(29,155,240,0.75)",
  linkedin: "rgba(10,102,194,0.75)",
  pullup: "rgba(192,192,192,0.6)",
  pullup_newsletter: "rgba(251,191,36,0.7)",
  other: "rgba(168,85,247,0.5)",
};

function getSourceColor(name) {
  return SOURCE_COLORS[name] || `rgba(${60 + ((name.charCodeAt(0) * 37) % 180)},${80 + ((name.charCodeAt(1 % name.length) * 53) % 150)},${120 + ((name.charCodeAt(2 % name.length) * 71) % 130)},0.6)`;
}

function FunnelChart({ views, rsvps, dinner, dinnerCapacity, pulledUp, revenue, currency, revenueByCurrency, capacity, uniqueVisitors, mini }) {
  const steps = [
    { label: "Views", value: views, rate: null, color: "rgba(59,130,246,0.7)" },
    { label: "RSVPs", value: rsvps, cap: capacity > 0 ? capacity : null, rate: views > 0 ? Math.round((rsvps / views) * 1000) / 10 : 0, rateLabel: "of views", color: "rgba(139,92,246,0.7)" },
  ];
  if (dinner !== null && dinner !== undefined) {
    steps.push({ label: "Dinner", value: dinner, cap: dinnerCapacity > 0 ? dinnerCapacity : null, rate: rsvps > 0 ? Math.round((dinner / rsvps) * 1000) / 10 : 0, rateLabel: "of RSVPs", color: "rgba(251,146,60,0.7)" });
  }
  steps.push(
    { label: "Pulled Up", value: pulledUp, rate: rsvps > 0 ? Math.round((pulledUp / rsvps) * 1000) / 10 : 0, rateLabel: "of RSVPs", color: "rgba(74,222,128,0.7)" },
  );
  if (revenue !== null && revenue !== undefined) {
    const revenueDisplay = revenueByCurrency && Object.keys(revenueByCurrency).length > 0
      ? formatRevenueByCurrency(revenueByCurrency)
      : formatRevenue(revenue, currency);
    steps.push({ label: "Revenue", value: revenueDisplay, rawValue: revenue, rate: null, color: "rgba(251,191,36,0.7)" });
  }
  const maxVal = Math.max(views, 1);

  return (
    <div style={{
      padding: mini ? "10px 12px" : "14px 16px", borderRadius: mini ? 10 : 14,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      marginBottom: mini ? 12 : 20,
    }}>
      {steps.map((step, i) => {
        const barPct = step.label === "Revenue"
          ? (steps[2]?.value || 0) / maxVal * 100
          : (step.value / maxVal) * 100;
        return (
          <div key={step.label} style={{ marginBottom: i < steps.length - 1 ? (mini ? 8 : 12) : 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: mini ? 2 : 3 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{
                  fontSize: mini ? "16px" : "20px", fontWeight: 700,
                  color: step.color,
                }}>
                  {step.label === "Revenue" ? step.value : (step.value ?? 0).toLocaleString()}
                  {step.cap && (
                    <span style={{ fontSize: mini ? "11px" : "13px", fontWeight: 500, color: "rgba(255,255,255,0.25)" }}>
                      {" / "}{step.cap.toLocaleString()}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: mini ? "10px" : "11px", color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
                  {step.label}
                </span>
              </div>
              {step.rate !== null && step.rate !== undefined && (
                <span style={{
                  fontSize: mini ? "10px" : "11px", fontWeight: 600,
                  color: step.rate > (step.label === "Pulled Up" ? 50 : 20) ? "rgba(74,222,128,0.7)" : "rgba(255,255,255,0.35)",
                }}>
                  {step.rate}% <span style={{ fontWeight: 400, color: "rgba(255,255,255,0.25)" }}>{step.rateLabel}</span>
                </span>
              )}
            </div>
            <div style={{
              height: mini ? 4 : 6, borderRadius: 3,
              background: "rgba(255,255,255,0.04)",
            }}>
              <div style={{
                height: "100%", borderRadius: 3,
                background: step.color,
                width: `${Math.max(barPct, step.value > 0 || step.rawValue > 0 ? 2 : 0)}%`,
                transition: "width 0.3s ease",
              }} />
            </div>
          </div>
        );
      })}
      {!mini && (uniqueVisitors > 0 || capacity > 0) && (
        <div style={{
          display: "flex", gap: 16, marginTop: 12,
          paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.04)",
        }}>
          {uniqueVisitors > 0 && (
            <div>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{uniqueVisitors.toLocaleString()}</span>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>unique visitors</span>
            </div>
          )}
          {capacity > 0 && (
            <div>
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff" }}>{Math.min(100, Math.round((rsvps / capacity) * 100))}%</span>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", marginLeft: 4 }}>of {capacity} capacity</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Per-event expanded detail panel ── */
function EventDetailPanel({ event: ev }) {
  const [hoverDay, setHoverDay] = useState(null);
  const sources = ev.sources || [];
  const daily = ev.daily || [];

  // Collect all source names from daily data, sorted by total
  const allSources = [...new Set(sources.map(s => s.source))];
  const maxDailyViews = Math.max(...daily.map(d => d.views), 1);
  const maxDailyRsvps = Math.max(...daily.map(d => d.rsvps), 1);
  const maxDailyVipRsvps = Math.max(...daily.map(d => d.vipRsvps || 0), 0);
  const hasVipRsvps = maxDailyVipRsvps > 0;

  // Show ~8 x-axis labels max
  const step = Math.max(1, Math.floor(daily.length / 7));
  const xLabels = daily.map((_, i) => i).filter(i => i % step === 0 || i === daily.length - 1);

  const W = 400, H = 90;
  const PAD = { top: 6, right: 6, bottom: 16, left: 28 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const niceMax = Math.ceil(maxDailyViews / (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1)) * (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1) || 1;
  const rsvpScale = maxDailyRsvps > 0 ? chartH / maxDailyRsvps : 0;
  const barWidth = Math.max(2, (chartW / daily.length) * 0.7);

  // Build RSVP line path
  const rsvpPoints = daily.map((d, i) => {
    const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
    const y = PAD.top + chartH - (d.rsvps * rsvpScale);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");

  return (
    <div style={{
      padding: "12px 14px 16px",
      background: "rgba(255,255,255,0.015)",
    }}>
      {/* Conversion funnel */}
      <FunnelChart
        views={ev.views}
        rsvps={ev.rsvps}
        dinner={ev.dinner_enabled ? (ev.dinner || 0) : null}
        dinnerCapacity={ev.dinner_enabled ? (ev.dinner_capacity || 0) : null}
        pulledUp={ev.pulled_up || 0}
        revenue={ev.is_paid ? ev.revenue : null}
        currency={ev.ticket_currency}
        capacity={ev.capacity}
        mini
      />

      {/* Stacked source bars + RSVP line chart */}
      {daily.length > 0 && (
        <div style={{ marginBottom: 14, position: "relative" }}>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>
            Daily views by source & RSVPs
          </div>
          <div style={{
            borderRadius: 10,
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
            padding: "8px 6px 4px",
            position: "relative",
          }}>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              style={{ width: "100%", height: "auto", display: "block" }}
              onMouseLeave={() => setHoverDay(null)}
            >
              {/* Grid lines + Y labels */}
              {[0, 0.5, 1].map(f => {
                const y = PAD.top + chartH - f * chartH;
                const val = Math.round(f * niceMax);
                return (
                  <g key={f}>
                    <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                      stroke="rgba(255,255,255,0.04)" strokeDasharray="3,3" />
                    <text x={PAD.left - 4} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.2)" fontSize="7.5">{val}</text>
                  </g>
                );
              })}

              {/* Stacked bars by source */}
              {daily.map((d, i) => {
                const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW - barWidth / 2;
                let yOffset = 0;
                const bySource = d.bySource || {};
                const segments = [];

                // Stack sources bottom-up in order of allSources
                for (let si = allSources.length - 1; si >= 0; si--) {
                  const src = allSources[si];
                  const val = bySource[src] || 0;
                  if (val === 0) continue;
                  const segH = (val / niceMax) * chartH;
                  const y = PAD.top + chartH - yOffset - segH;
                  segments.push(
                    <rect key={`${i}-${src}`} x={x} y={y} width={barWidth} height={segH}
                      rx={yOffset === 0 ? 1.5 : 0} fill={getSourceColor(src)} />
                  );
                  yOffset += segH;
                }

                return (
                  <g key={i} onMouseEnter={() => setHoverDay(i)}>
                    <rect
                      x={PAD.left + (i / (daily.length - 1 || 1)) * chartW - chartW / daily.length / 2}
                      y={PAD.top} width={chartW / daily.length} height={chartH}
                      fill="transparent" style={{ cursor: "crosshair" }}
                    />
                    {segments}
                  </g>
                );
              })}

              {/* RSVP line overlay */}
              {maxDailyRsvps > 0 && (
                <path d={rsvpPoints} fill="none" stroke="rgba(74,222,128,0.7)" strokeWidth="1.5"
                  strokeLinejoin="round" strokeLinecap="round" />
              )}

              {/* RSVP dots */}
              {daily.map((d, i) => {
                if (d.rsvps === 0) return null;
                const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
                const y = PAD.top + chartH - (d.rsvps * rsvpScale);
                return <circle key={`rd-${i}`} cx={x} cy={y} r={2.5} fill="rgba(74,222,128,0.9)" />;
              })}

              {/* VIP RSVP golden dots — independent, y = count on views axis */}
              {daily.map((d, i) => {
                if (!d.vipRsvps || d.vipRsvps === 0) return null;
                const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
                const y = PAD.top + chartH - (d.vipRsvps / niceMax) * chartH;
                return (
                  <g key={`vip-${i}`}>
                    <circle cx={x} cy={y} r={5} fill="rgba(251,191,36,0.15)" />
                    <circle cx={x} cy={y} r={3} fill="rgba(251,191,36,0.9)" stroke="rgba(251,191,36,0.4)" strokeWidth="1" />
                  </g>
                );
              })}

              {/* Hover highlight */}
              {hoverDay !== null && (
                <line
                  x1={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
                  y1={PAD.top}
                  x2={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
                  y2={PAD.top + chartH}
                  stroke="rgba(255,255,255,0.15)" strokeWidth="1"
                />
              )}

              {/* X labels */}
              {xLabels.map(i => {
                const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
                const label = new Date(daily[i].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                return <text key={i} x={x} y={H - 2} textAnchor="middle" fill="rgba(255,255,255,0.2)" fontSize="7">{label}</text>;
              })}
            </svg>

            {/* Tooltip */}
            {hoverDay !== null && daily[hoverDay] && (
              <div style={{
                position: "absolute",
                left: `${((PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW) / W) * 100}%`,
                top: 8,
                transform: `translateX(${hoverDay > daily.length * 0.65 ? "calc(-100% - 8px)" : "8px"})`,
                background: "rgba(15,12,25,0.95)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: "11px",
                color: "#fff",
                lineHeight: 1.5,
                backdropFilter: "blur(12px)",
                pointerEvents: "none",
                zIndex: 10,
                whiteSpace: "nowrap",
              }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  {new Date(daily[hoverDay].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)" }}>{daily[hoverDay].views} views</div>
                {Object.entries(daily[hoverDay].bySource || {}).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
                  <div key={src} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                    <div style={{ width: 5, height: 5, borderRadius: 1, background: getSourceColor(src), flexShrink: 0 }} />
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>{src}: {count}</span>
                  </div>
                ))}
                {daily[hoverDay].rsvps > 0 && (
                  <div style={{ color: "rgba(74,222,128,0.7)", marginTop: 2 }}>
                    {daily[hoverDay].rsvps} RSVPs
                  </div>
                )}
                {(daily[hoverDay].vipRsvps || 0) > 0 && (
                  <div style={{ color: "rgba(251,191,36,0.85)", marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(251,191,36,0.9)", flexShrink: 0 }} />
                    {daily[hoverDay].vipRsvps} VIP RSVPs
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            {allSources.map(src => (
              <div key={src} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: 1.5, background: getSourceColor(src) }} />
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>{src}</span>
              </div>
            ))}
            {maxDailyRsvps > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 10, height: 2, borderRadius: 1, background: "rgba(74,222,128,0.7)" }} />
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>RSVPs</span>
              </div>
            )}
            {hasVipRsvps && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "rgba(251,191,36,0.9)" }} />
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>VIP RSVPs</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Traffic sources summary */}
      {sources.length > 0 && (
        <div>
          <div style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>
            Traffic sources
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sources.slice(0, 8).map(s => {
              const campaignBreakdown = (s.source === "pullup_newsletter" && ev.campaignBreakdown)
                ? ev.campaignBreakdown : null;
              return (
                <div key={s.source}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 80, fontSize: "11px", color: "rgba(255,255,255,0.6)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      flexShrink: 0, display: "flex", alignItems: "center", gap: 5,
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: 1.5, background: getSourceColor(s.source), flexShrink: 0 }} />
                      {s.source}
                    </div>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.04)" }}>
                      <div style={{
                        height: "100%", borderRadius: 3,
                        background: getSourceColor(s.source),
                        width: `${s.percentage}%`,
                        minWidth: s.count > 0 ? 4 : 0,
                      }} />
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)", minWidth: 36, textAlign: "right" }}>
                      {s.count}
                    </div>
                    <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", minWidth: 36, textAlign: "right" }}>
                      {s.percentage}%
                    </div>
                  </div>
                  {/* Campaign drill-down for newsletter sources */}
                  {campaignBreakdown && campaignBreakdown.length > 0 && (
                    <div style={{ marginLeft: 24, marginTop: 3, marginBottom: 3 }}>
                      {campaignBreakdown.map(cb => (
                        <div key={cb.tag} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
                          <span style={{ fontSize: "10px", color: "rgba(251,191,36,0.5)" }}>↳</span>
                          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {cb.tag.replace("weekly_happenings_", "weekly ").replace("newsletter_", "").replace(/_/g, "-")}
                          </span>
                          <span style={{ fontSize: "10px", fontWeight: 600, color: "rgba(251,191,36,0.5)", minWidth: 24, textAlign: "right" }}>
                            {cb.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

function formatEventTime(startsAt, endsAt) {
  if (!startsAt) return "";
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
  const sameDay = start.toDateString() === end.toDateString();
  const dateOpts = { day: "numeric", month: "short" };
  const timeOpts = { hour: "2-digit", minute: "2-digit", hour12: false };
  if (sameDay) {
    return `${start.toLocaleDateString("en-GB", dateOpts)} · ${start.toLocaleTimeString("en-GB", timeOpts)} – ${end.toLocaleTimeString("en-GB", timeOpts)}`;
  }
  return `${start.toLocaleDateString("en-GB", dateOpts)} ${start.toLocaleTimeString("en-GB", timeOpts)} – ${end.toLocaleDateString("en-GB", dateOpts)} ${end.toLocaleTimeString("en-GB", timeOpts)}`;
}

function StackedBarChart({ stacked, eventLabels, previous, hiddenEvents = new Set() }) {
  const [hover, setHover] = useState(null);

  if (!stacked || stacked.length === 0) {
    return (
      <div style={{
        borderRadius: 14,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        padding: "40px 12px",
        textAlign: "center",
        fontSize: "13px",
        color: "rgba(255,255,255,0.3)",
      }}>
        No data for this period.
      </div>
    );
  }

  const eventIds = (eventLabels || []).map((e) => e.id);
  const visibleIds = eventIds.filter(id => !hiddenEvents.has(id));
  const titleMap = {};
  (eventLabels || []).forEach((e) => { titleMap[e.id] = e.title; });

  // Calculate max for Y axis (only visible events)
  const maxCurrent = Math.max(...stacked.map((d) => {
    let total = 0;
    for (const eid of visibleIds) total += (d[eid] || 0);
    if (!hiddenEvents.size) total += (d._other || 0);
    return total;
  }), 1);
  const maxPrev = previous ? Math.max(...previous.map((d) => d.views), 0) : 0;
  const maxVal = Math.max(maxCurrent, maxPrev, 1);
  const niceMax = Math.ceil(maxVal / (maxVal > 20 ? 10 : maxVal > 5 ? 5 : 1)) * (maxVal > 20 ? 10 : maxVal > 5 ? 5 : 1) || 1;

  // Y ticks
  const yTicks = [0, Math.round(niceMax / 2), niceMax];

  // X labels — show ~5-7 evenly spaced dates
  const step = Math.max(1, Math.floor(stacked.length / 6));
  const xLabelIndices = stacked.map((_, i) => i).filter(i => i % step === 0 || i === stacked.length - 1);

  const W = 640;
  const H = 180;
  const PAD = { top: 10, right: 8, bottom: 26, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barWidth = Math.max(2, (chartW / stacked.length) * 0.7);
  const barGap = (chartW / stacked.length) - barWidth;

  return (
    <div
      style={{
        borderRadius: 14,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.06)",
        padding: "14px 12px 8px",
        position: "relative",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid lines + Y labels */}
        {yTicks.map((v) => {
          const y = PAD.top + chartH - (v / niceMax) * chartH;
          return (
            <g key={v}>
              <line
                x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                stroke="rgba(255,255,255,0.06)" strokeDasharray="4,4"
              />
              <text
                x={PAD.left - 6} y={y + 3}
                textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="10"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabelIndices.map((i) => {
          const x = PAD.left + (i / (stacked.length - 1 || 1)) * chartW;
          const label = new Date(stacked[i].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          return (
            <text
              key={stacked[i].date} x={x} y={H - 4}
              textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10"
            >
              {label}
            </text>
          );
        })}

        {/* Previous period ghost bars */}
        {previous && previous.map((d, i) => {
          if (d.views === 0) return null;
          const x = PAD.left + (i / (stacked.length - 1 || 1)) * chartW - barWidth / 2;
          const barH = (d.views / niceMax) * chartH;
          const y = PAD.top + chartH - barH;
          return (
            <rect
              key={`prev-${i}`}
              x={x} y={y}
              width={barWidth} height={barH}
              rx={2}
              fill="rgba(255,255,255,0.06)"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.5"
            />
          );
        })}

        {/* Stacked bars */}
        {stacked.map((d, i) => {
          const x = PAD.left + (i / (stacked.length - 1 || 1)) * chartW - barWidth / 2;
          let yOffset = 0;

          // Calculate total for this day (only visible events)
          let dayTotal = 0;
          for (const eid of visibleIds) dayTotal += (d[eid] || 0);
          if (!hiddenEvents.size) dayTotal += (d._other || 0);

          const segments = [];

          // Stack event segments bottom-up (skip hidden)
          for (let ei = eventIds.length - 1; ei >= 0; ei--) {
            const eid = eventIds[ei];
            if (hiddenEvents.has(eid)) continue;
            const val = d[eid] || 0;
            if (val === 0) continue;
            const segH = (val / niceMax) * chartH;
            const y = PAD.top + chartH - yOffset - segH;
            segments.push(
              <rect
                key={`${i}-${eid}`}
                x={x} y={y}
                width={barWidth} height={segH}
                rx={yOffset === 0 ? 2 : 0}
                fill={EVENT_COLORS[ei % EVENT_COLORS.length]}
              />
            );
            yOffset += segH;
          }

          // "Other" segment (hide if any events are filtered)
          if (d._other > 0 && !hiddenEvents.size) {
            const segH = (d._other / niceMax) * chartH;
            const y = PAD.top + chartH - yOffset - segH;
            segments.push(
              <rect
                key={`${i}-other`}
                x={x} y={y}
                width={barWidth} height={segH}
                rx={yOffset === 0 ? 2 : 0}
                fill="rgba(255,255,255,0.15)"
              />
            );
          }

          return (
            <g key={i} onMouseEnter={() => setHover({ i, d, dayTotal, x: x + barWidth / 2 })}>
              {/* Invisible hover zone */}
              <rect
                x={PAD.left + (i / (stacked.length - 1 || 1)) * chartW - chartW / stacked.length / 2}
                y={PAD.top}
                width={chartW / stacked.length}
                height={chartH}
                fill="transparent"
                style={{ cursor: "crosshair" }}
              />
              {segments}
              {/* Hover highlight */}
              {hover?.i === i && (
                <line
                  x1={x + barWidth / 2} y1={PAD.top}
                  x2={x + barWidth / 2} y2={PAD.top + chartH}
                  stroke="rgba(255,255,255,0.15)" strokeWidth="1"
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hover && (
        <div
          style={{
            position: "absolute",
            left: `${(hover.x / W) * 100}%`,
            top: "10%",
            transform: `translateX(${hover.x > W * 0.7 ? "calc(-100% - 12px)" : "12px"})`,
            background: "rgba(15,12,25,0.95)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 8,
            padding: "8px 12px",
            fontSize: "12px",
            color: "#fff",
            lineHeight: 1.6,
            backdropFilter: "blur(12px)",
            pointerEvents: "none",
            zIndex: 10,
            whiteSpace: "nowrap",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {new Date(hover.d.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)" }}>
            {hover.dayTotal} total views
          </div>
          {eventIds.map((eid, ei) => {
            if (hiddenEvents.has(eid)) return null;
            const val = hover.d[eid] || 0;
            if (val === 0) return null;
            return (
              <div key={eid} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                <div style={{
                  width: 6, height: 6, borderRadius: 1,
                  background: EVENT_COLORS[ei % EVENT_COLORS.length],
                }} />
                <span style={{ color: "rgba(255,255,255,0.5)" }}>
                  {titleMap[eid]}: {val}
                </span>
              </div>
            );
          })}
          {previous && previous[hover.i] && previous[hover.i].views > 0 && (
            <div style={{ color: "rgba(255,255,255,0.3)", marginTop: 2 }}>
              prev: {previous[hover.i].views} views
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampaignCard({ campaign: c }) {
  const steps = [
    { label: "Sent", value: c.sent, color: "rgba(255,255,255,0.3)" },
    { label: "Opened", value: c.opened, rate: c.openRate, color: "rgba(59,130,246,0.7)" },
    { label: "Clicked", value: c.clicked, rate: c.clickRate, color: "rgba(139,92,246,0.7)" },
    { label: "Visited", value: c.visited, rate: c.visitRate, color: "rgba(74,222,128,0.7)" },
    { label: "RSVP'd", value: c.rsvps, rate: c.conversionRate, color: "rgba(251,191,36,0.8)" },
  ];

  return (
    <div style={{
      padding: "12px 14px",
      borderRadius: 12,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {c.name}
        </div>
        <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", flexShrink: 0, marginLeft: 8 }}>
          {c.tag.startsWith("vip_invite_") ? "VIP" : "Newsletter"}
        </div>
      </div>

      {/* Funnel visualization */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, marginBottom: 8 }}>
        {steps.map((step, i) => {
          const maxVal = steps[0].value || 1;
          const h = Math.max(4, (step.value / maxVal) * 36);
          return (
            <div key={step.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{
                width: "100%", height: h, borderRadius: 3,
                background: step.value > 0 ? step.color : "rgba(255,255,255,0.04)",
                transition: "height 0.3s ease",
              }} />
            </div>
          );
        })}
      </div>

      {/* Labels + values */}
      <div style={{ display: "flex", gap: 2 }}>
        {steps.map((step, i) => (
          <div key={step.label} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: step.value > 0 ? step.color : "rgba(255,255,255,0.15)" }}>
              {step.value}
            </div>
            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", marginTop: 1 }}>
              {step.label}
            </div>
            {step.rate !== undefined && step.rate > 0 && (
              <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                {step.rate}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeviceSplitDonut({ split }) {
  const total = split.mobile + split.desktop + split.unknown;
  if (total === 0) return null;

  const segments = [
    { key: "mobile", label: "Mobile", count: split.mobile, color: "rgba(59,130,246,0.7)", icon: Smartphone },
    { key: "desktop", label: "Desktop", count: split.desktop, color: "rgba(139,92,246,0.7)", icon: Monitor },
    { key: "unknown", label: "Unknown", count: split.unknown, color: "rgba(255,255,255,0.15)", icon: HelpCircle },
  ].filter(s => s.count > 0);

  // SVG donut chart
  const R = 32, STROKE = 8, CX = 40, CY = 40;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={{
      padding: "14px 16px",
      borderRadius: 12,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      marginBottom: 24,
      display: "flex",
      alignItems: "center",
      gap: 16,
    }}>
      <svg width={80} height={80} viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
        {segments.map(seg => {
          const pct = seg.count / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle
              key={seg.key}
              cx={CX} cy={CY} r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={-currentOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${CX} ${CY})`}
              style={{ transition: "all 0.3s ease" }}
            />
          );
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="700">{total}</text>
        <text x={CX} y={CY + 8} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="7">views</text>
      </svg>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {segments.map(seg => {
          const pct = Math.round((seg.count / total) * 1000) / 10;
          const Icon = seg.icon;
          return (
            <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon size={12} style={{ color: seg.color, flexShrink: 0 }} />
              <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", minWidth: 56 }}>{seg.label}</span>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.04)" }}>
                <div style={{ height: "100%", borderRadius: 2, background: seg.color, width: `${pct}%`, transition: "width 0.3s ease" }} />
              </div>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.5)", minWidth: 28, textAlign: "right" }}>{seg.count}</span>
              <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", minWidth: 36, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div style={{
      padding: 14,
      borderRadius: 12,
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ fontSize: "11px", color: colors.textFaded, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: color || "#fff" }}>{value}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.1em",
      fontWeight: 600, color: "rgba(255,255,255,0.4)", marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function ChangeIndicator({ value }) {
  if (value === null || value === undefined) return null;
  const isUp = value > 0;
  const isDown = value < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
  const color = isUp ? "#4ade80" : isDown ? "#f87171" : "rgba(255,255,255,0.3)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "11px", fontWeight: 600, color }}>
      <Icon size={12} />
      {Math.abs(value)}%
    </span>
  );
}
