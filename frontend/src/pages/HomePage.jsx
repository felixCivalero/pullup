import { useEffect, useState } from "react";
import { useToast } from "../components/Toast";
import { EventsTab } from "../components/HomeEventsTab";
import { authenticatedFetch } from "../lib/api.js";
import { useHostActions } from "../lib/useHostActions.js";
import { isNetworkError, handleNetworkError } from "../lib/errorHandler.js";
import { colors } from "../theme/colors.js";

export function HomePage() {
  const { showToast } = useToast();

  const [upcomingEvents, setUpcomingEvents] = useState(null);
  const [pastEvents, setPastEvents] = useState(null);
  const [loadingUpcoming, setLoadingUpcoming] = useState(true);
  const [loadingPast, setLoadingPast] = useState(false);
  const [pastLoaded, setPastLoaded] = useState(false);
  const [networkError, setNetworkError] = useState(false);

  const [eventFilter, setEventFilter] = useState("upcoming"); // "upcoming" | "past"

  async function loadUpcomingEvents() {
    setNetworkError(false);
    setLoadingUpcoming(true);
    try {
      const res = await authenticatedFetch("/events?filter=upcoming");
      if (!res.ok) throw new Error("Failed to load events");
      const data = await res.json();
      setUpcomingEvents(data);
    } catch (err) {
      console.error("Failed to load events", err);
      if (isNetworkError(err)) {
        setNetworkError(true);
        handleNetworkError(err, showToast);
      } else {
        showToast("Failed to load events", "error");
      }
    } finally {
      setLoadingUpcoming(false);
    }
  }

  useEffect(() => {
    loadUpcomingEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  // When MCP creates / updates / publishes / deletes an event from chat,
  // refresh the dashboard so the new card shows up without a manual reload.
  useHostActions({
    tools: [
      "create_event",
      "update_event",
      "publish_event",
      "unpublish_event",
      "delete_event",
      "duplicate_event",
    ],
    onInsert: () => loadUpcomingEvents(),
  });

  // Lazy-load past events only when needed
  useEffect(() => {
    if (eventFilter !== "past") return;
    if (pastLoaded || loadingPast) return;

    async function loadPastEvents() {
      try {
        setLoadingPast(true);
        const res = await authenticatedFetch("/events?filter=past");
        if (!res.ok) throw new Error("Failed to load past events");
        const data = await res.json();
        setPastEvents(data);
        setPastLoaded(true);
      } catch (err) {
        console.error("Failed to load past events", err);
        showToast("Failed to load past events", "error");
      } finally {
        setLoadingPast(false);
      }
    }

    loadPastEvents();
  }, [eventFilter, pastLoaded, loadingPast, showToast]);

  if (loadingUpcoming) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          background: colors.background,
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
            }}
          >
            <div style={{ fontSize: "18px", color: colors.textMuted }}>
              Loading events…
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (networkError) {
    return (
      <div
        className="page-with-header"
        style={{
          minHeight: "100vh",
          background: colors.background,
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: colors.background,
              border: `1px solid ${colors.border}`,
              boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
            }}
          >
            <h2 style={{ marginBottom: "8px", fontSize: "24px", color: colors.text }}>
              Connection Error
            </h2>
            <p style={{ color: colors.textMuted, marginBottom: "16px" }}>
              Unable to connect to the server. Please check your internet
              connection and try again.
            </p>
            <button onClick={() => window.location.reload()} style={primaryBtn}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        background: colors.background,
        paddingBottom: "clamp(20px, 5vw, 40px)",
      }}
    >
      <div
        className="responsive-container responsive-container-wide"
        style={{ position: "relative" }}
      >
        <style>{`
          @media (max-width: 767px) {
            .responsive-container-wide {
              padding: 12px !important;
            }
            .responsive-container-wide .responsive-card {
              padding: 16px !important;
              border-radius: 16px !important;
            }
          }
        `}</style>

        <div
          className="responsive-card"
          style={{
            background: colors.background,
            border: `1px solid ${colors.border}`,
            boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
          }}
        >
          <EventsTab
            upcomingEvents={upcomingEvents || []}
            pastEvents={pastEvents || []}
            eventFilter={eventFilter}
            setEventFilter={setEventFilter}
            loadingPast={loadingPast}
            showToast={showToast}
            onDeleteEvent={(eventId) => {
              setUpcomingEvents((prev) => prev?.filter((e) => e.id !== eventId) || []);
              setPastEvents((prev) => prev?.filter((e) => e.id !== eventId) || []);
            }}
          />
        </div>
      </div>
    </div>
  );
}

const primaryBtn = {
  padding: "12px 24px",
  borderRadius: "999px",
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
};
