export function TabButton({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "clamp(6px, 1.5vw, 8px) clamp(8px, 2vw, 14px)",
        borderRadius: "8px",
        border: "none",
        background: active ? "rgba(139, 92, 246, 0.2)" : "transparent",
        color: active ? "#fff" : "rgba(255,255,255,0.6)",
        fontWeight: active ? 600 : 500,
        fontSize: "clamp(11px, 2.5vw, 14px)",
        cursor: "pointer",
        transition: "all 0.2s ease",
        borderBottom: active ? "2px solid #8b5cf6" : "2px solid transparent",
        marginBottom: "-12px",
        display: "flex",
        alignItems: "center",
        gap: "clamp(4px, 1vw, 6px)",
        whiteSpace: "nowrap",
        touchAction: "manipulation",
        flex: "1 1 0",
        justifyContent: "center",
        minWidth: 0,
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
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </span>
      {count !== undefined && count > 0 && (
        <span
          style={{
            padding: "2px clamp(4px, 1vw, 6px)",
            borderRadius: "12px",
            background: active
              ? "rgba(139, 92, 246, 0.3)"
              : "rgba(255,255,255,0.1)",
            fontSize: "clamp(9px, 2vw, 11px)",
            fontWeight: 600,
            minWidth: "clamp(16px, 4vw, 20px)",
            textAlign: "center",
            flexShrink: 0,
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
