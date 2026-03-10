import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function AnalyticsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pageviews, setPageviews] = useState(null);
  const [pvDays, setPvDays] = useState(30);
  const [pvShowPrevious, setPvShowPrevious] = useState(true);

  useEffect(() => {
    if (!loading && !user) navigate("/");
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    async function fetchAll() {
      setCampaignsLoading(true);
      try {
        const [overviewRes, campaignsRes] = await Promise.all([
          authenticatedFetch("/admin/analytics/overview"),
          authenticatedFetch("/admin/analytics/campaigns"),
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
    fetchAll();
  }, [user]);

  const fetchPageviews = useCallback(async () => {
    try {
      const res = await authenticatedFetch(`/admin/analytics/pageviews?page=landing&days=${pvDays}`);
      if (res.ok) setPageviews(await res.json());
    } catch {}
  }, [pvDays]);

  useEffect(() => {
    if (user) fetchPageviews();
  }, [user, fetchPageviews]);

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
        padding: "0 clamp(12px, 3vw, 24px) 60px",
        background: colors.background,
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "clamp(16px, 3vw, 24px)" }}>
          <h1 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, color: colors.text }}>
            Analytics
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: colors.textSubtle }}>
            Newsletter campaign performance and engagement.
          </p>
        </div>

        {/* Landing Page Views */}
        {pageviews && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <SectionLabel>Landing Page Views</SectionLabel>
              <div style={{ display: "flex", gap: 4 }}>
                {[7, 14, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setPvDays(d)}
                    style={{
                      padding: "3px 10px",
                      borderRadius: "999px",
                      border: pvDays === d ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                      background: pvDays === d ? "rgba(255,255,255,0.1)" : "transparent",
                      color: pvDays === d ? "#fff" : "rgba(255,255,255,0.35)",
                      fontSize: "11px",
                      fontWeight: pvDays === d ? 600 : 400,
                      cursor: "pointer",
                    }}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Stats row */}
            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>
                  {pageviews.totalViews.toLocaleString()}
                </span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>views</span>
                <ChangeIndicator value={pageviews.viewsChange} />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: "24px", fontWeight: 700, color: "rgba(59,130,246,0.9)" }}>
                  {pageviews.totalUnique.toLocaleString()}
                </span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>unique</span>
                <ChangeIndicator value={pageviews.uniqueChange} />
              </div>
              <button
                onClick={() => setPvShowPrevious(!pvShowPrevious)}
                style={{
                  marginLeft: "auto",
                  padding: "3px 10px",
                  borderRadius: "999px",
                  border: pvShowPrevious ? "1px solid rgba(255,255,255,0.15)" : "1px solid transparent",
                  background: pvShowPrevious ? "rgba(255,255,255,0.06)" : "transparent",
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "11px",
                  cursor: "pointer",
                }}
              >
                {pvShowPrevious ? "Hide" : "Show"} previous
              </button>
            </div>

            {/* Chart */}
            <PageviewChart
              current={pageviews.current}
              previous={pvShowPrevious ? pageviews.previous : null}
            />
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
              <OverviewCard label="Avg Open Rate" value={`${overview.avg_open_rate}%`} color="rgba(59,130,246,0.8)" />
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

        {/* Campaign list */}
        <SectionLabel>Campaigns</SectionLabel>
        {campaignsLoading ? (
          <div style={{ fontSize: "13px", opacity: 0.5, textAlign: "center", padding: "40px 0" }}>
            Loading campaigns...
          </div>
        ) : campaigns.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0" }}>
            <div style={{ fontSize: "32px", marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: "14px", color: colors.textSubtle }}>
              No campaigns sent yet. Analytics will appear after your first newsletter send.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {campaigns.map((c) => (
              <div key={c.campaign_tag}>
                {/* Campaign row */}
                <button
                  onClick={() => loadDetail(c.campaign_tag)}
                  style={{
                    width: "100%",
                    padding: "16px",
                    borderRadius: selectedCampaign === c.campaign_tag ? "14px 14px 0 0" : "14px",
                    border: `1px solid ${selectedCampaign === c.campaign_tag ? "rgba(192,192,192,0.2)" : "rgba(255,255,255,0.08)"}`,
                    background: selectedCampaign === c.campaign_tag
                      ? "rgba(192,192,192,0.06)"
                      : "linear-gradient(145deg, rgba(14,12,24,0.97), rgba(20,17,34,0.98))",
                    color: "#fff",
                    cursor: "pointer",
                    textAlign: "left",
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    borderBottom: selectedCampaign === c.campaign_tag ? "none" : undefined,
                  }}
                >
                  {/* Title + date */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600, fontSize: "14px" }}>
                      {formatTag(c.campaign_tag)}
                    </span>
                    <span style={{ fontSize: "11px", color: colors.textFaded }}>
                      {formatDate(c.sent_at)}
                    </span>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: "flex", gap: "clamp(12px, 3vw, 24px)", flexWrap: "wrap" }}>
                    <StatPill label="Sent" value={c.total_sent} />
                    <StatPill label="Opens" value={c.unique_opens} sub={`${c.open_rate}%`} color="rgba(59,130,246,0.8)" />
                    <StatPill label="Clicks" value={c.unique_clicks} sub={`${c.click_rate}%`} color={colors.success} />
                  </div>
                </button>

                {/* Detail panel */}
                {selectedCampaign === c.campaign_tag && (
                  <div
                    style={{
                      padding: "16px",
                      borderRadius: "0 0 14px 14px",
                      border: "1px solid rgba(192,192,192,0.2)",
                      borderTop: "1px solid rgba(255,255,255,0.06)",
                      background: "rgba(192,192,192,0.03)",
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
                          <RateBar label="Open rate" rate={detail.open_rate} color="rgba(59,130,246,0.7)" />
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
                                      background: "rgba(255,255,255,0.03)",
                                      border: "1px solid rgba(255,255,255,0.05)",
                                    }}
                                  >
                                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                      <span style={{
                                        width: 24, height: 24, borderRadius: 7,
                                        background: i === 0 ? colors.gold : i === 1 ? "rgba(192,192,192,0.3)" : "rgba(255,255,255,0.08)",
                                        display: "flex", alignItems: "center", justifyContent: "center",
                                        fontSize: "11px", fontWeight: 700,
                                        color: i === 0 ? "#000" : "#fff",
                                        flexShrink: 0,
                                      }}>
                                        {i + 1}
                                      </span>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                          fontSize: "13px", fontWeight: 600, color: "#fff",
                                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                        }}>
                                          {ev.title}
                                        </div>
                                      </div>
                                      <div style={{ width: 60, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
                                        <div style={{
                                          height: "100%", borderRadius: 3,
                                          background: i === 0 ? colors.gold : colors.success,
                                          width: `${Math.round((ev.total_clicks / maxClicks) * 100)}%`,
                                        }} />
                                      </div>
                                      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 50 }}>
                                        <div style={{ fontSize: "14px", fontWeight: 700, color: i === 0 ? colors.gold : "#fff" }}>
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
                                            background: l.label === "spotify" ? "rgba(30,215,96,0.8)" : colors.success,
                                            flexShrink: 0,
                                          }} />
                                          <span style={{ fontSize: "11px", color: colors.textFaded }}>
                                            {formatLinkLabel(l.label)}
                                          </span>
                                          <span style={{ fontSize: "11px", fontWeight: 600, color: l.label === "spotify" ? "rgba(30,215,96,0.8)" : "rgba(255,255,255,0.6)" }}>
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
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.05)",
                                  }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <div style={{
                                      width: 6, height: 6, borderRadius: "50%",
                                      background: r.clicked ? colors.success : r.opened ? "rgba(59,130,246,0.7)" : "rgba(255,255,255,0.15)",
                                      flexShrink: 0,
                                    }} />
                                    <div style={{ flex: 1, fontSize: "12px", color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                      {r.email}
                                    </div>
                                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                                      {r.opened && (
                                        <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: 4, background: "rgba(59,130,246,0.15)", color: "rgba(59,130,246,0.8)" }}>
                                          opened
                                        </span>
                                      )}
                                      {r.clicked && (
                                        <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: 4, background: "rgba(74,222,128,0.12)", color: colors.success }}>
                                          clicked
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {r.clicks.length > 0 && (
                                    <div style={{ marginTop: 4, marginLeft: 14, display: "flex", flexDirection: "column", gap: 2 }}>
                                      {r.clicks.map((c, ci) => (
                                        <div key={ci} style={{ fontSize: "11px", color: colors.textFaded, display: "flex", gap: 6 }}>
                                          <span style={{ color: "rgba(255,255,255,0.4)" }}>
                                            {c.event_title || truncateUrl(c.link_url)}
                                          </span>
                                          <span style={{ color: c.link_label === "spotify" ? "rgba(30,215,96,0.7)" : "rgba(255,255,255,0.25)" }}>
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
      </div>
    </div>
  );
}

function OverviewCard({ label, value, color }) {
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

function StatPill({ label, value, sub, color }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span style={{ fontSize: "16px", fontWeight: 600, color: color || "#fff" }}>
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
        <span style={{ fontSize: "11px", color: colors.textFaded }}>{label}</span>
        <span style={{ fontSize: "12px", fontWeight: 600, color }}>{rate}%</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)" }}>
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
      background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      overflow: "hidden",
    }}>
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
          }}
        >
          <span style={{
            width: 22, height: 22, borderRadius: 6,
            background: i === 0 ? colors.gold : i === 1 ? "rgba(192,192,192,0.3)" : i === 2 ? "rgba(205,127,50,0.3)" : "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "11px", fontWeight: 700,
            color: i === 0 ? "#000" : "#fff",
            flexShrink: 0,
          }}>
            {i + 1}
          </span>
          <div style={{
            flex: 1, minWidth: 0, fontSize: "12px", fontWeight: 500, color: "#fff",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {item.title}
          </div>
          <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
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
  const color = isUp ? "#4ade80" : isDown ? "#f87171" : "rgba(255,255,255,0.3)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: "11px", fontWeight: 600, color }}>
      <Icon size={12} />
      {Math.abs(value)}%
    </span>
  );
}

function PageviewChart({ current, previous }) {
  if (!current || current.length === 0) return null;

  const W = 720;
  const H = 160;
  const PAD = { top: 10, right: 8, bottom: 24, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allValues = [
    ...current.map((d) => d.views),
    ...(previous || []).map((d) => d.views),
  ];
  const maxVal = Math.max(...allValues, 1);
  // Round up to nice number
  const niceMax = Math.ceil(maxVal / (maxVal > 20 ? 10 : maxVal > 5 ? 5 : 1)) * (maxVal > 20 ? 10 : maxVal > 5 ? 5 : 1);

  function toPath(data) {
    if (!data.length) return "";
    return data
      .map((d, i) => {
        const x = PAD.left + (i / (data.length - 1 || 1)) * chartW;
        const y = PAD.top + chartH - (d.views / niceMax) * chartH;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }

  function toArea(data) {
    if (!data.length) return "";
    const line = data.map((d, i) => {
      const x = PAD.left + (i / (data.length - 1 || 1)) * chartW;
      const y = PAD.top + chartH - (d.views / niceMax) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const bottom = `${(PAD.left + chartW).toFixed(1)},${(PAD.top + chartH).toFixed(1)} ${PAD.left.toFixed(1)},${(PAD.top + chartH).toFixed(1)}`;
    return `M${line.join(" L")} L${bottom} Z`;
  }

  // Y-axis labels
  const yTicks = [0, Math.round(niceMax / 2), niceMax];

  // X-axis labels (show ~5-7 dates)
  const step = Math.max(1, Math.floor(current.length / 6));
  const xLabels = current.filter((_, i) => i % step === 0 || i === current.length - 1);

  // Tooltip state
  const [hover, setHover] = useState(null);

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
        {/* Grid lines */}
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
        {xLabels.map((d) => {
          const i = current.indexOf(d);
          const x = PAD.left + (i / (current.length - 1 || 1)) * chartW;
          const label = new Date(d.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          return (
            <text
              key={d.date} x={x} y={H - 4}
              textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10"
            >
              {label}
            </text>
          );
        })}

        {/* Previous period area + line */}
        {previous && (
          <>
            <path d={toArea(previous)} fill="rgba(255,255,255,0.03)" />
            <path d={toPath(previous)} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" strokeDasharray="4,3" />
          </>
        )}

        {/* Current period area + line */}
        <path d={toArea(current)} fill="rgba(59,130,246,0.08)" />
        <path d={toPath(current)} fill="none" stroke="rgba(59,130,246,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Hover detection zones */}
        {current.map((d, i) => {
          const x = PAD.left + (i / (current.length - 1 || 1)) * chartW;
          const y = PAD.top + chartH - (d.views / niceMax) * chartH;
          const prevY = previous ? PAD.top + chartH - (previous[i]?.views / niceMax) * chartH : null;
          return (
            <g key={i} onMouseEnter={() => setHover({ i, x, y, d, prev: previous?.[i] })}>
              <rect
                x={x - chartW / current.length / 2} y={PAD.top}
                width={chartW / current.length} height={chartH}
                fill="transparent" style={{ cursor: "crosshair" }}
              />
              {hover?.i === i && (
                <>
                  <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + chartH} stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
                  <circle cx={x} cy={y} r="4" fill="rgba(59,130,246,0.9)" stroke="#fff" strokeWidth="1.5" />
                  {previous && prevY != null && (
                    <circle cx={x} cy={prevY} r="3" fill="rgba(255,255,255,0.4)" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
                  )}
                </>
              )}
            </g>
          );
        })}

      </svg>

      {/* Tooltip - positioned as DOM element outside SVG */}
      {hover && (
        <div
          style={{
            position: "absolute",
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: `translate(${hover.x > W * 0.75 ? "calc(-100% - 12px)" : "12px"}, -50%)`,
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
          <div style={{ color: "rgba(59,130,246,0.9)" }}>
            {hover.d.views} views / {hover.d.unique_visitors} unique
          </div>
          {hover.prev && (
            <div style={{ color: "rgba(255,255,255,0.4)" }}>
              prev: {hover.prev.views} views
            </div>
          )}
        </div>
      )}
    </div>
  );
}
