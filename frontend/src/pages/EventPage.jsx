// frontend/src/pages/EventPage.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EventCard } from "../components/EventCard";
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
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
          padding: "40px 16px",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", opacity: 0.8 }}>Loading event…</div>
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div
        style={{
          minHeight: "100vh",
          position: "relative",
          background:
            "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
          padding: "40px 16px",
        }}
      >
        <div className="responsive-container responsive-container-wide">
          <div
            className="responsive-card"
            style={{
              background: "rgba(12, 10, 18, 0.6)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.05)",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "18px", opacity: 0.8 }}>
              Event not found.
            </div>
          </div>
        </div>
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
          showToast(
            "Event is full and waitlist is disabled. Please try another event.",
            "error"
          );
          return false;
        }

        if (res.status === 409 && err.error === "duplicate") {
          showToast("You've already RSVP'd for this event.", "error");
          return false;
        }

        throw new Error(err.error || "Failed to RSVP");
      }

      const body = await res.json();

      // Handle different status scenarios with appropriate messages
      const statusDetails = body.statusDetails || {
        bookingStatus:
          body.rsvp?.bookingStatus ||
          (body.rsvp?.status === "attending" ? "CONFIRMED" : "WAITLIST"),
        dinnerBookingStatus:
          body.rsvp?.dinner?.bookingStatus ||
          (body.rsvp?.dinnerStatus === "confirmed"
            ? "CONFIRMED"
            : body.rsvp?.dinnerStatus === "waitlist"
            ? "WAITLIST"
            : null),
        wantsDinner:
          body.rsvp?.dinner?.enabled || body.rsvp?.wantsDinner || false,
        // Backward compatibility
        cocktailStatus: body.rsvp?.status || "attending",
        dinnerStatus: body.rsvp?.dinnerStatus || null,
      };

      const bookingStatus =
        statusDetails.bookingStatus ||
        (statusDetails.cocktailStatus === "attending"
          ? "CONFIRMED"
          : "WAITLIST");
      const dinnerBookingStatus =
        statusDetails.dinnerBookingStatus ||
        (statusDetails.dinnerStatus === "confirmed"
          ? "CONFIRMED"
          : statusDetails.dinnerStatus === "waitlist"
          ? "WAITLIST"
          : null);
      const wantsDinner = statusDetails.wantsDinner;

      // Build appropriate message based on status
      let message = "";
      let toastType = "success";

      if (bookingStatus === "WAITLIST") {
        // Entire booking is on waitlist (all-or-nothing)
        message =
          "You've been added to the waitlist. 👀 We'll notify you if spots become available!";
        toastType = "info";
      } else {
        // Fully confirmed
        if (wantsDinner && dinnerBookingStatus === "CONFIRMED") {
          message = "You're confirmed for cocktails and dinner! 🔥";
        } else {
          message = "You're on the list! 🔥";
        }
        toastType = "success";
      }

      showToast(message, toastType);

      // Refetch event data to update capacity after RSVP
      // This updates the event state which will cause EventCard to re-render with new capacity
      try {
        const eventRes = await fetch(`${API_BASE}/events/${event.slug}`);
        if (eventRes.ok) {
          const updatedEvent = await eventRes.json();
          setEvent(updatedEvent);
        }
      } catch (err) {
        console.error("Failed to refresh event data", err);
        // Don't show error to user - capacity will update on next page load
      }

      return true; // Success
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
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        background:
          "radial-gradient(circle at 20% 50%, rgba(139, 92, 246, 0.1) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.1) 0%, transparent 50%), #05040a",
        padding: "40px 16px",
      }}
    >
      <div className="responsive-container responsive-container-wide">
        <EventCard
          event={event}
          onSubmit={handleRsvpSubmit}
          loading={rsvpLoading}
        />
      </div>
    </div>
  );
}
