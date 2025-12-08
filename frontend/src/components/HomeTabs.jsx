export function TabButton({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 16px",
        borderRadius: "8px",
        border: "none",
        background: active ? "rgba(139, 92, 246, 0.2)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        fontWeight: active ? 600 : 500,
        fontSize: "14px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        borderBottom: active ? "2px solid #8b5cf6" : "2px solid transparent",
        marginBottom: "-16px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.target.style.color = "rgba(255,255,255,0.9)";
          e.target.style.background = "rgba(139, 92, 246, 0.1)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.target.style.color = "rgba(255,255,255,0.6)";
          e.target.style.background = "transparent";
        }
      }}
    >
      <span>{label}</span>
      {count !== undefined && count > 0 && (
        <span
          style={{
            padding: "2px 8px",
            borderRadius: "12px",
            background: active
              ? "rgba(139, 92, 246, 0.3)"
              : "rgba(255,255,255,0.1)",
            fontSize: "12px",
            fontWeight: 600,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export function FilterButton({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px",
        borderRadius: "8px",
        border: "none",
        background: active ? "rgba(139, 92, 246, 0.15)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        fontWeight: active ? 600 : 500,
        fontSize: "13px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.target.style.color = "rgba(255,255,255,0.9)";
          e.target.style.background = "rgba(139, 92, 246, 0.08)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.target.style.color = "rgba(255,255,255,0.6)";
          e.target.style.background = "transparent";
        }
      }}
    >
      <span>{label}</span>
      {count > 0 && (
        <span
          style={{
            padding: "2px 6px",
            borderRadius: "10px",
            background: active
              ? "rgba(139, 92, 246, 0.3)"
              : "rgba(255,255,255,0.1)",
            fontSize: "11px",
            fontWeight: 600,
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}
