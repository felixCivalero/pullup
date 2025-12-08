import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:3001";

export function HomePage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadEvents() {
      try {
        const res = await fetch(`${API_BASE}/events`);
        const data = await res.json();
        setEvents(data);
      } catch (err) {
        console.error("Failed to load events", err);
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, []);

  if (loading) {
    return (
      <div style={pageStyle}>
        <div>Loading events…</div>
      </div>
    );
  }

  // No events → empty state
  if (!events || events.length === 0) {
    return (
      <div style={pageStyle}>
        <div
          style={{
            background: "#0C0A12",
            padding: "32px",
            borderRadius: "24px",
            textAlign: "center",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            maxWidth: "480px",
            width: "100%",
          }}
        >
          <h2 style={{ marginBottom: "8px" }}>No PullUps yet</h2>
          <p style={{ opacity: 0.7, marginBottom: "24px" }}>
            Create your first event and start collecting RSVPs.
          </p>
          <button onClick={() => navigate("/create")} style={buttonStyle}>
            Create a PullUp
          </button>
        </div>
      </div>
    );
  }

  // Has events → list them
  return (
    <div style={pageStyle}>
      <div
        style={{
          background: "#0C0A12",
          padding: "32px",
          borderRadius: "24px",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
          width: "100%",
          maxWidth: "600px",
        }}
      >
        <h2 style={{ marginBottom: "16px" }}>Your PullUps</h2>

        {events.map((ev) => (
          <div
            key={ev.id}
            style={{
              padding: "16px",
              marginBottom: "12px",
              background: "#14101E",
              borderRadius: "12px",
            }}
          >
            <div style={{ fontSize: "18px", marginBottom: "4px" }}>
              {ev.title}
            </div>
            <div style={{ fontSize: "14px", opacity: 0.7 }}>
              {new Date(ev.startsAt).toLocaleString()}
            </div>

            <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
              <button
                style={miniButtonStyle}
                onClick={() => navigate(`/e/${ev.slug}`)}
              >
                Preview
              </button>

              <button
                style={miniButtonStyle}
                onClick={() => navigate(`/app/events/${ev.id}/manage`)}
              >
                Manage
              </button>
            </div>
          </div>
        ))}

        <button
          onClick={() => navigate("/create")}
          style={{ ...buttonStyle, marginTop: "16px" }}
        >
          Create another PullUp
        </button>
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  background: "#05040A",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
};

const buttonStyle = {
  padding: "12px 24px",
  borderRadius: "999px",
  border: "none",
  fontWeight: 600,
  fontSize: "15px",
  cursor: "pointer",
};

const miniButtonStyle = {
  padding: "8px 16px",
  borderRadius: "999px",
  border: "none",
  fontWeight: 500,
  fontSize: "14px",
  cursor: "pointer",
};
