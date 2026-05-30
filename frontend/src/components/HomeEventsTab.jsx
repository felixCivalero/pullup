import { useNavigate } from "react-router-dom";
import { ScrollText, Calendar } from "lucide-react";
import { DashboardEventCard } from "./DashboardEventCard";
import { SubTabToggle } from "./HomeTabs";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { PullupEyes } from "./PullupEyes.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const createBtnStyle = {
  width: "100%",
  maxWidth: "280px",
  margin: "0 auto",
  padding: "14px 28px",
  borderRadius: "999px",
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontWeight: 600,
  fontSize: "15px",
  cursor: "pointer",
  transition: "all 0.3s ease",
  boxShadow: colors.accentShadow,
  touchAction: "manipulation",
};

export function EventsTab({
  upcomingEvents,
  pastEvents,
  eventFilter,
  setEventFilter,
  loadingPast,
  showToast,
  onDeleteEvent,
}) {
  const navigate = useNavigate();
  const safeUpcoming = upcomingEvents || [];
  const safePast = pastEvents || [];

  const filteredEvents = eventFilter === "past" ? safePast : safeUpcoming;
  const isLoading = eventFilter === "past" && loadingPast;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 12px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: 600, margin: 0, color: colors.text }}>Events</h3>
        <SubTabToggle
          leftLabel="Coming"
          leftCount={safeUpcoming.length}
          rightLabel="Past"
          rightCount={safePast.length}
          active={eventFilter === "past" ? "right" : "left"}
          onChange={(key) => setEventFilter(key === "right" ? "past" : "upcoming")}
        />
      </div>

      {/* List / empty state */}
      {isLoading ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            color: colors.textMuted,
          }}
        >
          <div style={{ fontSize: "clamp(16px, 4vw, 18px)", fontWeight: 600 }}>
            Loading past events…
          </div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <>
          <div
            style={{
              textAlign: "center",
              padding: "48px 20px 40px",
            }}
          >
            {eventFilter === "upcoming" ? (
              <div style={{ marginBottom: "16px", display: "flex", justifyContent: "center" }}>
                <PullupEyes variant="small" style={{ width: 64, height: 56 }} />
              </div>
            ) : (
              <div style={{ fontSize: "40px", marginBottom: "16px", display: "flex", justifyContent: "center" }}>
                <SilverIcon as={ScrollText} size={36} />
              </div>
            )}
            <div
              style={{
                fontSize: "clamp(16px, 4vw, 18px)",
                fontWeight: 700,
                marginBottom: "8px",
                color: colors.text,
              }}
            >
              No {eventFilter} events
            </div>
            <div
              style={{
                fontSize: "clamp(13px, 3vw, 14px)",
                color: colors.textMuted,
                marginBottom: eventFilter === "upcoming" ? "24px" : "0",
              }}
            >
              {eventFilter === "upcoming" &&
                "You don't have any upcoming events yet."}
              {eventFilter === "past" && "Your past events will appear here."}
            </div>
            {eventFilter === "upcoming" && (
              <button
                onClick={() => navigate("/create")}
                style={createBtnStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.accentHover;
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 12px 30px rgba(236,23,143,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.accent;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = colors.accentShadow;
                }}
              >
                Create Event
              </button>
            )}
          </div>
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {filteredEvents.map((ev, index) => (
            <DashboardEventCard
              key={ev.id}
              event={ev}
              index={index}
              onPreview={`/e/${ev.slug}`}
              onManage={() => navigate(ev.myRole === "analytics" ? `/app/events/${ev.id}/analytics` : `/app/events/${ev.id}/guests`)}
              onDelete={async (eventId) => {
                try {
                  const res = await authenticatedFetch(`/host/events/${eventId}`, { method: "DELETE" });
                  const data = await res.json();
                  if (!res.ok) {
                    showToast(data.message || "Could not delete event", "error");
                    return false;
                  }
                  showToast("Event deleted", "success");
                  if (onDeleteEvent) onDeleteEvent(eventId);
                  return true;
                } catch (err) {
                  console.error(err);
                  showToast("Could not delete event", "error");
                  return false;
                }
              }}
            />
          ))}

          {/* Create button below event list */}
          {eventFilter === "upcoming" && (
            <div style={{ textAlign: "center", padding: "16px 0 8px" }}>
              <button
                onClick={() => navigate("/create")}
                style={{
                  ...createBtnStyle,
                  maxWidth: "220px",
                  padding: "12px 24px",
                  fontSize: "14px",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = colors.accentHover;
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 12px 30px rgba(236,23,143,0.35)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = colors.accent;
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = colors.accentShadow;
                }}
              >
                Create Event
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
