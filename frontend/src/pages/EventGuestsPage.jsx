import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";

const API_BASE = "http://localhost:3001";

const pageStyle = {
  minHeight: "100vh",
  background: "#05040A",
  color: "#fff",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const shellStyle = {
  maxWidth: "800px",
  margin: "0 auto",
  padding: "32px 16px",
};

export function EventGuestsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${API_BASE}/host/events/${id}/guests`);
        if (!res.ok) throw new Error("Failed to load guests");
        const data = await res.json();
        setEvent(data.event);
        setGuests(data.guests || []);
      } catch (err) {
        console.error(err);
        alert("Could not load guests");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>Loading guests…</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div style={pageStyle}>
        <div style={shellStyle}>Event not found.</div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        <div style={{ marginBottom: "16px", fontSize: "14px", opacity: 0.7 }}>
          <Link to="/home" style={{ color: "#aaa", textDecoration: "none" }}>
            ← Back to home
          </Link>
        </div>

        <h1 style={{ marginBottom: "4px" }}>{event.title}</h1>
        <div style={{ marginBottom: "16px", fontSize: "13px", opacity: 0.8 }}>
          Guests
        </div>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "24px",
            fontSize: "14px",
          }}
        >
          <button
            onClick={() => navigate(`/app/events/${id}/manage`)}
            style={{
              background: "transparent",
              border: "none",
              color: "#bbb",
              cursor: "pointer",
            }}
          >
            Overview
          </button>
          <span style={{ fontWeight: 600 }}>Guests</span>
        </div>

        {guests.length === 0 ? (
          <div
            style={{
              background: "#0C0A12",
              padding: "24px",
              borderRadius: "16px",
              textAlign: "center",
              opacity: 0.8,
            }}
          >
            No guests yet. Share your link to get people to pull up.
          </div>
        ) : (
          <div
            style={{
              background: "#0C0A12",
              padding: "24px",
              borderRadius: "16px",
            }}
          >
            {guests.map((g) => (
              <div
                key={g.id}
                style={{
                  padding: "12px 0",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  fontSize: "14px",
                }}
              >
                <div>{g.email}</div>
                <div style={{ fontSize: "12px", opacity: 0.6 }}>
                  {new Date(g.createdAt).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
