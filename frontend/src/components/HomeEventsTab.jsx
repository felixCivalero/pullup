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
      {/* Filter toggle */}
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "24px",
        }}
      >
        <FilterButton
          label="Upcoming"
          count={upcomingAndOngoingEvents.length}
          active={eventFilter === "upcoming"}
          onClick={() => setEventFilter("upcoming")}
        />
        <FilterButton
          label="Past"
          count={pastEvents.length}
          active={eventFilter === "past"}
          onClick={() => setEventFilter("past")}
        />
      </div>

      {/* List / empty state */}
      {filteredEvents.length === 0 ? (
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
                background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
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
