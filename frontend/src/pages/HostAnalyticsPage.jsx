import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

export function HostAnalyticsPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      setLoading(true);
      try {
        const res = await authenticatedFetch("/host/analytics");
        if (res.ok) setData(await res.json());
      } catch {}
      setLoading(false);
    }
    load();
  }, [user]);

  if (authLoading || loading) {
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

  // Build daily views chart (last 30 days)
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
          <h1 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, color: colors.text }}>
            Analytics
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: colors.textSubtle }}>
            Performance across all your events.
          </p>
        </div>

        {data.total_views === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "32px", marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: "14px", color: colors.textSubtle }}>
              No page views yet. Analytics will appear once people visit your event pages.
            </div>
          </div>
        ) : (
          <>
            {/* Key metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 24 }}>
              <MetricCard label="Total Views" value={data.total_views} />
              <MetricCard label="Unique Visitors" value={data.total_unique_visitors} />
              <MetricCard label="Total RSVPs" value={data.total_rsvps} />
              <MetricCard
                label="Avg Conversion"
                value={`${data.avg_conversion}%`}
                color={data.avg_conversion > 20 ? colors.success : undefined}
              />
            </div>

            {/* Newsletter impact */}
            {data.newsletter_views > 0 && (
              <div style={{
                padding: "14px 16px",
                borderRadius: 12,
                background: "linear-gradient(135deg, rgba(251,191,36,0.04), rgba(251,191,36,0.01))",
                border: "1px solid rgba(251,191,36,0.15)",
                marginBottom: 24,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <span style={{ fontSize: "22px", fontWeight: 700, color: colors.gold }}>
                  {data.newsletter_views}
                </span>
                <span style={{ fontSize: "13px", color: colors.textSubtle }}>
                  views from PullUp newsletters
                </span>
              </div>
            )}

            {/* Views chart — last 30 days */}
            <SectionLabel>Views — Last 30 days</SectionLabel>
            <div style={{
              padding: "16px",
              borderRadius: 14,
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

            {/* Events ranked by views */}
            <SectionLabel>Your Events</SectionLabel>
            <div style={{
              borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              overflow: "hidden",
              marginBottom: 24,
            }}>
              {data.events.filter((e) => e.views > 0).map((ev, i, arr) => (
                <div
                  key={ev.id}
                  onClick={() => navigate(`/app/events/${ev.id}/analytics`)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  {/* Rank */}
                  <span style={{
                    width: 22, height: 22, borderRadius: 6,
                    background: i === 0 ? "rgba(59,130,246,0.3)" : i === 1 ? "rgba(192,192,192,0.2)" : "rgba(255,255,255,0.06)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "11px", fontWeight: 700, color: "#fff",
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>

                  {/* Event info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "13px", fontWeight: 500, color: "#fff",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {ev.title}
                    </div>
                    <div style={{ fontSize: "11px", color: colors.textFaded }}>
                      {ev.unique_visitors} visitors · {ev.rsvps} RSVPs · {ev.conversion_rate}% conv.
                    </div>
                  </div>

                  {/* Views bar + count */}
                  <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
                    <div style={{
                      height: "100%", borderRadius: 2,
                      background: "rgba(59,130,246,0.6)",
                      width: `${Math.round((ev.views / data.events[0].views) * 100)}%`,
                    }} />
                  </div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "rgba(59,130,246,0.8)", minWidth: 32, textAlign: "right" }}>
                    {ev.views}
                  </div>
                </div>
              ))}

              {data.events.filter((e) => e.views > 0).length === 0 && (
                <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: colors.textFaded }}>
                  No events with views yet.
                </div>
              )}
            </div>
          </>
        )}
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

function formatShortDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
