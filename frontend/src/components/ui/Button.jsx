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
  const off = disabled || loading;

  const baseStyle = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    border: "1px solid transparent",
    borderRadius: "999px",
    fontWeight: 700,
    letterSpacing: "0.01em",
    cursor: off ? "not-allowed" : "pointer",
    transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
    position: "relative",
    overflow: "hidden",
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    lineHeight: "1",
    ...props.style,
  };

  const sizeStyles = {
    sm: { padding: "10px 18px", fontSize: "14px" },
    md: { padding: "14px 26px", fontSize: "15px" },
    lg: { padding: "17px 34px", fontSize: "17px" },
  };

  const variantStyles = {
    primary: {
      background: off ? colors.surfaceMuted : colors.accent,
      color: off ? colors.textFaded : "#fff",
      boxShadow: off ? "none" : colors.accentShadow,
    },
    secondary: {
      background: "#fff",
      color: colors.text,
      border: `1px solid ${colors.borderStrong}`,
    },
    danger: {
      background: off ? colors.dangerRgba : colors.danger,
      color: off ? colors.textFaded : "#fff",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={off}
      style={{
        ...baseStyle,
        ...sizeStyles[size],
        ...variantStyles[variant],
        width: fullWidth ? "100%" : "auto",
        maxWidth: fullWidth ? "100%" : "none",
        boxSizing: "border-box",
        opacity: off ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (off) return;
        e.currentTarget.style.transform = "translateY(-1px)";
        if (variant === "primary") {
          e.currentTarget.style.background = colors.accentHover;
          e.currentTarget.style.boxShadow = "0 8px 22px rgba(236, 23, 143, 0.34)";
        } else if (variant === "secondary") {
          e.currentTarget.style.background = colors.surface;
          e.currentTarget.style.borderColor = colors.accentBorder;
        }
      }}
      onMouseLeave={(e) => {
        if (off) return;
        e.currentTarget.style.transform = "translateY(0)";
        if (variant === "primary") {
          e.currentTarget.style.background = colors.accent;
          e.currentTarget.style.boxShadow = colors.accentShadow;
        } else if (variant === "secondary") {
          e.currentTarget.style.background = "#fff";
          e.currentTarget.style.borderColor = colors.borderStrong;
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
            border: `2px solid ${variant === "secondary" ? colors.border : "rgba(255,255,255,0.45)"}`,
            borderTopColor: variant === "secondary" ? colors.accent : "#fff",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }}
        />
      )}
      <span style={{ display: "inline-flex", alignItems: "center", gap: "inherit" }}>
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
