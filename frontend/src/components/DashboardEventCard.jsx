// Host-side event card (Home dashboard)
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaInstagram, FaTiktok, FaFacebookF, FaXTwitter, FaLinkedinIn } from "react-icons/fa6";
import { Users, Link2, Check, Link as LinkIcon, Share, ChevronRight, Megaphone, Trash2 } from "lucide-react";
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
  { key: "instagram", icon: FaInstagram, color: "#ec178f", label: "Instagram" },
  { key: "tiktok", icon: FaTiktok, color: colors.text, label: "TikTok" },
  { key: "facebook", icon: FaFacebookF, color: "#1877f2", label: "Facebook" },
  { key: "twitter", icon: FaXTwitter, color: colors.text, label: "X" },
  { key: "linkedin", icon: FaLinkedinIn, color: "#0a66c2", label: "LinkedIn" },
  { key: "direct", icon: LinkIcon, color: colors.textMuted, label: "Direct link" },
];

export function DashboardEventCard({ event, onPreview, onManage, onDelete, index = 0 }) {
  const status = getEventStatus(event);
  const isLive = status === "ongoing";
  const navigate = useNavigate();
  const [showTeam, setShowTeam] = useState(false);
  const [showVip, setShowVip] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { showToast } = useToast();

  const canManageHosts = event.myRole === "owner" || event.myRole === "admin";

  const [copiedSource, setCopiedSource] = useState(null);

  const baseShareUrl = getEventShareUrl(event.slug);

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
          opacity: 0.35;
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
          border: `1px solid ${colors.border}`,
          background: colors.background,
          boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
          transition: "all 0.3s ease",
          overflow: "hidden",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = "0 12px 36px rgba(10,10,10,0.10)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "0 8px 30px rgba(10,10,10,0.06)";
        }}
      >
        <div
          className="dashboard-card"
          style={{
            padding: "16px",
            cursor: "pointer",
            position: "relative",
            transition: "background 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = colors.surface;
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
                background: colors.surfaceMuted,
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
                  color: colors.text,
                }}>
                  {event.title}
                </div>
                <div style={{ fontSize: "13px", color: colors.secondary, marginTop: "2px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                  <span>{event.hideDate ? "Date TBA" : formatReadableDateTime(event.startsAt, event.timezone)}</span>
                  {event.hideLocation && <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: colors.secondarySoft, color: colors.secondary }}>Location hidden</span>}
                  {event.instantWaitlist && <span style={{ fontSize: "10px", padding: "1px 6px", borderRadius: "4px", background: colors.warningRgba, color: colors.warning }}>Waitlist-only</span>}
                </div>
              </div>

              {isLive && (
                <div style={{
                  padding: "3px 10px", borderRadius: "10px",
                  background: colors.successRgba, fontSize: "10px",
                  fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em",
                  whiteSpace: "nowrap", color: colors.live, flexShrink: 0,
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
                      onMouseEnter={(e) => { e.currentTarget.style.background = colors.surface; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      title="View analytics"
                    >
                      <div style={{ fontSize: "9px", color: colors.textFaded, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Views</div>
                      <div style={{ fontSize: "13px", color: colors.textMuted, fontWeight: 600 }}>{event._stats.views}</div>
                    </div>
                  )}
                  {hasRsvps && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(event.myRole === "analytics" ? `/app/events/${event.id}/analytics` : `/app/events/${event.id}/guests`);
                      }}
                      style={{
                        textAlign: "center", cursor: "pointer",
                        padding: "4px 8px", borderRadius: "8px",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = colors.surface; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      title="View guest list"
                    >
                      <div style={{ fontSize: "9px", color: colors.textFaded, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>RSVPs</div>
                      <div style={{ fontSize: "13px", color: colors.textMuted, fontWeight: 600 }}>
                        {event._stats.confirmed}{event._stats.totalCapacity != null && <span style={{ color: colors.textSubtle }}> / {event._stats.totalCapacity}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Chevron indicating clickability */}
              <div className="dashboard-card-chevron" style={{ flexShrink: 0 }}>
                <ChevronRight size={16} style={{ color: colors.textSubtle }} />
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
              {/* Primary action */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onManage();
                }}
                style={{
                  padding: "6px 14px", borderRadius: "999px", border: "none",
                  background: colors.accent,
                  color: "#fff", fontWeight: 600, fontSize: "12px",
                  cursor: "pointer", transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.accentHover;
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.accent;
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {event.myRole === "analytics" ? "Analytics" : "Manage"}
              </button>

              {event.myRole !== "analytics" && (
              <>
              {/* Subtle separator */}
              <div style={{ width: "1px", height: "16px", background: colors.border, margin: "0 2px" }} />

              {/* Secondary tools */}
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
                      ? `1px solid ${colors.borderStrong}`
                      : `1px solid ${colors.border}`,
                    background: btn.isOpen
                      ? colors.surfaceMuted
                      : colors.surface,
                    color: btn.isOpen ? colors.text : colors.textMuted,
                    fontWeight: 500, fontSize: "12px", cursor: "pointer",
                    transition: "all 0.2s ease",
                    display: "flex", alignItems: "center", gap: "5px",
                  }}
                  onMouseEnter={(e) => {
                    if (!btn.isOpen) {
                      e.currentTarget.style.background = colors.surfaceMuted;
                      e.currentTarget.style.color = colors.text;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!btn.isOpen) {
                      e.currentTarget.style.background = colors.surface;
                      e.currentTarget.style.color = colors.textMuted;
                    }
                  }}
                  title={btn.label}
                >
                  {btn.icon}
                  <span>{btn.label}</span>
                </button>
              ))}
              </>
              )}

              {/* Delete — owner only */}
              {event.myRole === "owner" && onDelete && (
                <>
                  <div style={{ width: "1px", height: "16px", background: colors.border, margin: "0 2px" }} />
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }}
                    style={{
                      padding: "6px 8px", borderRadius: "999px",
                      border: `1px solid ${colors.dangerRgba}`,
                      background: colors.dangerRgba,
                      color: colors.danger,
                      cursor: "pointer",
                      transition: "all 0.2s ease",
                      display: "flex", alignItems: "center",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.15)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = colors.dangerRgba; }}
                    title="Delete event"
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>

            {/* Empty state nudge */}
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
                  background: colors.surface,
                  border: `1px dashed ${colors.border}`,
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.surfaceMuted;
                  e.currentTarget.style.borderColor = colors.borderStrong;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.surface;
                  e.currentTarget.style.borderColor = colors.border;
                }}
              >
                <Megaphone size={14} style={{ color: colors.textSubtle, flexShrink: 0 }} />
                <span style={{ fontSize: "12px", color: colors.textSubtle }}>
                  Share your event to start driving traffic
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Expandable panels */}
        {(showTeam || showVip || showShare) && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              padding: "0 16px 16px",
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            <div style={{
              paddingTop: "12px",
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontWeight: 600,
              color: colors.textSubtle,
              marginBottom: showShare ? "4px" : "10px",
            }}>
              {showTeam && "Team"}
              {showVip && "VIP Invites"}
              {showShare && "Share & Track"}
            </div>

            {showShare && (
              <div style={{
                fontSize: "11px",
                color: colors.textFaded,
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
                        border: `1px solid ${isCopied ? colors.successRgba : colors.border}`,
                        background: isCopied ? colors.successRgba : colors.surface,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        fontSize: "12px",
                        fontWeight: 500,
                      }}
                      onMouseEnter={(e) => {
                        if (!isCopied) {
                          e.currentTarget.style.background = colors.surfaceMuted;
                          e.currentTarget.style.borderColor = colors.borderStrong;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isCopied) {
                          e.currentTarget.style.background = colors.surface;
                          e.currentTarget.style.borderColor = colors.border;
                        }
                      }}
                    >
                      {isCopied
                        ? <Check size={14} style={{ color: colors.success }} />
                        : <Icon size={14} style={{ color: ch.color }} />}
                      <span style={{ color: isCopied ? colors.success : colors.textMuted }}>
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

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(10,10,10,0.45)",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
        >
          <div
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              borderRadius: "20px",
              padding: "28px 24px 20px",
              maxWidth: "320px",
              width: "100%",
              boxShadow: "0 20px 60px rgba(10,10,10,0.15)",
              textAlign: "center",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {hasRsvps ? (
              <>
                <div style={{ fontSize: "17px", fontWeight: 700, color: colors.text, marginBottom: "6px" }}>
                  Can't delete this event
                </div>
                <div style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "24px" }}>
                  This event has {event._stats.confirmed} registered {event._stats.confirmed === 1 ? "guest" : "guests"}. Remove all registrations from the guest list before deleting.
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
                  style={{
                    width: "100%", padding: "14px", borderRadius: "12px",
                    border: `1px solid ${colors.border}`,
                    background: "transparent", color: colors.textMuted,
                    fontSize: "15px", fontWeight: 600, cursor: "pointer",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  Got it
                </button>
              </>
            ) : (
              <>
                <div style={{ fontSize: "17px", fontWeight: 700, color: colors.text, marginBottom: "6px" }}>
                  Delete "{event.title}"?
                </div>
                <div style={{ fontSize: "14px", color: colors.textMuted, marginBottom: "24px" }}>
                  This action cannot be undone.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setDeleting(true);
                      const success = await onDelete(event.id);
                      setDeleting(false);
                      setShowDeleteConfirm(false);
                    }}
                    style={{
                      width: "100%", padding: "14px", borderRadius: "12px", border: "none",
                      background: colors.danger,
                      color: "#fff", fontSize: "15px", fontWeight: 700,
                      cursor: deleting ? "not-allowed" : "pointer",
                      opacity: deleting ? 0.7 : 1,
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    {deleting ? "Deleting..." : "Delete event"}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
                    style={{
                      width: "100%", padding: "14px", borderRadius: "12px",
                      border: `1px solid ${colors.border}`,
                      background: "transparent", color: colors.textMuted,
                      fontSize: "15px", fontWeight: 600, cursor: "pointer",
                      WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
