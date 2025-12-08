// frontend/src/pages/EventPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EventCard } from "../components/EventCard";
import { RsvpModal } from "../components/RsvpModal";
import { useToast } from "../components/Toast";

const API_BASE = "http://localhost:3001";

function isNetworkError(error) {
  return (
    error instanceof TypeError ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("NetworkError")
  );
}

export function EventPage() {
  const { slug } = useParams();
  const { showToast } = useToast();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showRsvpModal, setShowRsvpModal] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  useEffect(() => {
    async function loadEvent() {
      setLoading(true);
      setNotFound(false);
      try {
        const res = await fetch(`${API_BASE}/events/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          setEvent(null);
          return;
        }
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();
        setEvent(data);
      } catch (err) {
        console.error("Error loading event", err);
        showToast("Failed to load event", "error");
      } finally {
        setLoading(false);
      }
    }

    if (slug) loadEvent();
  }, [slug, showToast]);

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#05040A",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        Loading event…
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#05040A",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        Event not found.
      </div>
    );
  }

  async function handleRsvpSubmit(data) {
    setRsvpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/events/${event.slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        if (res.status === 409 && err.error === "full") {
          showToast("Event is full and waitlist is disabled.", "error");
          return;
        }

        if (res.status === 409 && err.error === "duplicate") {
          showToast("You've already RSVP'd for this event.", "error");
          return;
        }

        throw new Error(err.error || "Failed to RSVP");
      }

      const body = await res.json();

      if (body.status === "waitlist") {
        showToast(
          "The event is full. You've been added to the waitlist. 👀",
          "info"
        );
      } else {
        showToast("You're on the list. 🔥", "success");
      }

      setShowRsvpModal(false);
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        showToast("Network error. Please try again.", "error");
      } else {
        showToast(err.message || "Failed to RSVP.", "error");
      }
    } finally {
      setRsvpLoading(false);
    }
  }

  return (
    <>
      <EventCard
        event={event}
        onRsvp={() => setShowRsvpModal(true)}
      />
      {showRsvpModal && (
        <RsvpModal
          event={event}
          onClose={() => setShowRsvpModal(false)}
          onSubmit={handleRsvpSubmit}
          loading={rsvpLoading}
        />
      )}
    </>
  );
}
