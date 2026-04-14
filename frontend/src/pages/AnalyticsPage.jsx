import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { TrendingUp, TrendingDown, Minus, Monitor, Smartphone } from "lucide-react";

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
  const [partnerClicks, setPartnerClicks] = useState(null);

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

  useEffect(() => {
    if (!user) return;
    authenticatedFetch("/admin/analytics/partner-clicks?days=90")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setPartnerClicks(d); })
      .catch(() => {});
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
        padding: "72px clamp(12px, 3vw, 24px) 60px",
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
              <SectionLabel>Landing Page — pullup.se</SectionLabel>
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
            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: "24px", fontWeight: 700, color: "#fff" }}>
                  {pageviews.totalViews.toLocaleString()}
                </span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>views</span>
                <ChangeIndicator value={pageviews.viewsChange} />
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: "24px", fontWeight: 700, color: "rgba(59,130,246,0.9)" }}>
                  {pageviews.uniqueVisitors.toLocaleString()}
                </span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>unique</span>
                <ChangeIndicator value={pageviews.uniqueChange} />
              </div>
              {pageviews.device_split && (pageviews.device_split.mobile > 0 || pageviews.device_split.desktop > 0) && (
                <DeviceDonut mobile={pageviews.device_split.mobile} desktop={pageviews.device_split.desktop} />
              )}
            </div>

            {/* Stacked bar chart */}
            {pageviews.daily && pageviews.daily.length > 0 && (
              <LandingDailyChart
                daily={pageviews.daily}
                allSources={[...new Set((pageviews.sources || []).map(s => s.source))]}
              />
            )}

            {/* Source breakdown */}
            {pageviews.sources && pageviews.sources.length > 0 && (
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 4 }}>
                {pageviews.sources.map((s) => (
                  <div key={s.source} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 10px", borderRadius: 8,
                    background: "rgba(255,255,255,0.02)",
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: 2, background: getLandingSourceColor(s.source), flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.6)", flex: 1 }}>{s.source}</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: "#fff" }}>{s.count}</span>
                    <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.3)", minWidth: 36, textAlign: "right" }}>{s.percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Partner CTA Clicks */}
        {partnerClicks && partnerClicks.totalClicks > 0 && (
          <div style={{ marginBottom: 24 }}>
            <SectionLabel>Partner Clicks</SectionLabel>
            <div style={{
              borderRadius: 14,
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              padding: "16px",
            }}>
              {/* Partner rows */}
              {partnerClicks.partners.map((p, i) => (
                <div key={p.slug} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "8px 0",
                  borderBottom: i < partnerClicks.partners.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff", textTransform: "capitalize", minWidth: 100 }}>
                    {p.slug}
                  </span>
                  {/* Mini bar */}
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      width: `${Math.min(100, (p.total / Math.max(...partnerClicks.partners.map(x => x.total))) * 100)}%`,
                      background: "linear-gradient(90deg, rgba(251,191,36,0.5), rgba(251,191,36,0.25))",
                    }} />
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 700, color: "#fff", minWidth: 28, textAlign: "right" }}>{p.total}</span>
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", minWidth: 50 }}>{p.unique} uniq</span>
                </div>
              ))}

              {/* Top events */}
              {partnerClicks.topEvents && partnerClicks.topEvents.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    By event
                  </div>
                  {partnerClicks.topEvents.map((ev) => (
                    <div key={ev.id} style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "4px 0",
                    }}>
                      <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.45)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.title}
                      </span>
                      {Object.entries(ev.byPartner).map(([partner, count]) => (
                        <span key={partner} style={{ fontSize: "11px", color: "rgba(255,255,255,0.25)", textTransform: "capitalize" }}>
                          {partner} {count}
                        </span>
                      ))}
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

const LANDING_SOURCE_COLORS = {
  direct: "rgba(255,255,255,0.35)",
  instagram: "rgba(225,48,108,0.75)",
  facebook: "rgba(66,103,178,0.75)",
  twitter: "rgba(29,155,240,0.75)",
  linkedin: "rgba(10,102,194,0.75)",
  google: "rgba(66,133,244,0.75)",
  pullup: "rgba(192,192,192,0.6)",
  other: "rgba(168,85,247,0.5)",
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
          stroke="rgba(59,130,246,0.6)" strokeWidth={stroke}
          strokeDasharray={`${desktopArc} ${circ}`}
          strokeDashoffset={0}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Mobile arc */}
        <circle cx={cx} cy={cy} r={r} fill="none"
          stroke="rgba(16,185,129,0.7)" strokeWidth={stroke}
          strokeDasharray={`${mobileArc} ${circ}`}
          strokeDashoffset={-desktopArc}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "11px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.5)" }}>
          <Smartphone size={11} style={{ color: "rgba(16,185,129,0.7)" }} />
          {mobile} <span style={{ color: "rgba(255,255,255,0.25)" }}>({Math.round(mobileP * 100)}%)</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.5)" }}>
          <Monitor size={11} style={{ color: "rgba(59,130,246,0.6)" }} />
          {desktop} <span style={{ color: "rgba(255,255,255,0.25)" }}>({Math.round((1 - mobileP) * 100)}%)</span>
        </span>
      </div>
    </div>
  );
}

function LandingDailyChart({ daily, allSources }) {
  const [hoverDay, setHoverDay] = useState(null);

  const maxDailyViews = Math.max(...daily.map(d => d.views), 1);
  const step = Math.max(1, Math.floor(daily.length / 7));
  const xLabels = daily.map((_, i) => i).filter(i => i % step === 0 || i === daily.length - 1);

  const W = 720, H = 160;
  const PAD = { top: 10, right: 8, bottom: 24, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const niceMax = Math.ceil(maxDailyViews / (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1)) * (maxDailyViews > 20 ? 10 : maxDailyViews > 5 ? 5 : 1) || 1;
  const barWidth = Math.max(3, (chartW / daily.length) * 0.7);

  return (
    <div style={{
      borderRadius: 14, background: "rgba(255,255,255,0.02)",
      border: "1px solid rgba(255,255,255,0.06)",
      padding: "14px 12px 8px", position: "relative",
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
                stroke="rgba(255,255,255,0.06)" strokeDasharray="4,4" />
              <text x={PAD.left - 6} y={y + 3} textAnchor="end" fill="rgba(255,255,255,0.3)" fontSize="10">{val}</text>
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

        {/* Hover line */}
        {hoverDay !== null && (
          <line
            x1={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
            y1={PAD.top}
            x2={PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW}
            y2={PAD.top + chartH}
            stroke="rgba(255,255,255,0.15)" strokeWidth="1"
          />
        )}

        {/* X-axis labels */}
        {xLabels.map(i => {
          const x = PAD.left + (i / (daily.length - 1 || 1)) * chartW;
          const label = new Date(daily[i].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
          return <text key={i} x={x} y={H - 4} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="10">{label}</text>;
        })}
      </svg>

      {/* Tooltip */}
      {hoverDay !== null && daily[hoverDay] && (
        <div style={{
          position: "absolute",
          left: `${((PAD.left + (hoverDay / (daily.length - 1 || 1)) * chartW) / W) * 100}%`,
          top: 12,
          transform: `translateX(${hoverDay > daily.length * 0.65 ? "calc(-100% - 10px)" : "10px"})`,
          background: "rgba(15,12,25,0.95)", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8, padding: "8px 12px", fontSize: "12px", color: "#fff",
          lineHeight: 1.6, backdropFilter: "blur(12px)", pointerEvents: "none", zIndex: 10, whiteSpace: "nowrap",
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {new Date(daily[hoverDay].date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </div>
          <div style={{ color: "rgba(255,255,255,0.5)" }}>{daily[hoverDay].views} unique visitors</div>
          {Object.entries(daily[hoverDay].bySource || {}).sort((a, b) => b[1] - a[1]).map(([src, count]) => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
              <div style={{ width: 5, height: 5, borderRadius: 1, background: getLandingSourceColor(src), flexShrink: 0 }} />
              <span style={{ color: "rgba(255,255,255,0.4)" }}>{src}: {count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      {allSources.length > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8, paddingLeft: PAD.left }}>
          {allSources.map(src => (
            <div key={src} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "10px", color: "rgba(255,255,255,0.35)" }}>
              <div style={{ width: 7, height: 7, borderRadius: 1.5, background: getLandingSourceColor(src) }} />
              {src}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
