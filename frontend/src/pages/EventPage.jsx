import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { EventCard } from "../components/EventCard";

const API_BASE = "http://localhost:3001";

export function EventPage() {
  const { slug } = useParams();
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
        const data = await res.json();
        setEvent(data);
      } catch (err) {
        console.error("Error loading event", err);
      } finally {
        setLoading(false);
      }
    }

    if (slug) loadEvent();
  }, [slug]);

  if (loading) {
    return (
      <div className="responsive-container">
        <div className="responsive-card" style={{ textAlign: "center" }}>
          Loading event…
        </div>
      </div>
    );
  }

  if (notFound || !event) {
    return (
      <div className="responsive-container">
        <div className="responsive-card" style={{ textAlign: "center" }}>
          Event not found.
        </div>
      </div>
    );
  }

  async function handleRsvp() {
    const email = window.prompt("Drop your email to pull up:");
    if (!email) return;

    try {
      const res = await fetch(`${API_BASE}/events/${event.slug}/rsvp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to RSVP");
      }
      alert("You're on the list. 🔥");
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  }

  return (
    <div className="responsive-container">
      <EventCard event={event} onRsvp={handleRsvp} />
    </div>
  );
}
