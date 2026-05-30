// frontend/src/components/ui/Stepper.jsx
import { colors } from "../../theme/colors.js";

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 10,
  label,
  helperText,
}) {
  return (
    <div style={{ marginBottom: "20px" }}>
      {label && (
        <label
          style={{
            display: "block",
            fontSize: "15px",
            fontWeight: 600,
            marginBottom: "8px",
            color: colors.text,
          }}
        >
          {label}
        </label>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          background: "#fff",
          borderRadius: "12px",
          padding: "8px",
          border: `1px solid ${colors.borderStrong}`,
        }}
      >
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "10px",
            border: "none",
            background: value <= min ? colors.surfaceMuted : colors.accentSoft,
            color: value <= min ? colors.textFaded : colors.accent,
            fontSize: "22px",
            fontWeight: 600,
            cursor: value <= min ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
            WebkitTapHighlightColor: "transparent",
          }}
          onMouseEnter={(e) => {
            if (value > min) {
              e.target.style.background = colors.accentSoftStrong;
            }
          }}
          onMouseLeave={(e) => {
            if (value > min) {
              e.target.style.background = colors.accentSoft;
            }
          }}
        >
          −
        </button>
        <div
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: "20px",
            fontWeight: 700,
            color: colors.text,
          }}
        >
          {value}
        </div>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          style={{
            width: "44px",
            height: "44px",
            borderRadius: "10px",
            border: "none",
            background: value >= max ? colors.surfaceMuted : colors.accentSoft,
            color: value >= max ? colors.textFaded : colors.accent,
            fontSize: "22px",
            fontWeight: 600,
            cursor: value >= max ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
            WebkitTapHighlightColor: "transparent",
          }}
          onMouseEnter={(e) => {
            if (value < max) {
              e.target.style.background = colors.accentSoftStrong;
            }
          }}
          onMouseLeave={(e) => {
            if (value < max) {
              e.target.style.background = colors.accentSoft;
            }
          }}
        >
          +
        </button>
      </div>
      {helperText && (
        <div
          style={{
            color: colors.textMuted,
            fontSize: "14px",
            marginTop: "6px",
          }}
        >
          {helperText}
        </div>
      )}
    </div>
  );
}
