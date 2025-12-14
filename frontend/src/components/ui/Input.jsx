// frontend/src/components/ui/Input.jsx
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
            fontSize: "16px",
            fontWeight: 600,
            marginBottom: "8px",
            color: "#fff",
          }}
        >
          {label}
          {required && (
            <span style={{ color: "#ef4444", marginLeft: "4px" }}>*</span>
          )}
        </label>
      )}
      <input
        style={{
          width: "100%",
          padding: "14px 16px",
          borderRadius: "12px",
          border: error
            ? "1px solid #ef4444"
            : "1px solid rgba(255, 255, 255, 0.2)",
          background: "rgba(20, 16, 30, 0.6)",
          color: "#fff",
          fontSize: "16px",
          outline: "none",
          boxSizing: "border-box",
          transition: "all 0.2s ease",
          WebkitAppearance: "none",
          appearance: "none",
          ...(error
            ? {
                boxShadow: "0 0 0 3px rgba(239, 68, 68, 0.1)",
              }
            : {}),
        }}
        onFocus={(e) => {
          e.target.style.borderColor = "#8b5cf6";
          e.target.style.boxShadow = "0 0 0 3px rgba(139, 92, 246, 0.1)";
        }}
        onBlur={(e) => {
          e.target.style.borderColor = error
            ? "#ef4444"
            : "rgba(255, 255, 255, 0.2)";
          e.target.style.boxShadow = error
            ? "0 0 0 3px rgba(239, 68, 68, 0.1)"
            : "none";
        }}
        {...props}
      />
      {error && (
        <div
          style={{
            color: "#ef4444",
            fontSize: "16px",
            marginTop: "6px",
          }}
        >
          {error}
        </div>
      )}
      {helperText && !error && (
        <div
          style={{
            color: "rgba(255, 255, 255, 0.6)",
            fontSize: "16px",
            marginTop: "6px",
          }}
        >
          {helperText}
        </div>
      )}
    </div>
  );
}
