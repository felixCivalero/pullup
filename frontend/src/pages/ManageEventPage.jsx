import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";

const API_BASE = "http://localhost:3001";

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
  boxSizing: "border-box",
};

export function ManageEventPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/host/events/${id}`);
        if (!res.ok) throw new Error("Failed to load event");
        const data = await res.json();
        setEvent({
          ...data,
          startsAtLocal: data.startsAt
            ? new Date(data.startsAt).toISOString().slice(0, 16)
            : "",
        });
      } catch (err) {
        console.error(err);
        alert("Could not load event");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSave(e) {
    e.preventDefault();
    if (!event) return;

    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/host/events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: event.title,
          description: event.description,
          location: event.location,
          startsAt: event.startsAtLocal
            ? new Date(event.startsAtLocal).toISOString()
            : null,
        }),
      });

      if (!res.ok) throw new Error("Failed to save event");
      const updated = await res.json();
      setEvent({
        ...updated,
        startsAtLocal: updated.startsAt
          ? new Date(updated.startsAt).toISOString().slice(0, 16)
          : "",
      });
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="responsive-container page-with-header">
        <div className="responsive-card">Loading event…</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="responsive-container page-with-header">
        <div className="responsive-card">Event not found.</div>
      </div>
    );
  }

  return (
    <div className="responsive-container page-with-header">
      <div
        className="responsive-card"
        style={{
          maxWidth: "800px",
          margin: "0 auto",
        }}
      >
        <div style={{ marginBottom: "16px", fontSize: "14px", opacity: 0.7 }}>
          <Link to="/home" style={{ color: "#aaa", textDecoration: "none" }}>
            ← Back to home
          </Link>
        </div>

        <h1 style={{ marginBottom: "8px" }}>
          {event.title || "Untitled event"}
        </h1>

        <div style={{ marginBottom: "16px", fontSize: "13px", opacity: 0.8 }}>
          Public link:{" "}
          <a
            href={`/e/${event.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{ color: "#fff" }}
          >
            pullup.se/e/{event.slug}
          </a>
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "24px",
            fontSize: "14px",
          }}
        >
          <span style={{ fontWeight: 600 }}>Overview</span>
          <button
            onClick={() => navigate(`/app/events/${id}/guests`)}
            style={{
              background: "transparent",
              border: "none",
              color: "#bbb",
              cursor: "pointer",
            }}
          >
            Guests
          </button>
        </div>

        <form
          onSubmit={handleSave}
          style={{
            background: "#0C0A12",
            padding: "24px",
            borderRadius: "16px",
          }}
        >
          <label
            style={{ display: "block", fontSize: "13px", marginBottom: "8px" }}
          >
            Title
            <input
              value={event.title || ""}
              onChange={(e) => setEvent({ ...event, title: e.target.value })}
              style={inputStyle}
            />
          </label>

          <label
            style={{ display: "block", fontSize: "13px", marginBottom: "8px" }}
          >
            Description
            <textarea
              value={event.description || ""}
              onChange={(e) =>
                setEvent({ ...event, description: e.target.value })
              }
              style={{ ...inputStyle, minHeight: "70px", resize: "vertical" }}
            />
          </label>

          <label
            style={{ display: "block", fontSize: "13px", marginBottom: "8px" }}
          >
            Location
            <input
              value={event.location || ""}
              onChange={(e) => setEvent({ ...event, location: e.target.value })}
              style={inputStyle}
            />
          </label>

          <label
            style={{ display: "block", fontSize: "13px", marginBottom: "16px" }}
          >
            Starts at
            <input
              type="datetime-local"
              value={event.startsAtLocal || ""}
              onChange={(e) =>
                setEvent({ ...event, startsAtLocal: e.target.value })
              }
              style={inputStyle}
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "10px 20px",
              borderRadius: "999px",
              border: "none",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </div>
    </div>
  );
}
