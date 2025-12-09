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
          showToast("Event is full and waitlist is disabled.", "error");
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
        cocktailStatus: body.rsvp?.status || "attending",
        dinnerStatus: body.rsvp?.dinnerStatus || null,
        wantsDinner: body.rsvp?.wantsDinner || false,
      };

      const cocktailStatus = statusDetails.cocktailStatus;
      const dinnerStatus = statusDetails.dinnerStatus;
      const wantsDinner = statusDetails.wantsDinner;

      // Build appropriate message based on status
      let message = "";
      let toastType = "success";

      if (cocktailStatus === "waitlist") {
        // On waitlist for cocktails
        message = "The event is full. You've been added to the waitlist. 👀";
        toastType = "info";
      } else if (wantsDinner) {
        // Wants dinner - check dinner status
        if (dinnerStatus === "waitlist") {
          message =
            "You're confirmed for cocktails! 🥂 However, the dinner slot is full. You've been added to the dinner waitlist. 👀";
          toastType = "info";
        } else if (dinnerStatus === "cocktails") {
          message =
            "You're confirmed for cocktails! 🥂 The dinner slot is full, so you'll join us for cocktails after dinner.";
          toastType = "info";
        } else if (dinnerStatus === "cocktails_waitlist") {
          message =
            "You're confirmed for cocktails! 🥂 The dinner slot is full. You're on the dinner waitlist and will join for cocktails. 👀";
          toastType = "info";
        } else if (dinnerStatus === "confirmed") {
          message = "You're confirmed for cocktails and dinner! 🔥";
          toastType = "success";
        } else {
          message = "You're on the list! 🔥";
          toastType = "success";
        }
      } else {
        // Just cocktails, confirmed
        message = "You're on the list! 🔥";
        toastType = "success";
      }

      showToast(message, toastType);

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
