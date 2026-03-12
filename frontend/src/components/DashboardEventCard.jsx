// Host-side event card (Home dashboard)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaInstagram, FaTiktok, FaFacebookF, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { Users, Link2, Check, Link as LinkIcon, Share, ChevronRight, Megaphone } from "lucide-react";
import { getEventShareUrl } from "../lib/urlUtils";
import { formatReadableDateTime } from "../lib/dateUtils.js";
import { useToast } from "./Toast";
import { EventHostsSection } from "./EventHostsSection";
import { VipInviteSection } from "./VipInviteSection";
import { colors } from "../theme/colors.js";

const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours

export function getEventStatus(event) {
  const now = new Date();
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);

  if (now > end) return "past";
  if (now >= start && now <= end) return "ongoing";
  return "upcoming";
}

const shareChannels = [
  { key: "instagram", icon: FaInstagram, color: "rgba(225,48,108,0.8)", label: "Instagram" },
  { key: "tiktok", icon: FaTiktok, color: "rgba(255,255,255,0.7)", label: "TikTok" },
  { key: "facebook", icon: FaFacebookF, color: "rgba(66,103,178,0.8)", label: "Facebook" },
  { key: "twitter", icon: FaXTwitter, color: "rgba(255,255,255,0.7)", label: "X" },
  { key: "linkedin", icon: FaLinkedinIn, color: "rgba(10,102,194,0.8)", label: "LinkedIn" },
  { key: "direct", icon: LinkIcon, color: "rgba(255,255,255,0.4)", label: "Direct link" },
];

export function DashboardEventCard({ event, onPreview, onManage, index = 0 }) {
  const status = getEventStatus(event);
  const isLive = status === "ongoing";
  const navigate = useNavigate();
  const [showTeam, setShowTeam] = useState(false);
  const [showVip, setShowVip] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const { showToast } = useToast();

  const canManageHosts = event.myRole === "owner" || event.myRole === "admin";

  const [copiedSource, setCopiedSource] = useState(null);

  const baseShareUrl = getEventShareUrl(event.slug);

  const isEven = index % 2 === 0;

  const hasViews = event._stats && event._stats.views > 0;
  const hasRsvps = event._stats && event._stats.confirmed > 0;
  const noTraction = event._stats && !hasViews && !hasRsvps;

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
        .dashboard-card-chevron {
          opacity: 0;
          transition: opacity 0.2s ease, transform 0.2s ease;
          transform: translateX(-4px);
        }
        .dashboard-card:hover .dashboard-card-chevron {
          opacity: 0.4;
          transform: translateX(0);
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
          background: isEven ? "rgba(20, 16, 30, 0.6)" : "rgba(28, 22, 42, 0.6)",
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

              {/* Stats - clickable */}
              {event._stats && (
                <div style={{
                  whiteSpace: "nowrap", flexShrink: 0,
                  display: "flex", alignItems: "center", gap: "12px",
                }}>
                  {hasViews && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/app/events/${event.id}/analytics`);
                      }}
                      style={{
                        textAlign: "center", cursor: "pointer",
                        padding: "4px 8px", borderRadius: "8px",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      title="View analytics"
                    >
                      <div style={{ fontSize: "9px", opacity: 0.3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Views</div>
                      <div style={{ fontSize: "13px", opacity: 0.5, fontWeight: 600 }}>{event._stats.views}</div>
                    </div>
                  )}
                  {hasRsvps && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/app/events/${event.id}/guests`);
                      }}
                      style={{
                        textAlign: "center", cursor: "pointer",
                        padding: "4px 8px", borderRadius: "8px",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      title="View guest list"
                    >
                      <div style={{ fontSize: "9px", opacity: 0.3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>RSVPs</div>
                      <div style={{ fontSize: "13px", opacity: 0.5, fontWeight: 600 }}>
                        {event._stats.confirmed}{event._stats.totalCapacity != null && <span style={{ opacity: 0.6 }}> / {event._stats.totalCapacity}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chevron indicating clickability */}
              <div className="dashboard-card-chevron" style={{ flexShrink: 0 }}>
                <ChevronRight size={16} style={{ opacity: 0.5 }} />
              </div>
            </div>

            {/* Action buttons - grouped: primary | secondary tools */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
              {/* Primary action */}
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

              {/* Subtle separator */}
              <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.08)", margin: "0 2px" }} />

              {/* Secondary tools — unified style */}
              {[
                { key: "team", label: "Team", icon: <Users size={12} />, isOpen: showTeam, toggle: () => { setShowTeam(!showTeam); if (!showTeam) { setShowVip(false); setShowShare(false); } } },
                { key: "vip", label: "VIP", icon: <Link2 size={12} />, isOpen: showVip, toggle: () => { setShowVip(!showVip); if (!showVip) { setShowTeam(false); setShowShare(false); } } },
                { key: "share", label: "Share & Track", icon: <Share size={12} />, isOpen: showShare, toggle: () => { setShowShare(!showShare); if (!showShare) { setShowTeam(false); setShowVip(false); } } },
              ].map((btn) => (
                <button
                  key={btn.key}
                  onClick={(e) => { e.stopPropagation(); btn.toggle(); }}
                  style={{
                    padding: "6px 14px", borderRadius: "999px",
                    border: btn.isOpen
                      ? "1px solid rgba(255,255,255,0.3)"
                      : "1px solid rgba(255,255,255,0.15)",
                    background: btn.isOpen
                      ? "rgba(255,255,255,0.1)"
                      : "rgba(255,255,255,0.05)",
                    color: "#fff",
                    fontWeight: 500, fontSize: "12px", cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex", alignItems: "center", gap: "5px",
                  }}
                  onMouseEnter={(e) => {
                    if (!btn.isOpen) e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    if (!btn.isOpen) e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                  }}
                  title={btn.label}
                >
                  {btn.icon}
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>

            {/* Empty state nudge - only for upcoming events with no traction */}
            {noTraction && status === "upcoming" && (
              <div
                onClick={(e) => {
                  e.stopPropagation();
                  setShowShare(true);
                  setShowTeam(false);
                  setShowVip(false);
                }}
                style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  padding: "8px 12px", borderRadius: "10px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px dashed rgba(255,255,255,0.1)",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                }}
              >
                <Megaphone size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                <span style={{ fontSize: "12px", opacity: 0.45 }}>
                  Share your event to start driving traffic
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Expandable panels — unified styling */}
        {(showTeam || showVip || showShare) && (
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
              marginBottom: showShare ? "4px" : "10px",
            }}>
              {showTeam && "Team"}
              {showVip && "VIP Invites"}
              {showShare && "Share & Track"}
            </div>

            {showShare && (
              <div style={{
                fontSize: "11px",
                opacity: 0.3,
                marginBottom: "10px",
              }}>
                Add these to your stories, bios, and posts — then check this event's Analytics to see which channels drive the most traffic
              </div>
            )}

            {showTeam && (
              <EventHostsSection
                eventId={event.id}
                canManageHosts={canManageHosts}
                compact
              />
            )}

            {showVip && (
              <VipInviteSection
                event={event}
                showToast={showToast}
                compact
              />
            )}

            {showShare && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {shareChannels.map((ch) => {
                  const Icon = ch.icon;
                  const isCopied = copiedSource === ch.key;
                  return (
                    <button
                      key={ch.key}
                      onClick={() => copyLink(ch.key)}
                      title={`Copy ${ch.label} link`}
                      style={{
                        display: "flex", alignItems: "center", gap: "6px",
                        padding: "6px 12px",
                        borderRadius: "8px",
                        border: "1px solid " + (isCopied ? "rgba(74,222,128,0.3)" : "rgba(255,255,255,0.08)"),
                        background: isCopied ? "rgba(74,222,128,0.1)" : "rgba(255,255,255,0.03)",
                        color: isCopied ? colors.success : ch.color,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        fontSize: "12px",
                        fontWeight: 500,
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
                      <span style={{ color: isCopied ? colors.success : "rgba(255,255,255,0.6)" }}>
                        {isCopied ? "Copied!" : ch.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
