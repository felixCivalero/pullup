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
      {/* Filter toggle - positioned in right corner */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            position: "relative",
            padding: "3px",
            background: "rgba(12, 10, 18, 0.8)",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {/* Animated background slider */}
          <div
            style={{
              position: "absolute",
              top: "3px",
              left: eventFilter === "upcoming" ? "3px" : "calc(50% + 1px)",
              width: "calc(50% - 2px)",
              height: "calc(100% - 6px)",
              background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
              borderRadius: "999px",
              transition: "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
              boxShadow: "0 2px 8px rgba(139, 92, 246, 0.3)",
              zIndex: 0,
            }}
          />

          {/* Toggle buttons */}
          <button
            onClick={() => setEventFilter("upcoming")}
            style={{
              position: "relative",
              zIndex: 1,
              padding: "8px 16px",
              borderRadius: "999px",
              border: "none",
              background: "transparent",
              color:
                eventFilter === "upcoming" ? "#fff" : "rgba(255,255,255,0.5)",
              fontWeight: eventFilter === "upcoming" ? 600 : 500,
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              minWidth: "100px",
              justifyContent: "center",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (eventFilter !== "upcoming") {
                e.target.style.color = "rgba(255,255,255,0.8)";
              }
            }}
            onMouseLeave={(e) => {
              if (eventFilter !== "upcoming") {
                e.target.style.color = "rgba(255,255,255,0.5)";
              }
            }}
          >
            <span>Coming</span>
            {upcomingAndOngoingEvents.length > 0 && (
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background:
                    eventFilter === "upcoming"
                      ? "rgba(255,255,255,0.25)"
                      : "rgba(255,255,255,0.08)",
                  fontSize: "11px",
                  fontWeight: 600,
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  minWidth: "20px",
                  textAlign: "center",
                  lineHeight: "1.4",
                }}
              >
                {upcomingAndOngoingEvents.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setEventFilter("past")}
            style={{
              position: "relative",
              zIndex: 1,
              padding: "8px 16px",
              borderRadius: "999px",
              border: "none",
              background: "transparent",
              color: eventFilter === "past" ? "#fff" : "rgba(255,255,255,0.5)",
              fontWeight: eventFilter === "past" ? 600 : 500,
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              minWidth: "100px",
              justifyContent: "center",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (eventFilter !== "past") {
                e.target.style.color = "rgba(255,255,255,0.8)";
              }
            }}
            onMouseLeave={(e) => {
              if (eventFilter !== "past") {
                e.target.style.color = "rgba(255,255,255,0.5)";
              }
            }}
          >
            <span>Past</span>
            {pastEvents.length > 0 && (
              <span
                style={{
                  padding: "1px 6px",
                  borderRadius: "10px",
                  background:
                    eventFilter === "past"
                      ? "rgba(255,255,255,0.25)"
                      : "rgba(255,255,255,0.08)",
                  fontSize: "11px",
                  fontWeight: 600,
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  minWidth: "20px",
                  textAlign: "center",
                  lineHeight: "1.4",
                }}
              >
                {pastEvents.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* List / empty state */}
      {filteredEvents.length === 0 ? (
        <>
          {eventFilter === "upcoming" && allEvents.length === 0 ? (
            // First-time user empty state - prominent plus sign
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "80px 24px",
                minHeight: "400px",
              }}
            >
              {/* Animated plus sign */}
              <button
                onClick={() => navigate("/create")}
                style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)",
                  border: "2px solid rgba(139, 92, 246, 0.4)",
                  color: "#fff",
                  fontSize: "48px",
                  fontWeight: 300,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                  marginBottom: "32px",
                  boxShadow: "0 8px 32px rgba(139, 92, 246, 0.2)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "scale(1.1) rotate(90deg)";
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(139, 92, 246, 0.3) 0%, rgba(236, 72, 153, 0.3) 100%)";
                  e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.6)";
                  e.currentTarget.style.boxShadow =
                    "0 16px 48px rgba(139, 92, 246, 0.4)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "scale(1) rotate(0deg)";
                  e.currentTarget.style.background =
                    "linear-gradient(135deg, rgba(139, 92, 246, 0.2) 0%, rgba(236, 72, 153, 0.2) 100%)";
                  e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.4)";
                  e.currentTarget.style.boxShadow =
                    "0 8px 32px rgba(139, 92, 246, 0.2)";
                }}
              >
                <span style={{ lineHeight: "1", userSelect: "none" }}>+</span>
                {/* Pulsing glow effect */}
                <div
                  style={{
                    position: "absolute",
                    inset: "-8px",
                    borderRadius: "50%",
                    background:
                      "radial-gradient(circle, rgba(139, 92, 246, 0.4) 0%, transparent 70%)",
                    opacity: 0.6,
                    animation: "pulse 2s ease-in-out infinite",
                    pointerEvents: "none",
                  }}
                />
              </button>
              <style>
                {`
                  @keyframes pulse {
                    0%, 100% {
                      opacity: 0.4;
                      transform: scale(1);
                    }
                    50% {
                      opacity: 0.8;
                      transform: scale(1.1);
                    }
                  }
                `}
              </style>

              {/* Text content */}
              <div
                style={{
                  textAlign: "center",
                  maxWidth: "400px",
                }}
              >
                <h2
                  style={{
                    fontSize: "28px",
                    fontWeight: 700,
                    marginBottom: "12px",
                    background:
                      "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  Create Event
                </h2>
                <p
                  style={{
                    fontSize: "16px",
                    opacity: 0.7,
                    lineHeight: "1.6",
                    marginBottom: "32px",
                  }}
                >
                  Make 'em pull up. Click the plus sign above or use the button
                  below to create your first PullUp event.
                </p>

                {/* Secondary CTA button */}
                <button
                  onClick={() => navigate("/create")}
                  style={{
                    padding: "14px 32px",
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
              </div>
            </div>
          ) : (
            // Regular empty state (when filtering)
            <div
              style={{
                textAlign: "center",
                padding: "60px 24px",
                opacity: 0.6,
              }}
            >
              <div style={{ fontSize: "48px", marginBottom: "16px" }}>
                {eventFilter === "past" ? "📜" : "📅"}
              </div>
              <div
                style={{
                  fontSize: "18px",
                  fontWeight: 600,
                  marginBottom: "8px",
                }}
              >
                No {eventFilter} events
              </div>
              <div style={{ fontSize: "14px", opacity: 0.7 }}>
                {eventFilter === "upcoming" &&
                  "Create your first event to get started!"}
                {eventFilter === "past" && "Your past events will appear here."}
              </div>
              {eventFilter === "upcoming" && (
                <button
                  onClick={() => navigate("/create")}
                  style={{
                    marginTop: "24px",
                    padding: "12px 24px",
                    borderRadius: "999px",
                    border: "none",
                    background:
                      "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
                    color: "#fff",
                    fontWeight: 600,
                    fontSize: "14px",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.transform = "translateY(-2px)";
                    e.target.style.boxShadow =
                      "0 12px 30px rgba(139, 92, 246, 0.5)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = "translateY(0)";
                    e.target.style.boxShadow = "none";
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
            gap: "16px",
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
