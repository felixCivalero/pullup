import { useNavigate } from "react-router-dom";
import { FilterButton } from "./HomeTabs";
import { DashboardEventCard, getEventStatus } from "./DashboardEventCard";

export function EventsTab({ events, eventFilter, setEventFilter }) {
  const navigate = useNavigate();
  const allEvents = events || [];

  const pastEvents = allEvents.filter((e) => getEventStatus(e) === "past");
  const upcomingAndOngoingEvents = allEvents.filter(
    (e) => getEventStatus(e) !== "past"
  );

  const filteredEvents =
    eventFilter === "past" ? pastEvents : upcomingAndOngoingEvents;

  return (
    <>
      {/* Subtle filter toggle - less prominent, smaller */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "16px",
          marginTop: "-8px",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            gap: "8px",
            alignItems: "center",
            padding: "4px",
            background: "rgba(255,255,255,0.02)",
            borderRadius: "8px",
          }}
        >
          <button
            onClick={() => setEventFilter("upcoming")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              background:
                eventFilter === "upcoming"
                  ? "rgba(255,255,255,0.08)"
                  : "transparent",
              color:
                eventFilter === "upcoming"
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(255,255,255,0.4)",
              fontWeight: eventFilter === "upcoming" ? 500 : 400,
              fontSize: "11px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            Coming
            {upcomingAndOngoingEvents.length > 0 && (
              <span style={{ marginLeft: "4px", opacity: 0.6 }}>
                ({upcomingAndOngoingEvents.length})
              </span>
            )}
          </button>
          <div
            style={{
              width: "1px",
              height: "12px",
              background: "rgba(255,255,255,0.1)",
            }}
          />
          <button
            onClick={() => setEventFilter("past")}
            style={{
              padding: "4px 10px",
              borderRadius: "6px",
              border: "none",
              background:
                eventFilter === "past"
                  ? "rgba(255,255,255,0.08)"
                  : "transparent",
              color:
                eventFilter === "past"
                  ? "rgba(255,255,255,0.9)"
                  : "rgba(255,255,255,0.4)",
              fontWeight: eventFilter === "past" ? 500 : 400,
              fontSize: "11px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            }}
          >
            Past
            {pastEvents.length > 0 && (
              <span style={{ marginLeft: "4px", opacity: 0.6 }}>
                ({pastEvents.length})
              </span>
            )}
          </button>
        </div>
      </div>

      {/* List / empty state */}
      {filteredEvents.length === 0 ? (
        <>
          {eventFilter === "upcoming" && allEvents.length === 0 ? (
            // First-time user empty state - prominent create event CTA
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 20px 40px",
                minHeight: "calc(100vh - 400px)",
                maxWidth: "500px",
                margin: "0 auto",
              }}
            >
              {/* Large prominent plus sign - mobile optimized */}
              <button
                onClick={() => navigate("/create")}
                style={{
                  width: "100px",
                  height: "100px",
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                  border: "none",
                  color: "#fff",
                  fontSize: "48px",
                  fontWeight: 300,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  marginBottom: "24px",
                  boxShadow: "0 8px 32px rgba(139, 92, 246, 0.4)",
                  touchAction: "manipulation",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.1) rotate(90deg)";
                  e.currentTarget.style.boxShadow =
                    "0 16px 48px rgba(139, 92, 246, 0.6)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1) rotate(0deg)";
                  e.currentTarget.style.boxShadow =
                    "0 8px 32px rgba(139, 92, 246, 0.4)";
                }}
              >
                <span style={{ lineHeight: "1", userSelect: "none" }}>+</span>
              </button>

              {/* Text content - mobile optimized */}
              <div
                style={{
                  textAlign: "center",
                  width: "100%",
                }}
              >
                <h2
                  style={{
                    fontSize: "clamp(24px, 5vw, 32px)",
                    fontWeight: 700,
                    marginBottom: "12px",
                    background:
                      "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    lineHeight: "1.2",
                  }}
                >
                  Create Your First Event
                </h2>

                {/* Primary CTA button - large and prominent for mobile */}
              </div>
            </div>
          ) : (
            // Regular empty state (when filtering)
            <div
              style={{
                textAlign: "center",
                padding: "40px 20px",
                opacity: 0.6,
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                {eventFilter === "past" ? "📜" : "📅"}
              </div>
              <div
                style={{
                  fontSize: "clamp(16px, 4vw, 18px)",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                No {eventFilter} events
              </div>
              <div
                style={{
                  fontSize: "clamp(13px, 3vw, 14px)",
                  opacity: 0.7,
                  marginBottom: eventFilter === "upcoming" ? "24px" : "0",
                }}
              >
                {eventFilter === "upcoming" &&
                  "Create your first event to get started!"}
                {eventFilter === "past" && "Your past events will appear here."}
              </div>
              {eventFilter === "upcoming" && (
                <button
                  onClick={() => navigate("/create")}
                  style={{
                    width: "100%",
                    maxWidth: "280px",
                    margin: "0 auto",
                    padding: "14px 28px",
                    borderRadius: "999px",
                    border: "none",
                    background:
                      "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "15px",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    boxShadow: "0 4px 16px rgba(139, 92, 246, 0.3)",
                    touchAction: "manipulation",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow =
                      "0 12px 30px rgba(139, 92, 246, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow =
                      "0 4px 16px rgba(139, 92, 246, 0.3)";
                  }}
                >
                  Create Event
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          {filteredEvents.map((ev) => (
            <DashboardEventCard
              key={ev.id}
              event={ev}
              onPreview={`/e/${ev.slug}`}
              onManage={() => navigate(`/app/events/${ev.id}/manage`)}
            />
          ))}
        </div>
      )}
    </>
  );
}
