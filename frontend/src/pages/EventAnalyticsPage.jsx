import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import { colors } from "../theme/colors.js";

export function EventAnalyticsPage() {
  const { id } = useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { setEventNav } = useEventNav();

  const [event, setEvent] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user || !id) return;
    async function load() {
      setLoading(true);
      try {
        const [eventRes, analyticsRes] = await Promise.all([
          authenticatedFetch(`/host/events/${id}`),
          authenticatedFetch(`/host/events/${id}/analytics`),
        ]);
        if (eventRes.ok) {
          const eventData = await eventRes.json();
          setEvent(eventData);
          setEventNav({
            title: eventData.title,
            slug: eventData.slug,
          });
        }
        if (analyticsRes.ok) setAnalytics(await analyticsRes.json());
      } catch {}
      setLoading(false);
    }
    load();
  }, [user, id]);

  if (authLoading || loading) {
    return (
      <div style={{ minHeight: "100vh", background: colors.background, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: "13px", color: colors.textFaded }}>Loading...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={{ minHeight: "100vh", background: colors.background, padding: "60px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "14px", color: colors.textFaded }}>Event not found</div>
      </div>
    );
  }

  const data = analytics || {
    total_views: 0, unique_visitors: 0, sources: [],
    daily_views: {}, newsletter_views: 0, newsletter_campaigns: [],
    vip_stats: null, vip_views: 0,
    rsvp_count: 0, conversion_rate: 0,
  };

  // Build daily views chart data (last 30 days)
  const days = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, views: data.daily_views[key] || 0 });
  }
  const maxViews = Math.max(...days.map((d) => d.views), 1);

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        background: colors.background,
        padding: "0 clamp(12px, 3vw, 24px) 60px",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "clamp(16px, 3vw, 24px)" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(18px, 4vw, 24px)", fontWeight: 700, color: colors.text }}>
            Analytics
          </h1>
          <p style={{
            margin: "2px 0 0", fontSize: "13px", color: colors.textSubtle,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {event.title}
          </p>
        </div>

        {data.total_views === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "32px", marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: "14px", color: colors.textSubtle }}>
              No page views yet. Analytics will appear once people visit your event page.
            </div>
          </div>
        ) : (
          <>
            {/* Key metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 24 }}>
              <MetricCard label="Total Views" value={data.total_views} />
              <MetricCard label="Unique Visitors" value={data.unique_visitors} />
              <MetricCard label="RSVPs" value={data.rsvp_count} />
              <MetricCard
                label="Conversion"
                value={`${data.conversion_rate}%`}
                color={data.conversion_rate > 20 ? colors.success : undefined}
              />
            </div>

            {/* Conversion funnel */}
            <SectionLabel>Funnel</SectionLabel>
            <div style={{
              padding: "16px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              marginBottom: 24,
            }}>
              <FunnelBar label="Page views" value={data.total_views} max={data.total_views} color="rgba(59,130,246,0.7)" />
              <FunnelBar label="RSVPs" value={data.rsvp_count} max={data.total_views} color={colors.success} />
            </div>

            {/* Views chart (last 30 days) */}
            <SectionLabel>Views — Last 30 days</SectionLabel>
            <div style={{
              padding: "16px",
              borderRadius: "14px",
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              marginBottom: 24,
            }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 80 }}>
                {days.map((d) => (
                  <div
                    key={d.date}
                    title={`${d.date}: ${d.views} views`}
                    style={{
                      flex: 1,
                      background: d.views > 0
                        ? "linear-gradient(to top, rgba(59,130,246,0.3), rgba(59,130,246,0.7))"
                        : "rgba(255,255,255,0.03)",
                      borderRadius: "3px 3px 0 0",
                      height: `${Math.max((d.views / maxViews) * 100, d.views > 0 ? 8 : 2)}%`,
                      minHeight: 2,
                      transition: "height 0.3s ease",
                    }}
                  />
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                  {formatShortDate(days[0].date)}
                </span>
                <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)" }}>
                  Today
                </span>
              </div>
            </div>

            {/* Traffic sources */}
            {data.sources.length > 0 && (
              <>
                <SectionLabel>Traffic Sources</SectionLabel>
                <div style={{
                  borderRadius: "14px",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  overflow: "hidden",
                  marginBottom: 24,
                }}>
                  {data.sources.map((s, i) => (
                    <div
                      key={s.source}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        borderBottom: i < data.sources.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                      }}
                    >
                      <SourceIcon source={s.source} />
                      <div style={{ flex: 1, fontSize: "13px", color: "#fff", textTransform: "capitalize" }}>
                        {s.source}
                      </div>
                      <div style={{ width: 80, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)" }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          background: s.source === "pullup_newsletter"
                            ? colors.gold
                            : "rgba(192,192,192,0.5)",
                          width: `${s.percentage}%`,
                        }} />
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#fff", minWidth: 28, textAlign: "right" }}>
                        {s.count}
                      </div>
                      <div style={{ fontSize: "11px", color: colors.textFaded, minWidth: 36, textAlign: "right" }}>
                        {s.percentage}%
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Newsletter impact */}
            {data.newsletter_views > 0 && (
              <>
                <SectionLabel>Newsletter Impact</SectionLabel>
                <div style={{
                  padding: "16px",
                  borderRadius: "14px",
                  background: `linear-gradient(135deg, rgba(251,191,36,0.04), rgba(251,191,36,0.01))`,
                  border: `1px solid rgba(251,191,36,0.15)`,
                  marginBottom: 24,
                }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: "24px", fontWeight: 700, color: colors.gold }}>
                      {data.newsletter_views}
                    </span>
                    <span style={{ fontSize: "13px", color: colors.textSubtle }}>
                      views from newsletters
                    </span>
                  </div>
                  {data.newsletter_campaigns.length > 0 && (
                    <div style={{ fontSize: "11px", color: colors.textFaded }}>
                      Featured in: {data.newsletter_campaigns.map((c) =>
                        c.replace(/_/g, " ").replace(/\bw(\d+)/, "W$1")
                      ).join(", ")}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* VIP Invites impact */}
            {data.vip_stats && data.vip_stats.totalSent > 0 && (
              <>
                <SectionLabel>VIP Invites</SectionLabel>
                <div style={{
                  padding: "16px",
                  borderRadius: "14px",
                  background: `linear-gradient(135deg, rgba(251,191,36,0.06), rgba(251,191,36,0.02))`,
                  border: `1px solid rgba(251,191,36,0.15)`,
                  marginBottom: 24,
                }}>
                  <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: data.vip_views > 0 ? 10 : 0 }}>
                    <div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: colors.gold }}>
                        {data.vip_stats.totalSent}
                      </div>
                      <div style={{ fontSize: "11px", color: colors.textFaded }}>sent</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff" }}>
                        {data.vip_stats.openRate}%
                      </div>
                      <div style={{ fontSize: "11px", color: colors.textFaded }}>open rate</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "22px", fontWeight: 700, color: "#fff" }}>
                        {data.vip_stats.clickRate}%
                      </div>
                      <div style={{ fontSize: "11px", color: colors.textFaded }}>click rate</div>
                    </div>
                  </div>
                  {data.vip_views > 0 && (
                    <div style={{ fontSize: "12px", color: colors.textSubtle }}>
                      {data.vip_views} page view{data.vip_views !== 1 ? "s" : ""} from VIP links
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value, color }) {
  return (
    <div style={{
      padding: "14px",
      borderRadius: "12px",
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

function FunnelBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.7)" }}>{label}</span>
        <span style={{ fontSize: "12px", fontWeight: 600, color }}>{value} ({pct}%)</span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,0.06)" }}>
        <div style={{ height: "100%", borderRadius: 4, background: color, width: `${pct}%`, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function SourceIcon({ source }) {
  const icons = {
    direct: "🔗",
    pullup_newsletter: "✉️",
    instagram: "📸",
    facebook: "👤",
    twitter: "🐦",
    linkedin: "💼",
    pullup: "✨",
  };
  return (
    <span style={{ fontSize: "14px", width: 20, textAlign: "center" }}>
      {icons[source] || "🌐"}
    </span>
  );
}

function formatShortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
