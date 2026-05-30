// frontend/src/components/ui/Input.jsx
import { colors } from "../../theme/colors.js";

export function Input({
  label,
  required = false,
  error,
  helperText,
  ...props
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
          {required && (
            <span style={{ color: colors.danger, marginLeft: "4px" }}>*</span>
          )}
        </label>
      )}
      <input
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: "12px",
          border: error
            ? `1px solid ${colors.danger}`
            : `1px solid ${colors.borderStrong}`,
          background: "#fff",
          color: colors.text,
          fontSize: "16px",
          outline: "none",
          boxSizing: "border-box",
          transition: "all 0.2s ease",
          WebkitAppearance: "none",
          appearance: "none",
          ...(error
            ? { boxShadow: `0 0 0 3px ${colors.dangerRgba}` }
            : {}),
        }}
        onFocus={(e) => {
          e.target.style.borderColor = colors.accent;
          e.target.style.boxShadow = `0 0 0 3px ${colors.accentSoftStrong}`;
        }}
        onBlur={(e) => {
          e.target.style.borderColor = error ? colors.danger : colors.borderStrong;
          e.target.style.boxShadow = error
            ? `0 0 0 3px ${colors.dangerRgba}`
            : "none";
        }}
        {...props}
      />
      {error && (
        <div style={{ color: colors.danger, fontSize: "14px", marginTop: "6px" }}>
          {error}
        </div>
      )}
      {helperText && !error && (
        <div style={{ color: colors.textMuted, fontSize: "14px", marginTop: "6px" }}>
          {helperText}
        </div>
      )}
    </div>
  );
}
