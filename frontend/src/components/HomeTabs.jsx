import { colors } from "../theme/colors.js";

export function TabButton({ label, count, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "clamp(8px, 2vw, 10px) clamp(10px, 3vw, 18px)",
        borderRadius: "999px",
        border: active ? "none" : `1px solid ${colors.border}`,
        background: active ? colors.accent : "transparent",
        color: active ? "#fff" : colors.textMuted,
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
          e.currentTarget.style.color = colors.text;
          e.currentTarget.style.background = colors.surface;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = colors.textMuted;
          e.currentTarget.style.background = "transparent";
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
            background: active ? "rgba(255,255,255,0.25)" : colors.surfaceMuted,
            color: active ? "#fff" : colors.textSubtle,
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
        background: active ? colors.accentSoft : "transparent",
        color: active ? colors.accent : colors.textMuted,
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
          e.currentTarget.style.color = colors.text;
          e.currentTarget.style.background = colors.surface;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.color = colors.textMuted;
          e.currentTarget.style.background = "transparent";
        }
      }}
    >
      <span>{label}</span>
      {count > 0 && (
        <span
          style={{
            padding: "2px 6px",
            borderRadius: "10px",
            background: active ? colors.accentSoftStrong : colors.surfaceMuted,
            color: active ? colors.accent : colors.textSubtle,
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
          background: colors.surfaceMuted,
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
              active === "left" ? colors.background : "transparent",
            color:
              active === "left"
                ? colors.text
                : colors.textSubtle,
            fontWeight: active === "left" ? 600 : 400,
            fontSize: "11px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            whiteSpace: "nowrap",
            boxShadow: active === "left" ? `0 1px 4px ${colors.border}` : "none",
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
            background: colors.border,
          }}
        />
        <button
          onClick={() => onChange("right")}
          style={{
            padding: "4px 10px",
            borderRadius: "999px",
            border: "none",
            background:
              active === "right" ? colors.background : "transparent",
            color:
              active === "right"
                ? colors.text
                : colors.textSubtle,
            fontWeight: active === "right" ? 600 : 400,
            fontSize: "11px",
            cursor: "pointer",
            transition: "all 0.2s ease",
            whiteSpace: "nowrap",
            boxShadow: active === "right" ? `0 1px 4px ${colors.border}` : "none",
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
