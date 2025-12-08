// frontend/src/components/EventCard.jsx

export function EventCard({ event, onRsvp, label = "Pull up" }) {
  if (!event) return null;

  const hasCapacity =
    typeof event.maxAttendees === "number" && event.maxAttendees > 0;
  const maxPlusOnes =
    typeof event.maxPlusOnesPerGuest === "number" &&
    event.maxPlusOnesPerGuest > 0
      ? event.maxPlusOnesPerGuest
      : 0;

  const dinnerEnabled = !!event.dinnerEnabled;
  const dinnerTimeLabel = event.dinnerTime
    ? new Date(event.dinnerTime).toLocaleString()
    : null;
  const dinnerSeats =
    typeof event.dinnerMaxSeats === "number" && event.dinnerMaxSeats > 0
      ? event.dinnerMaxSeats
      : null;

  return (
    <div
      style={{
        background:
          "linear-gradient(145deg, rgba(37, 19, 47, 0.9), rgba(66, 27, 79, 0.9))",
        padding: "clamp(24px, 5vw, 40px)",
        borderRadius: "24px",
        maxWidth: "480px",
        width: "100%",
        margin: "40px auto",
        boxShadow:
          "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
        color: "#fff",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.1)",
        transition: "all 0.3s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow =
          "0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(139, 92, 246, 0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow =
          "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)";
      }}
    >
      {event.imageUrl && (
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            borderRadius: "16px",
            overflow: "hidden",
            marginBottom: "24px",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <img
            src={event.imageUrl}
            alt={event.title}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </div>
      )}

      <div
        style={{
          fontSize: "11px",
          textTransform: "uppercase",
          opacity: 0.7,
          letterSpacing: "0.15em",
          fontWeight: 600,
          marginBottom: "16px",
        }}
      >
        PULLUP · EVENT
      </div>

      <h1
        style={{
          fontSize: "clamp(24px, 5vw, 32px)",
          margin: "0 0 8px 0",
          fontWeight: 700,
          lineHeight: "1.2",
        }}
      >
        {event.title}
      </h1>

      {event.description && (
        <p
          style={{
            fontSize: "clamp(14px, 2vw, 16px)",
            opacity: 0.8,
            lineHeight: "1.6",
            marginBottom: "24px",
          }}
        >
          {event.description}
        </p>
      )}

      <div
        style={{
          marginTop: "24px",
          fontSize: "clamp(13px, 2vw, 15px)",
          opacity: 0.9,
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {event.location && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>📍</span>
            <span>{event.location}</span>
          </div>
        )}
        {event.startsAt && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🕒</span>
            <span>{new Date(event.startsAt).toLocaleString()}</span>
          </div>
        )}

        {hasCapacity && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>👥</span>
            <span>Max {event.maxAttendees} attending</span>
          </div>
        )}

        {maxPlusOnes > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>➕</span>
            <span>Bring up to {maxPlusOnes} friends</span>
          </div>
        )}

        {dinnerEnabled && (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🍽️</span>
              <span>Dinner option available</span>
            </div>
            {dinnerTimeLabel && (
              <div
                style={{
                  fontSize: "12px",
                  opacity: 0.75,
                  paddingLeft: "24px",
                }}
              >
                Dinner at {dinnerTimeLabel}
              </div>
            )}
            {dinnerSeats && (
              <div
                style={{
                  fontSize: "12px",
                  opacity: 0.75,
                  paddingLeft: "24px",
                }}
              >
                {dinnerSeats} dinner seats
              </div>
            )}
          </div>
        )}
      </div>

      {onRsvp && (
        <button
          style={{
            marginTop: "32px",
            width: "100%",
            padding: "14px 20px",
            borderRadius: "999px",
            border: "none",
            background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "16px",
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(139, 92, 246, 0.4)",
            transition: "all 0.3s ease",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
          onClick={onRsvp}
          onMouseEnter={(e) => {
            e.target.style.transform = "translateY(-2px)";
            e.target.style.boxShadow = "0 15px 40px rgba(139, 92, 246, 0.6)";
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "0 10px 30px rgba(139, 92, 246, 0.4)";
          }}
        >
          {label}
        </button>
      )}
    </div>
  );
}
