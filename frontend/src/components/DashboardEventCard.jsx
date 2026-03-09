// Host-side event card (Home dashboard)
import { FaShare } from "react-icons/fa";
import { getEventShareUrl } from "../lib/urlUtils";
import { formatReadableDateTime } from "../lib/dateUtils.js";

export function getEventStatus(event) {
  const now = new Date();
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;

  if (end && now > end) return "past";
  if (now >= start && (!end || now <= end)) return "ongoing";
  return "upcoming";
}

export function DashboardEventCard({ event, onPreview, onManage }) {
  const status = getEventStatus(event);
  const isLive = status === "ongoing";

  const handleShare = async () => {
    const shareUrl = getEventShareUrl(event.slug);
    if (navigator.share) {
      try {
        await navigator.share({ url: shareUrl });
      } catch (err) {
        if (err.name !== "AbortError") {
          navigator.clipboard.writeText(shareUrl);
        }
      }
    } else {
      navigator.clipboard.writeText(shareUrl);
    }
  };

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
        className="dashboard-card"
        style={{
          padding: "16px",
          background: "rgba(20, 16, 30, 0.6)",
          borderRadius: "14px",
          border: "1px solid rgba(255,255,255,0.05)",
          transition: "all 0.3s ease",
          cursor: "pointer",
          position: "relative",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.borderColor = "rgba(192, 192, 192, 0.3)";
          e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
          e.currentTarget.style.boxShadow = "none";
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
              src={event.imageUrl}
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
                fontSize: "11px", opacity: 0.4, fontWeight: 500,
                whiteSpace: "nowrap", flexShrink: 0,
              }}>
                {event._stats.confirmed}
                {event._stats.totalCapacity != null && ` / ${event._stats.totalCapacity}`}
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
                handleShare();
              }}
              style={{
                padding: "6px 10px", borderRadius: "999px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "rgba(255,255,255,0.05)", color: "#fff",
                cursor: "pointer", transition: "all 0.2s ease",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "rgba(255,255,255,0.05)";
              }}
              title="Share event"
            >
              <FaShare size={12} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
