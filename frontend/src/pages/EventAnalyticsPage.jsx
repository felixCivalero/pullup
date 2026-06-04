import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import { colors } from "../theme/colors.js";
import { Download, Smartphone, Monitor, HelpCircle } from "lucide-react";
import { generateEventReport } from "../lib/reportGenerator.js";
import { DateRangePicker } from "../components/DateRangePicker.jsx";

const SOURCE_COLORS = {
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

function getSourceColor(name) {
  return SOURCE_COLORS[name] || `rgba(${60 + ((name.charCodeAt(0) * 37) % 180)},${80 + ((name.charCodeAt(1 % name.length) * 53) % 150)},${120 + ((name.charCodeAt(2 % name.length) * 71) % 130)},0.6)`;
}

function formatRevenue(cents, currency = 'sek') {
  if (!cents && cents !== 0) return 'N/A';
  const amount = cents / 100;
  const sym = currency === 'sek' ? ' kr' : currency === 'eur' ? '€' : currency === 'gbp' ? '£' : '$';
  const prefix = ['eur','gbp','usd'].includes(currency);
  return prefix ? `${sym}${amount.toLocaleString()}` : `${amount.toLocaleString()}${sym}`;
}

export function EventAnalyticsPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { setEventNav } = useEventNav();

  const [event, setEvent] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  // Date range state (default last 30 days)
  const [dateStart, setDateStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d;
  });
  const [dateEnd, setDateEnd] = useState(() => {
    const d = new Date(); d.setHours(23, 59, 59, 999); return d;
  });

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

  const days = Math.round((dateEnd - dateStart) / 86400000) + 1;


  const loadAnalytics = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: dateStart.toISOString(),
        endDate: dateEnd.toISOString(),
      });
      const [eventRes, analyticsRes] = await Promise.all([
        authenticatedFetch(`/host/events/${id}`),
        authenticatedFetch(`/host/events/${id}/analytics?${params}`),
      ]);
      // Not your event → graceful exit into the room they can see, not a dead end.
      if (eventRes.status === 403) { navigate(`/events/${id}/room`, { replace: true }); return; }
      if (eventRes.ok) {
        const eventData = await eventRes.json();
        setEvent(eventData);
        setEventNav({ title: eventData.title, slug: eventData.slug, status: eventData.status, myRole: eventData.myRole });
      }
      if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
    } catch (err) {
      console.error("Failed to load event analytics:", err);
    }
    setLoading(false);
  }, [user, id, dateStart, dateEnd]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "13px", color: colors.textFaded }}>Loading...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{ minHeight: "100vh", background: "#fff", padding: "60px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "14px", color: colors.textFaded }}>Event not found</div>
      </div>
    );
  }

  const data = analytics || {
    total_views: 0, unique_visitors: 0, sources: [],
    daily: [], device_split: null,
    vip_stats: null, vip_views: 0, campaigns: [],
    rsvp_count: 0, conversion_rate: 0, period: null,
    pulled_up: 0, capacity: 0, is_paid: false,
    ticket_price: 0, ticket_currency: 'sek',
    revenue: 0, show_rate: 0, fill_rate: 0,
  };

  const daily = data.daily || [];
  const sources = data.sources || [];
  const allSources = [...new Set(sources.map(s => s.source))];

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        background: "#fff",
        paddingLeft: "clamp(12px, 3vw, 24px)",
        paddingRight: "clamp(12px, 3vw, 24px)",
        paddingBottom: 60,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "clamp(16px, 3vw, 24px)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h1 style={{ margin: 0, fontSize: "clamp(18px, 4vw, 24px)", fontWeight: 700, color: colors.text }}>
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
            <p style={{
              margin: 0, fontSize: "13px", color: colors.textSubtle,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8,
            }}>
              {event.title}
            </p>
            {(data.unique_visitors > 0 || data.total_views > 0) && (
              <button
                onClick={() => generateEventReport({
                  event,
                  data,
                  days,
                  startDate: dateStart,
                  endDate: dateEnd,
                })}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "6px 14px", borderRadius: "999px",
                  border: `1px solid ${colors.borderStrong}`,
                  background: "#fff",
                  color: colors.text, fontSize: "12px", fontWeight: 500,
                  cursor: "pointer", flexShrink: 0,
                  transition: "all 0.2s ease",
                  boxShadow: "0 1px 4px rgba(10,10,10,0.06)",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.surface; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#fff"; }}
              >
                <Download size={13} />
                Export Report
              </button>
            )}
          </div>
        </div>

        {data.total_views === 0 && data.unique_visitors === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "14px", color: colors.textSubtle }}>
              No visitors in this period. Analytics will appear once people visit your event page.
            </div>
          </div>
        ) : (
          <>
            {/* Conversion funnel */}
            <FunnelChart
              views={data.total_views}
              rsvps={data.rsvp_count}
              dinner={data.dinner_enabled ? data.dinner : null}
              dinnerCapacity={data.dinner_enabled ? data.dinner_capacity : null}
              pulledUp={data.pulled_up}
              revenue={data.is_paid ? data.revenue : null}
              currency={data.ticket_currency}
              capacity={data.capacity}
              uniqueVisitors={data.unique_visitors}
              viewsChange={data.period?.viewsChange}
              uniqueChange={data.period?.uniqueChange}
            />

            {/* Device split */}
            {data.device_split && ((data.device_split.mobile || 0) + (data.device_split.desktop || 0) + (data.device_split.unknown || 0)) > 0 && (
              <DeviceSplitDonut split={data.device_split} />
            )}

            {/* Daily chart with source breakdown + RSVPs + VIP dots */}
            {daily.length > 0 && <DailyChart daily={daily} allSources={allSources} />}

            {/* Traffic sources */}
            {sources.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <SectionLabel>Traffic Sources</SectionLabel>
                <div style={{
                  borderRadius: 14,
                  background: "#fff",
                  border: `1px solid ${colors.border}`,
                  overflow: "hidden",
                  boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
                }}>
                  {sources.map((s, i) => (
                    <div key={s.source} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px",
                      borderBottom: i < sources.length - 1 ? `1px solid ${colors.borderFaint}` : "none",
                    }}>
                      <div style={{ width: 6, height: 6, borderRadius: 2, background: getSourceColor(s.source), flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: "13px", color: colors.text, textTransform: "capitalize" }}>{s.source}</div>
                      <div style={{ width: 80, height: 4, borderRadius: 2, background: colors.borderFaint }}>
                        <div style={{ height: "100%", borderRadius: 2, background: getSourceColor(s.source), width: `${s.percentage}%` }} />
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: colors.text, minWidth: 28, textAlign: "right" }}>{s.count}</div>
                      <div style={{ fontSize: "11px", color: colors.textFaded, minWidth: 36, textAlign: "right" }}>{s.percentage}%</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Campaigns section */}
            <div style={{ marginBottom: 20 }}>
              <SectionLabel>Campaigns</SectionLabel>
              {(data.campaigns || []).length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {data.campaigns.map(c => <CampaignCard key={c.tag} campaign={c} />)}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: colors.textFaded, margin: 0 }}>No campaigns sent in this period</p>
              )}
            </div>

          </>
        )}
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────

function MetricCard({ label, value, color, change }) {
  return (
    <div style={{
      padding: 14, borderRadius: 12,
      background: "#fff",
      border: `1px solid ${colors.border}`,
      boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      <div style={{ fontSize: "11px", color: colors.textFaded, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: color || colors.text }}>{value}</div>
      {change !== undefined && change !== null && (
        <div style={{
          fontSize: "10px", fontWeight: 600, marginTop: 2,
          color: change > 0 ? colors.success : change < 0 ? colors.danger : colors.textFaded,
        }}>
          {change > 0 ? "↑" : change < 0 ? "↓" : "→"} {Math.abs(change)}% vs prev
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: color || colors.text }}>{value}</div>
      <div style={{ fontSize: "10px", color: colors.textFaded }}>{label}</div>
    </div>
  );
}

function FunnelChart({ views, rsvps, dinner, dinnerCapacity, pulledUp, revenue, currency, revenueByCurrency, capacity, uniqueVisitors, viewsChange, uniqueChange, mini }) {
  const topMetric = uniqueVisitors > 0 ? uniqueVisitors : views;
  const steps = [
    { label: "Unique Visitors", value: topMetric, rate: null, color: "#ec178f" },
    { label: "RSVPs", value: rsvps, cap: capacity > 0 ? capacity : null, rate: topMetric > 0 ? Math.round((rsvps / topMetric) * 1000) / 10 : 0, rateLabel: "of visitors", color: "#0d9488" },
  ];
  if (dinner !== null && dinner !== undefined) {
    steps.push({ label: "Dinner", value: dinner, cap: dinnerCapacity > 0 ? dinnerCapacity : null, rate: rsvps > 0 ? Math.round((dinner / rsvps) * 1000) / 10 : 0, rateLabel: "of RSVPs", color: "#b45309" });
  }
  steps.push({ label: "Pulled Up", value: pulledUp, rate: rsvps > 0 ? Math.round((pulledUp / rsvps) * 1000) / 10 : 0, rateLabel: "of RSVPs", color: "#16a34a" });
  if (revenue !== null && revenue !== undefined) {
    const revenueDisplay = revenueByCurrency && Object.keys(revenueByCurrency).length > 0
      ? formatRevenueByCurrency(revenueByCurrency)
      : formatRevenue(revenue, currency);
    steps.push({ label: "Revenue", value: revenueDisplay, rawValue: revenue, rate: null, color: "#b45309" });
  }
  const maxVal = Math.max(topMetric, 1);

  return (
    <div style={{
      padding: mini ? "10px 12px" : "14px 16px", borderRadius: mini ? 10 : 14,
      background: "#fff",
      border: `1px solid ${colors.border}`,
      marginBottom: mini ? 12 : 20,
      boxShadow: mini ? "none" : "0 8px 30px rgba(10,10,10,0.06)",
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
                    <span style={{ fontSize: mini ? "11px" : "13px", fontWeight: 500, color: colors.textFaded }}>
                      {" / "}{step.cap.toLocaleString()}
                    </span>
                  )}
                </span>
                <span style={{ fontSize: mini ? "10px" : "11px", color: colors.textSubtle, fontWeight: 500 }}>
                  {step.label}
                </span>
              </div>
              {step.rate !== null && step.rate !== undefined && (
                <span style={{
                  fontSize: mini ? "10px" : "11px", fontWeight: 600,
                  color: step.rate > (step.label === "Pulled Up" ? 50 : 20) ? colors.success : colors.textSubtle,
                }}>
                  {step.rate}% <span style={{ fontWeight: 400, color: colors.textFaded }}>{step.rateLabel}</span>
                </span>
              )}
            </div>
            <div style={{
              height: mini ? 4 : 6, borderRadius: 3,
              background: colors.borderFaint,
            }}>
              <div style={{
                height: "100%", borderRadius: 3,
                background: step.color,
                width: `${Math.max(barPct, step.value > 0 || step.rawValue > 0 ? 2 : 0)}%`,
                transition: "width 0.3s ease",
              }} />
            </div>
            {step.label === "Unique Visitors" && views > 0 && !mini && (
              <div style={{ fontSize: "10px", color: colors.textFaded, marginTop: 3 }}>
                {views.toLocaleString()} total views
              </div>
            )}
          </div>
        );
      })}
      {/* Secondary stats */}
      {!mini && capacity > 0 && (
        <div style={{
          display: "flex", gap: 16, marginTop: 12,
          paddingTop: 10, borderTop: `1px solid ${colors.borderFaint}`,
        }}>
          <div>
            <span style={{ fontSize: "14px", fontWeight: 700, color: colors.text }}>{Math.min(100, Math.round((rsvps / capacity) * 100))}%</span>
            <span style={{ fontSize: "10px", color: colors.textSubtle, marginLeft: 4 }}>of {capacity} capacity</span>
          </div>
        </div>
      )}
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

function DeviceSplitDonut({ split }) {
  const total = split.mobile + split.desktop + split.unknown;
  if (total === 0) return null;

  const segments = [
    { key: "mobile", label: "Mobile", count: split.mobile, color: "#ec178f", icon: Smartphone },
    { key: "desktop", label: "Desktop", count: split.desktop, color: "#0d9488", icon: Monitor },
    { key: "unknown", label: "Unknown", count: split.unknown, color: colors.border, icon: HelpCircle },
  ].filter(s => s.count > 0);

  const R = 32, STROKE = 8, CX = 40, CY = 40;
  const circumference = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={{
      padding: "14px 16px", borderRadius: 12,
      background: "#fff",
      border: `1px solid ${colors.border}`,
      marginBottom: 20, display: "flex", alignItems: "center", gap: 16,
      boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      <svg width={80} height={80} viewBox="0 0 80 80" style={{ flexShrink: 0 }}>
        {segments.map(seg => {
          const pct = seg.count / total;
          const dash = pct * circumference;
          const gap = circumference - dash;
          const currentOffset = offset;
          offset += dash;
          return (
            <circle key={seg.key} cx={CX} cy={CY} r={R} fill="none"
              stroke={seg.color} strokeWidth={STROKE}
              strokeDasharray={`${dash} ${gap}`} strokeDashoffset={-currentOffset}
              strokeLinecap="round" transform={`rotate(-90 ${CX} ${CY})`}
              style={{ transition: "all 0.3s ease" }}
            />
          );
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" fill="#0a0a0a" fontSize="14" fontWeight="700">{total}</text>
        <text x={CX} y={CY + 8} textAnchor="middle" fill="rgba(10,10,10,0.45)" fontSize="7">visitors</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
        {segments.map(seg => {
          const pct = Math.round((seg.count / total) * 1000) / 10;
          const Icon = seg.icon;
          return (
            <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icon size={12} style={{ color: seg.color, flexShrink: 0 }} />
              <span style={{ fontSize: "12px", color: colors.textMuted, minWidth: 56 }}>{seg.label}</span>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: colors.borderFaint }}>
                <div style={{ height: "100%", borderRadius: 2, background: seg.color, width: `${pct}%` }} />
              </div>
              <span style={{ fontSize: "11px", fontWeight: 600, color: colors.textMuted, minWidth: 28, textAlign: "right" }}>{seg.count}</span>
              <span style={{ fontSize: "10px", color: colors.textFaded, minWidth: 36, textAlign: "right" }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyChart({ daily, allSources }) {
  const [hoverDay, setHoverDay] = useState(null);
  const maxDailyViews = Math.max(...daily.map(d => d.views), 1);
  const maxDailyRsvps = Math.max(...daily.map(d => d.rsvps), 1);
  const maxDailyVipRsvps = Math.max(...daily.map(d => d.vipRsvps || 0), 0);
  const hasVipRsvps = maxDailyVipRsvps > 0;

  const step = Math.max(1, Math.floor(daily.length / 7));
  const xLabels = daily.map((_, i) => i).filter(i => i % step === 0 || i === daily.length - 1);

  const W = 480, H = 120;
  const PAD = { top: 6, right: 6, bottom: 18, left: 28 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const niceMax = Math.ceil(maxDailyViews / (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1)) * (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1) || 1;
  const rsvpScale = maxDailyRsvps > 0 ? chartH / maxDailyRsvps : 0;
  const barWidth = Math.max(2, (chartW / daily.length) * 0.7);

  const rsvpPoints = daily.map((d, i) => {
    const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
    const y = PAD.top + chartH - (d.rsvps * rsvpScale);
    return `${i === 0 ? "M" : "L"}${x},${y}`;
  }).join(" ");

  return (
    <div style={{ marginBottom: 20 }}>
      <SectionLabel>Daily Unique Visitors by Source & RSVPs</SectionLabel>
      <div style={{
        borderRadius: 14, background: "#fff",
        border: `1px solid ${colors.border}`,
        padding: "10px 8px 6px", position: "relative",
        boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
      }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}
          onMouseLeave={() => setHoverDay(null)}
        >
          {[0, 0.5, 1].map(f => {
            const y = PAD.top + chartH - f * chartH;
            const val = Math.round(f * niceMax);
            return (
              <g key={f}>
                <line x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
                  stroke="rgba(10,10,10,0.07)" strokeDasharray="3,3" />
                <text x={PAD.left - 4} y={y + 3} textAnchor="end" fill="rgba(10,10,10,0.35)" fontSize="8">{val}</text>
              </g>
            );
          })}

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
                  rx={yOffset === 0 ? 1.5 : 0} fill={getSourceColor(src)} />
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

          {maxDailyRsvps > 0 && (
            <path d={rsvpPoints} fill="none" stroke="#16a34a" strokeWidth="1.5"
              strokeLinejoin="round" strokeLinecap="round" />
          )}

          {daily.map((d, i) => {
            if (d.rsvps === 0) return null;
            const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
            const y = PAD.top + chartH - (d.rsvps * rsvpScale);
            return <circle key={`rd-${i}`} cx={x} cy={y} r={2.5} fill="#16a34a" />;
          })}

          {daily.map((d, i) => {
            if (!d.vipRsvps || d.vipRsvps === 0) return null;
            const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
            const y = PAD.top + chartH - (d.vipRsvps / niceMax) * chartH;
            return (
              <g key={`vip-${i}`}>
                <circle cx={x} cy={y} r={5} fill="rgba(180,83,9,0.12)" />
                <circle cx={x} cy={y} r={3} fill="#b45309" stroke="rgba(180,83,9,0.4)" strokeWidth="1" />
              </g>
            );
          })}

          {hoverDay !== null && (
            <line
              x1={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
              y1={PAD.top}
              x2={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
              y2={PAD.top + chartH}
              stroke="rgba(10,10,10,0.12)" strokeWidth="1"
            />
          )}

          {xLabels.map(i => {
            const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
            const label = new Date(daily[i].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
            return <text key={i} x={x} y={H - 2} textAnchor="middle" fill="rgba(10,10,10,0.35)" fontSize="7.5">{label}</text>;
          })}
        </svg>

        {hoverDay !== null && daily[hoverDay] && (
          <div style={{
            position: "absolute",
            left: `${((PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW) / W) * 100}%`,
            top: 8,
            transform: `translateX(${hoverDay > daily.length * 0.65 ? "calc(-100% - 8px)" : "8px"})`,
            background: "#fff", border: `1px solid ${colors.border}`,
            borderRadius: 6, padding: "6px 10px", fontSize: "11px", color: colors.text,
            lineHeight: 1.5, boxShadow: "0 4px 16px rgba(10,10,10,0.10)", pointerEvents: "none", zIndex: 10, whiteSpace: "nowrap",
          }}>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
              {new Date(daily[hoverDay].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </div>
            <div style={{ color: colors.textMuted }}>{daily[hoverDay].views} unique visitors</div>
            {Object.entries(daily[hoverDay].bySource || {}).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
              <div key={src} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                <div style={{ width: 5, height: 5, borderRadius: 1, background: getSourceColor(src), flexShrink: 0 }} />
                <span style={{ color: colors.textSubtle }}>{src}: {count}</span>
              </div>
            ))}
            {daily[hoverDay].rsvps > 0 && (
              <div style={{ color: colors.success, marginTop: 2 }}>{daily[hoverDay].rsvps} RSVPs</div>
            )}
            {(daily[hoverDay].vipRsvps || 0) > 0 && (
              <div style={{ color: colors.gold, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: "50%", background: colors.gold, flexShrink: 0 }} />
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
            <span style={{ fontSize: "10px", color: colors.textSubtle }}>{src}</span>
          </div>
        ))}
        {maxDailyRsvps > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 2, borderRadius: 1, background: "#16a34a" }} />
            <span style={{ fontSize: "10px", color: colors.textSubtle }}>RSVPs</span>
          </div>
        )}
        {hasVipRsvps && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: colors.gold }} />
            <span style={{ fontSize: "10px", color: colors.textSubtle }}>VIP RSVPs</span>
          </div>
        )}
      </div>
    </div>
  );
}

function CampaignCard({ campaign: c }) {
  const steps = [
    { label: "Sent", value: c.sent, color: colors.textSubtle },
    { label: "Opened", value: c.opened, rate: c.openRate, color: "#ec178f" },
    { label: "Clicked", value: c.clicked, rate: c.clickRate, color: "#0d9488" },
    { label: "Visited", value: c.visited, rate: c.visitRate, color: "#16a34a" },
    { label: "RSVP'd", value: c.rsvps, rate: c.conversionRate, color: "#b45309" },
  ];
  const isFollowup = c.templateType === "followup";
  const badgeBg = isFollowup ? "rgba(180,83,9,0.10)" : colors.accentSoft;
  const badgeFg = isFollowup ? colors.gold : colors.accent;

  return (
    <div style={{
      padding: "12px 14px", borderRadius: 12,
      background: "#fff", border: `1px solid ${colors.border}`,
      boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
        <div style={{ fontSize: "13px", fontWeight: 600, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{
            display: "inline-block",
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 600,
            borderRadius: 999,
            background: badgeBg,
            color: badgeFg,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            flex: "0 0 auto",
          }}>{isFollowup ? "Follow-up" : "Event"}</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, marginBottom: 8 }}>
        {steps.map((step) => {
          const maxVal = steps[0].value || 1;
          const h = Math.max(4, (step.value / maxVal) * 36);
          return (
            <div key={step.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{
                width: "100%", height: h, borderRadius: 3,
                background: step.value > 0 ? step.color : colors.borderFaint,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 2 }}>
        {steps.map((step) => (
          <div key={step.label} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: step.value > 0 ? step.color : colors.border }}>
              {step.value}
            </div>
            <div style={{ fontSize: "9px", color: colors.textSubtle, marginTop: 1 }}>{step.label}</div>
            {step.rate !== undefined && step.rate > 0 && (
              <div style={{ fontSize: "9px", color: colors.textFaded, marginTop: 1 }}>{step.rate}%</div>
            )}
          </div>
        ))}
      </div>
      {Array.isArray(c.linkBreakdown) && c.linkBreakdown.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 10, color: colors.textSubtle, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Links</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {c.linkBreakdown.slice(0, 5).map((row, i) => (
              <li key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginRight: 8, color: colors.textMuted }}>
                  {row.linkLabel || row.linkUrl}
                </span>
                <span style={{ color: colors.secondary, fontWeight: 600 }}>{row.clicks}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
