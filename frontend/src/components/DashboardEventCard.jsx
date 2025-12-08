// Host-side event card (Home dashboard)

export function getEventStatus(event) {
  const now = new Date();
  const start = new Date(event.startsAt);
  const end = event.endsAt ? new Date(event.endsAt) : null;

  if (end && now > end) return "past";
  if (now >= start && (!end || now <= end)) return "ongoing";
  return "upcoming";
}

export function DashboardEventCard({ event, onPreview, onManage }) {
  const status = getEventStatus(event);
  const isLive = status === "ongoing";

  return (
    <div
      style={{
        padding: "20px",
        background: "rgba(20, 16, 30, 0.6)",
        borderRadius: "16px",
        border: "1px solid rgba(255,255,255,0.05)",
        transition: "all 0.3s ease",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.borderColor = "rgba(139, 92, 246, 0.3)";
        e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
        e.currentTarget.style.boxShadow = "none";
      }}
      onClick={onManage}
    >
      {event.imageUrl && (
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            borderRadius: "12px",
            overflow: "hidden",
            marginBottom: "16px",
            background: "rgba(0,0,0,0.2)",
          }}
        >
          <img
            src={event.imageUrl}
            alt={event.title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "12px",
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "clamp(18px, 3vw, 22px)",
              fontWeight: 600,
              marginBottom: "8px",
            }}
          >
            {event.title}
          </div>
          <div
            style={{
              fontSize: "14px",
              opacity: 0.7,
              marginBottom: "8px",
            }}
          >
            {new Date(event.startsAt).toLocaleString()}
          </div>
        </div>

        {isLive && (
          <div
            style={{
              padding: "4px 12px",
              borderRadius: "12px",
              background: "rgba(34, 197, 94, 0.25)",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              whiteSpace: "nowrap",
              color: "#bbf7d0",
            }}
          >
            Live
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            window.open(
              `${window.location.origin}${onPreview}`,
              "_blank",
              "noopener,noreferrer"
            );
          }}
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.05)",
            color: "#fff",
            fontWeight: 500,
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.3s ease",
            backdropFilter: "blur(10px)",
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "rgba(255,255,255,0.1)";
            e.target.style.borderColor = "rgba(255,255,255,0.3)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "rgba(255,255,255,0.05)";
            e.target.style.borderColor = "rgba(255,255,255,0.2)";
          }}
        >
          Preview
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onManage();
          }}
          style={{
            padding: "8px 16px",
            borderRadius: "999px",
            border: "none",
            background: "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "13px",
            cursor: "pointer",
            transition: "all 0.3s ease",
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = "translateY(-1px)";
            e.target.style.boxShadow = "0 8px 20px rgba(139, 92, 246, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "none";
          }}
        >
          Manage
        </button>
      </div>
    </div>
  );
}
