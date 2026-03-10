import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

export function AnalyticsPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [overview, setOverview] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

        {/* Overview stats */}
        {overview && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 24 }}>
              <OverviewCard label="Campaigns" value={overview.total_campaigns} />
              <OverviewCard label="Emails Sent" value={overview.total_sent} />
              <OverviewCard label="Avg Open Rate" value={`${overview.avg_open_rate}%`} color="rgba(59,130,246,0.8)" />
              <OverviewCard label="Avg Click Rate" value={`${overview.avg_click_rate}%`} color={colors.success} />
            </div>

            {/* Top clicked events in newsletters */}
            {overview.top_clicked_links.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <SectionLabel>Most Clicked in Newsletters</SectionLabel>
                <div style={{
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}>
                  {overview.top_clicked_links.map((link, i) => {
                    const maxClicks = overview.top_clicked_links[0].clicks;
                    return (
                      <div
                        key={i}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "10px 14px",
                          borderBottom: i < overview.top_clicked_links.length - 1
                            ? "1px solid rgba(255,255,255,0.04)"
                            : "none",
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
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: "12px", fontWeight: 500, color: "#fff",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {formatLinkLabel(link.link_label)}
                          </div>
                          <div style={{
                            fontSize: "11px", color: colors.textFaded,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {truncateUrl(link.link_url)}
                          </div>
                        </div>
                        <div style={{ width: 60, height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
                          <div style={{
                            height: "100%", borderRadius: 2,
                            background: colors.success,
                            width: `${Math.round((link.clicks / maxClicks) * 100)}%`,
                          }} />
                        </div>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: colors.success, minWidth: 32, textAlign: "right" }}>
                          {link.clicks}
                        </div>
                      </div>
                    );
                  })}
                </div>
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

                        {/* Per-event breakdown */}
                        {detail.events_breakdown && detail.events_breakdown.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
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
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 10,
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      background: "rgba(255,255,255,0.03)",
                                      border: "1px solid rgba(255,255,255,0.05)",
                                    }}
                                  >
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
                                      <div style={{ fontSize: "11px", color: colors.textFaded, marginTop: 2 }}>
                                        {ev.links.map((l) => formatLinkLabel(l.label)).join(" · ")}
                                      </div>
                                    </div>
                                    <div style={{ width: 60, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", flexShrink: 0 }}>
                                      <div style={{
                                        height: "100%", borderRadius: 3,
                                        background: i === 0 ? colors.gold : colors.success,
                                        width: `${Math.round((ev.total_clicks / maxClicks) * 100)}%`,
                                      }} />
                                    </div>
                                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 40 }}>
                                      <div style={{ fontSize: "14px", fontWeight: 700, color: i === 0 ? colors.gold : "#fff" }}>
                                        {ev.total_clicks}
                                      </div>
                                      <div style={{ fontSize: "10px", color: colors.textFaded }}>
                                        clicks
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Top clicked links */}
                        {detail.links && detail.links.length > 0 && (
                          <div>
                            <div style={{ fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em", color: colors.textFaded, marginBottom: 8 }}>
                              Top clicked links
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                              {detail.links.slice(0, 10).map((link, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 10,
                                    padding: "8px 10px",
                                    borderRadius: "8px",
                                    background: "rgba(255,255,255,0.03)",
                                    border: "1px solid rgba(255,255,255,0.05)",
                                  }}
                                >
                                  <span style={{
                                    width: 22, height: 22,
                                    borderRadius: "6px",
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
                                      fontSize: "12px", fontWeight: 500, color: "#fff",
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                      {link.event_title || formatLinkLabel(link.link_label)}
                                    </div>
                                    <div style={{
                                      fontSize: "11px", color: colors.textFaded,
                                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                      {link.event_title
                                        ? formatLinkLabel(link.link_label)
                                        : truncateUrl(link.link_url)}
                                    </div>
                                  </div>
                                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                                    <div style={{ fontSize: "13px", fontWeight: 600, color: colors.success }}>
                                      {link.total_clicks}
                                    </div>
                                    <div style={{ fontSize: "10px", color: colors.textFaded }}>
                                      {link.unique_clicks} unique
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {detail.links && detail.links.length === 0 && (
                          <div style={{ fontSize: "12px", color: colors.textFaded, textAlign: "center", padding: "8px 0" }}>
                            No clicks recorded yet.
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

function formatLinkLabel(label) {
  if (!label) return "Link";
  return label
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
