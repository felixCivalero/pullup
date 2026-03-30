// frontend/src/components/ui/Button.jsx
import { colors } from "../../theme/colors.js";

export function Button({
  children,
  onClick,
  disabled = false,
  loading = false,
  variant = "primary", // primary, secondary, danger
  size = "md", // sm, md, lg
  fullWidth = false,
  type = "button",
  ...props
}) {
  const baseStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    border: "none",
    borderRadius: "14px",
    fontWeight: 800,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    overflow: "hidden",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    lineHeight: "1",
    ...props.style,
  };

  const sizeStyles = {
    sm: { padding: "10px 16px", fontSize: "14px", borderRadius: "10px" },
    md: { padding: "16px 24px", fontSize: "16px", borderRadius: "12px" },
    lg: { padding: "18px 32px", fontSize: "18px", borderRadius: "14px" },
  };

  const variantStyles = {
    primary: {
      background:
        disabled || loading
          ? "rgba(255, 255, 255, 0.1)"
          : "#fff",
      color: "#05040a",
      boxShadow:
        disabled || loading
          ? "none"
          : "0 6px 0 rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.3)",
    },
    secondary: {
      background:
        disabled || loading
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(255, 255, 255, 0.08)",
      color: "#fff",
      border: "1px solid rgba(255, 255, 255, 0.2)",
      backdropFilter: "blur(10px)",
    },
    danger: {
      background:
        disabled || loading
          ? "rgba(239, 68, 68, 0.2)"
          : "rgba(239, 68, 68, 0.8)",
      color: "#fff",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        ...baseStyle,
        ...sizeStyles[size],
        ...variantStyles[variant],
        width: fullWidth ? "100%" : "auto",
        maxWidth: fullWidth ? "100%" : "none",
        boxSizing: "border-box",
        opacity: disabled || loading ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          if (variant === "primary") {
            e.target.style.transform = "translateY(-1px)";
            e.target.style.boxShadow = "0 8px 0 rgba(0,0,0,0.12), 0 12px 32px rgba(0,0,0,0.35)";
          } else if (variant === "secondary") {
            e.target.style.transform = "translateY(-2px)";
            e.target.style.background = colors.gradientPrimarySoft;
            e.target.style.borderColor = colors.silverRgba;
            e.target.style.boxShadow = `0 4px 15px ${colors.silverShadow}`;
          }
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          e.target.style.transform = "translateY(0)";
          if (variant === "primary") {
            e.target.style.boxShadow = "0 6px 0 rgba(0,0,0,0.15), 0 8px 24px rgba(0,0,0,0.3)";
          } else if (variant === "secondary") {
            e.target.style.background =
              "linear-gradient(135deg, rgba(192, 192, 192, 0.12) 0%, rgba(232, 232, 232, 0.1) 100%)";
            e.target.style.borderColor = "rgba(255, 255, 255, 0.2)";
            e.target.style.boxShadow = "0 2px 10px rgba(192, 192, 192, 0.15)";
          }
        }
      }}
      onMouseDown={(e) => {
        if (!disabled && !loading && variant === "primary") {
          e.target.style.transform = "translateY(4px)";
          e.target.style.boxShadow = "0 2px 0 rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.2)";
        }
      }}
      onMouseUp={(e) => {
        if (!disabled && !loading && variant === "primary") {
          e.target.style.transform = "translateY(-1px)";
          e.target.style.boxShadow = "0 8px 0 rgba(0,0,0,0.12), 0 12px 32px rgba(0,0,0,0.35)";
        }
      }}
      {...props}
    >
      {loading && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            width: "16px",
            height: "16px",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }}
        />
      )}
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: "inherit" }}
      >
        {children}
      </span>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
