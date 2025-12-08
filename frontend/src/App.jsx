import { useState } from "react";
import { EventCard } from "./EventCard";

const API_BASE = "http://localhost:3001";

function App() {
  const [mode, setMode] = useState("create"); // "create" | "view"
  const [loading, setLoading] = useState(false);
  const [event, setEvent] = useState(null);

  // form state
  const [title, setTitle] = useState("PullUp Launch Party");
  const [description, setDescription] = useState(
    "A sexy test event for PullUp."
  );
  const [location, setLocation] = useState("Stockholm");
  const [startsAt, setStartsAt] = useState("2025-12-31T22:00");

  async function handleCreate(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          location,
          // send ISO string
          startsAt: new Date(startsAt).toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create event");
      }

      const created = await res.json();
      setEvent(created);
      setMode("view");
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleRsvp() {
    if (!event) return;
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

  if (mode === "view" && event) {
    return <EventCard event={event} onRsvp={handleRsvp} />;
  }

  // CREATE MODE
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#05040A",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <form
        onSubmit={handleCreate}
        style={{
          background: "#0C0A12",
          padding: "32px",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "480px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>
          Create a PullUp
        </h1>

        <label
          style={{ display: "block", fontSize: "13px", marginBottom: "8px" }}
        >
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={inputStyle}
            required
          />
        </label>

        <label
          style={{ display: "block", fontSize: "13px", marginBottom: "8px" }}
        >
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }}
          />
        </label>

        <label
          style={{ display: "block", fontSize: "13px", marginBottom: "8px" }}
        >
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label
          style={{ display: "block", fontSize: "13px", marginBottom: "16px" }}
        >
          Starts at
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            style={inputStyle}
            required
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "8px",
            width: "100%",
            padding: "12px 16px",
            borderRadius: "999px",
            border: "none",
            fontWeight: 600,
            fontSize: "15px",
            cursor: "pointer",
            opacity: loading ? 0.7 : 1,
          }}
        >
          {loading ? "Creating…" : "Create event"}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  marginTop: "4px",
  padding: "10px 12px",
  borderRadius: "10px",
  border: "1px solid #2B2738",
  background: "#14101E",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
};

export default App;
