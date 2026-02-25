import { useNavigate } from "react-router-dom";
import { ScrollText, Calendar } from "lucide-react";
import { DashboardEventCard } from "./DashboardEventCard";
import { SubTabToggle } from "./HomeTabs";
import { SilverIcon } from "./ui/SilverIcon.jsx";

export function EventsTab({
  upcomingEvents,
  pastEvents,
  eventFilter,
  setEventFilter,
  loadingPast,
}) {
  const navigate = useNavigate();
  const safeUpcoming = upcomingEvents || [];
  const safePast = pastEvents || [];

  const filteredEvents = eventFilter === "past" ? safePast : safeUpcoming;
  const isLoading = eventFilter === "past" && loadingPast;

  return (
    <>
      <SubTabToggle
        leftLabel="Coming"
        leftCount={safeUpcoming.length}
        rightLabel="Past"
        rightCount={safePast.length}
        active={eventFilter === "past" ? "right" : "left"}
        onChange={(key) => setEventFilter(key === "right" ? "past" : "upcoming")}
      />

      {/* List / empty state */}
      {isLoading ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px 20px",
            opacity: 0.7,
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
              padding: "40px 20px",
              opacity: 0.6,
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>
              {eventFilter === "past" ? (
                <SilverIcon as={ScrollText} size={18} />
              ) : (
                <SilverIcon as={Calendar} size={18} />
              )}
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
                "You don't have any upcoming events yet."}
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
                    "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: "15px",
                  cursor: "pointer",
                  transition: "all 0.3s ease",
                  boxShadow: "0 4px 16px rgba(192, 192, 192, 0.3)",
                  touchAction: "manipulation",
                }}
                onMouseEnter={(e) => {
                  e.target.style.transform = "translateY(-2px)";
                  e.target.style.boxShadow =
                    "0 12px 30px rgba(192, 192, 192, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = "translateY(0)";
                  e.target.style.boxShadow =
                    "0 4px 16px rgba(192, 192, 192, 0.3)";
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
