// frontend/src/components/ui/Stepper.jsx
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
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "#fff",
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
          background: "rgba(20, 16, 30, 0.6)",
          borderRadius: "12px",
          padding: "8px",
          border: "1px solid rgba(255, 255, 255, 0.1)",
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
            background:
              value <= min
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(139, 92, 246, 0.2)",
            color: value <= min ? "rgba(255, 255, 255, 0.3)" : "#fff",
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
              e.target.style.background = "rgba(139, 92, 246, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (value > min) {
              e.target.style.background = "rgba(139, 92, 246, 0.2)";
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
            color: "#fff",
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
            background:
              value >= max
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(139, 92, 246, 0.2)",
            color: value >= max ? "rgba(255, 255, 255, 0.3)" : "#fff",
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
              e.target.style.background = "rgba(139, 92, 246, 0.3)";
            }
          }}
          onMouseLeave={(e) => {
            if (value < max) {
              e.target.style.background = "rgba(139, 92, 246, 0.2)";
            }
          }}
        >
          +
        </button>
      </div>
      {helperText && (
        <div
          style={{
            color: "rgba(255, 255, 255, 0.6)",
            fontSize: "13px",
            marginTop: "6px",
          }}
        >
          {helperText}
        </div>
      )}
    </div>
  );
}
