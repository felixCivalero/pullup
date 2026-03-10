// Host-side event card (Home dashboard)
import { useState } from "react";
import { FaInstagram, FaTiktok, FaFacebookF, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { Users, Link2, Check, Link as LinkIcon, Share } from "lucide-react";
import { getEventShareUrl } from "../lib/urlUtils";
import { formatReadableDateTime } from "../lib/dateUtils.js";
import { useToast } from "./Toast";
import { EventHostsSection } from "./EventHostsSection";
import { VipInviteSection } from "./VipInviteSection";
import { colors } from "../theme/colors.js";

export function getEventStatus(event) {
  const now = new Date();
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;

  if (end && now > end) return "past";
  if (now >= start && (!end || now <= end)) return "ongoing";
  return "upcoming";
}

const shareChannels = [
  { key: "instagram", icon: FaInstagram, color: "rgba(225,48,108,0.8)" },
  { key: "tiktok", icon: FaTiktok, color: "rgba(255,255,255,0.7)" },
  { key: "facebook", icon: FaFacebookF, color: "rgba(66,103,178,0.8)" },
  { key: "twitter", icon: FaXTwitter, color: "rgba(255,255,255,0.7)" },
  { key: "linkedin", icon: FaLinkedinIn, color: "rgba(10,102,194,0.8)" },
  { key: "direct", icon: LinkIcon, color: "rgba(255,255,255,0.4)" },
];

export function DashboardEventCard({ event, onPreview, onManage }) {
  const status = getEventStatus(event);
  const isLive = status === "ongoing";
  const [showTeam, setShowTeam] = useState(false);
  const [showVip, setShowVip] = useState(false);
  const { showToast } = useToast();

  const canManageHosts = event.myRole === "owner" || event.myRole === "admin";

  const [copiedSource, setCopiedSource] = useState(null);

  const baseShareUrl = getEventShareUrl(event.slug);

  function copyLink(source) {
    let url = baseShareUrl;
    if (source !== "direct") {
      const u = new URL(baseShareUrl);
      u.searchParams.set("utm_source", source);
      u.searchParams.set("utm_medium", "social");
      u.searchParams.set("utm_campaign", event.slug);
      url = u.toString();
    }
    navigator.clipboard.writeText(url);
    setCopiedSource(source);
    showToast("Link copied!");
    setTimeout(() => setCopiedSource(null), 2000);
  }

  return (
    <>
      <style>{`
        .dashboard-card {
          display: flex;
          flex-direction: column;
        }
        .dashboard-card-thumb {
          width: 100%;
          aspect-ratio: 16/9;
          max-height: 160px;
        }
        @media (min-width: 768px) {
          .dashboard-card {
            flex-direction: row;
            align-items: center;
            gap: 20px;
          }
          .dashboard-card-thumb {
            width: 120px;
            height: 80px;
            aspect-ratio: auto;
            max-height: none;
            flex-shrink: 0;
          }
        }
      `}</style>
      <div
        style={{
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,0.05)",
          background: "rgba(20, 16, 30, 0.6)",
          transition: "all 0.3s ease",
          overflow: "hidden",
        }}
      >
        <div
          className="dashboard-card"
          style={{
            padding: "16px",
            cursor: "pointer",
            position: "relative",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.02)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
          }}
          onClick={onManage}
        >
          {/* Thumbnail */}
          {(event.coverImageUrl || event.imageUrl) && (
            <div
              className="dashboard-card-thumb"
              style={{
                borderRadius: "10px",
                overflow: "hidden",
                background: "rgba(0,0,0,0.2)",
                marginBottom: event.imageUrl ? undefined : 0,
              }}
            >
              <img
                src={event.coverImageUrl || event.imageUrl}
                alt={event.title}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            </div>
          )}

          {/* Info + actions */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Title row */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "17px", fontWeight: 600,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {event.title}
                </div>
                <div style={{ fontSize: "13px", opacity: 0.5, marginTop: "2px" }}>
                  {formatReadableDateTime(event.startsAt, event.timezone)}
                </div>
              </div>

              {isLive && (
                <div style={{
                  padding: "3px 10px", borderRadius: "10px",
                  background: "rgba(34, 197, 94, 0.25)", fontSize: "10px",
                  fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                  whiteSpace: "nowrap", color: "#bbf7d0", flexShrink: 0,
                }}>
                  Live
                </div>
              )}

              {/* Stats */}
              {event._stats && (
                <div style={{
                  whiteSpace: "nowrap", flexShrink: 0,
                  display: "flex", alignItems: "center", gap: "12px",
                }}>
                  {event._stats.views > 0 && (
                    <div style={{ textAlign: "center" }}>
                      <div style={{ fontSize: "9px", opacity: 0.3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Views</div>
                      <div style={{ fontSize: "13px", opacity: 0.5, fontWeight: 600 }}>{event._stats.views}</div>
                    </div>
                  )}
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "9px", opacity: 0.3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>RSVPs</div>
                    <div style={{ fontSize: "13px", opacity: 0.5, fontWeight: 600 }}>
                      {event._stats.confirmed}{event._stats.totalCapacity != null && <span style={{ opacity: 0.6 }}> / {event._stats.totalCapacity}</span>}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(
                    `${window.location.origin}${onPreview}`,
                    "_blank",
                    "noopener,noreferrer"
                  );
                }}
                style={{
                  padding: "6px 14px", borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)", color: "#fff",
                  fontWeight: 500, fontSize: "12px", cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "rgba(255,255,255,0.05)";
                }}
              >
                Live
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onManage();
                }}
                style={{
                  padding: "6px 14px", borderRadius: "999px", border: "none",
                  background: "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
                  color: "#fff", fontWeight: 600, fontSize: "12px",
                  cursor: "pointer", transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = "translateY(-1px)";
                  e.target.style.boxShadow = "0 6px 16px rgba(192, 192, 192, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow = "none";
                }}
              >
                Manage
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowTeam(!showTeam);
                }}
                style={{
                  padding: "6px 14px", borderRadius: "999px",
                  border: showTeam
                    ? "1px solid rgba(139,92,246,0.5)"
                    : "1px solid rgba(255,255,255,0.15)",
                  background: showTeam
                    ? "rgba(139,92,246,0.15)"
                    : "rgba(255,255,255,0.05)",
                  color: "#fff",
                  fontWeight: 500, fontSize: "12px", cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex", alignItems: "center", gap: "5px",
                }}
                onMouseEnter={(e) => {
                  if (!showTeam) e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  if (!showTeam) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }}
                title="Manage team"
              >
                <Users size={12} />
                <span>Team</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowVip(!showVip);
                }}
                style={{
                  padding: "6px 14px", borderRadius: "999px",
                  border: showVip
                    ? "1px solid " + colors.goldRgba
                    : "1px solid rgba(255,255,255,0.15)",
                  background: showVip
                    ? "rgba(245, 158, 11, 0.15)"
                    : "rgba(255,255,255,0.05)",
                  color: showVip ? colors.gold : "#fff",
                  fontWeight: 500, fontSize: "12px", cursor: "pointer",
                  transition: "all 0.2s ease",
                  display: "flex", alignItems: "center", gap: "5px",
                }}
                onMouseEnter={(e) => {
                  if (!showVip) e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  if (!showVip) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }}
                title="VIP invites"
              >
                <Link2 size={12} />
                <span>VIP</span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  const shareUrl = getEventShareUrl(event.slug);
                  if (navigator.share) {
                    navigator.share({ url: shareUrl, title: event.title }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(shareUrl);
                    showToast("Link copied!");
                  }
                }}
                style={{
                  padding: "6px 10px", borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)", color: "#fff",
                  cursor: "pointer", transition: "all 0.2s ease",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }}
                title="Share event"
              >
                <Share size={12} />
              </button>
            </div>

            {/* Tracking links — always visible */}
            <div onClick={(e) => e.stopPropagation()}>
              <div style={{
                fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.08em",
                fontWeight: 600, opacity: 0.3, marginBottom: 6,
              }}>
                Tracking links
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {shareChannels.map((ch) => {
                  const Icon = ch.icon;
                  const isCopied = copiedSource === ch.key;
                  return (
                    <button
                      key={ch.key}
                      onClick={() => copyLink(ch.key)}
                      title={`Copy ${ch.key === "direct" ? "plain" : ch.key} link`}
                      style={{
                        width: 32, height: 32,
                        borderRadius: "8px",
                        border: "1px solid " + (isCopied ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.08)"),
                        background: isCopied ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.03)",
                        color: isCopied ? colors.success : ch.color,
                        cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.15s",
                        padding: 0,
                      }}
                      onMouseEnter={(e) => {
                        if (!isCopied) {
                          e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCopied) {
                          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                        }
                      }}
                    >
                      {isCopied ? <Check size={14} /> : <Icon size={14} />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Expandable team panel */}
        {showTeam && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: "0 16px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div style={{
              paddingTop: "12px",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 600,
              opacity: 0.5,
              marginBottom: "10px",
            }}>
              Arrangers
            </div>
            <EventHostsSection
              eventId={event.id}
              canManageHosts={canManageHosts}
              compact
            />
          </div>
        )}

        {/* Expandable VIP panel */}
        {showVip && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: "0 16px 16px",
              borderTop: "1px solid rgba(245, 158, 11, 0.12)",
            }}
          >
            <div style={{
              paddingTop: "12px",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 600,
              color: colors.gold,
              opacity: 0.7,
              marginBottom: "10px",
            }}>
              VIP Invites
            </div>
            <VipInviteSection
              event={event}
              showToast={showToast}
              compact
            />
          </div>
        )}
      </div>
    </>
  );
}
