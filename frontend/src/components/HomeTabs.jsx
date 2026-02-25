export function TabButton({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "clamp(8px, 2vw, 10px) clamp(10px, 3vw, 18px)",
        borderRadius: "999px",
        border: "none",
        background: active
          ? "linear-gradient(135deg, #f5f5f5 0%, #d4d4d4 45%, #a3a3a3 100%)"
          : "transparent",
        color: active ? "#05040a" : "rgba(255,255,255,0.7)",
        fontWeight: active ? 600 : 500,
        fontSize: "clamp(11px, 2.5vw, 14px)",
        cursor: "pointer",
        transition: "all 0.2s ease",
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
          e.target.style.background = "rgba(255,255,255,0.06)";
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
              ? "rgba(192, 192, 192, 0.3)"
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
        background: active ? "rgba(192, 192, 192, 0.15)" : "transparent",
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
          e.target.style.background = "rgba(192, 192, 192, 0.08)";
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
              ? "rgba(192, 192, 192, 0.3)"
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

export function SubTabToggle({
  leftLabel,
  leftCount,
  rightLabel,
  rightCount,
  active, // "left" | "right"
  onChange,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        marginBottom: "16px",
        marginTop: "-8px",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          gap: "8px",
          alignItems: "center",
          padding: "4px",
          background: "rgba(255,255,255,0.02)",
          borderRadius: "999px",
        }}
      >
        <button
          onClick={() => onChange("left")}
          style={{
            padding: "4px 10px",
            borderRadius: "999px",
            border: "none",
            background:
              active === "left" ? "rgba(255,255,255,0.08)" : "transparent",
            color:
              active === "left"
                ? "rgba(255,255,255,0.9)"
                : "rgba(255,255,255,0.4)",
            fontWeight: active === "left" ? 500 : 400,
            fontSize: "11px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            whiteSpace: "nowrap",
          }}
        >
          {leftLabel}
          {leftCount > 0 && (
            <span style={{ marginLeft: "4px", opacity: 0.6 }}>
              ({leftCount})
            </span>
          )}
        </button>
        <div
          style={{
            width: "1px",
            height: "12px",
            background: "rgba(255,255,255,0.1)",
          }}
        />
        <button
          onClick={() => onChange("right")}
          style={{
            padding: "4px 10px",
            borderRadius: "999px",
            border: "none",
            background:
              active === "right" ? "rgba(255,255,255,0.08)" : "transparent",
            color:
              active === "right"
                ? "rgba(255,255,255,0.9)"
                : "rgba(255,255,255,0.4)",
            fontWeight: active === "right" ? 500 : 400,
            fontSize: "11px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            whiteSpace: "nowrap",
          }}
        >
          {rightLabel}
          {rightCount > 0 && (
            <span style={{ marginLeft: "4px", opacity: 0.6 }}>
              ({rightCount})
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
