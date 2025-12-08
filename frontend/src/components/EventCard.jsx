// frontend/src/components/EventCard.jsx
export function EventCard({ event, onRsvp, label = "Pull up" }) {
  if (!event) return null;

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
      <div
        style={{
          background: "linear-gradient(145deg, #25132F, #421B4F)",
          padding: "32px",
          borderRadius: "24px",
          maxWidth: "420px",
          width: "100%",
          boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div
          style={{ fontSize: "12px", textTransform: "uppercase", opacity: 0.7 }}
        >
          PULLUP · EVENT
        </div>
        <h1 style={{ fontSize: "28px", margin: "12px 0 4px" }}>
          {event.title}
        </h1>
        {event.description && (
          <p style={{ fontSize: "14px", opacity: 0.8 }}>{event.description}</p>
        )}

        <div style={{ marginTop: "20px", fontSize: "14px", opacity: 0.9 }}>
          {event.location && <div>📍 {event.location}</div>}
          {event.startsAt && (
            <div style={{ marginTop: "4px" }}>
              🕒 {new Date(event.startsAt).toLocaleString()}
            </div>
          )}
        </div>

        {onRsvp && (
          <button
            style={{
              marginTop: "24px",
              width: "100%",
              padding: "12px 16px",
              borderRadius: "999px",
              border: "none",
              fontWeight: 600,
              fontSize: "15px",
              cursor: "pointer",
            }}
            onClick={onRsvp}
          >
            {label}
          </button>
        )}
      </div>
    </div>
  );
}
