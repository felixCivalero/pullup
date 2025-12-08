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

  async function handleRsvp() {
    try {
      const email = window.prompt("Drop your email to pull up:");
      if (!email) return;

      const name = window.prompt("What's your name? (optional)") || "";

      let plusOnes = 0;
      const maxPlusOnes =
        typeof event.maxPlusOnesPerGuest === "number"
          ? event.maxPlusOnesPerGuest
          : 0;

      if (maxPlusOnes > 0) {
        const rawPlus = window.prompt(
          `How many friends are you bringing? (0–${maxPlusOnes})`,
          "0"
        );
        if (rawPlus === null) return; // cancelled
        const parsed = Number(rawPlus);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= maxPlusOnes) {
          plusOnes = parsed;
        } else {
          alert("We'll save it as 0 extra guests for now.");
          plusOnes = 0;
        }
      }

      let wantsDinner = false;
      if (event.dinnerEnabled) {
        wantsDinner = window.confirm(
          "Dinner option is available for this event. Do you want to join dinner as well?"
        );
      }

      const res = await fetch(`${API_BASE}/events/${event.slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, plusOnes, wantsDinner }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));

        if (res.status === 409 && err.error === "full") {
          alert("Event is full and waitlist is disabled.");
          return;
        }

        if (res.status === 409 && err.error === "duplicate") {
          alert("You’ve already RSVP’d for this event.");
          return;
        }

        throw new Error(err.error || "Failed to RSVP");
      }

      const body = await res.json();

      if (body.status === "waitlist") {
        alert("The event is full. You’ve been added to the waitlist. 👀");
      } else {
        alert("You’re on the list. 🔥");
      }
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        alert("Network error. Please try again.");
      } else {
        alert(err.message || "Failed to RSVP.");
      }
    }
  }

  return <EventCard event={event} onRsvp={handleRsvp} />;
}
