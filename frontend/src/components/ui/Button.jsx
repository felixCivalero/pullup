// frontend/src/components/ui/Button.jsx
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
    gap: "8px",
    border: "none",
    borderRadius: "12px",
    fontWeight: 600,
    cursor: disabled || loading ? "not-allowed" : "pointer",
    transition: "all 0.2s ease",
    position: "relative",
    overflow: "hidden",
    ...props.style,
  };

  const sizeStyles = {
    sm: { padding: "10px 16px", fontSize: "14px" },
    md: { padding: "16px 24px", fontSize: "16px" },
    lg: { padding: "20px 32px", fontSize: "18px" },
  };

  const variantStyles = {
    primary: {
      background:
        disabled || loading
          ? "rgba(255, 255, 255, 0.1)"
          : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
      color: "#fff",
      boxShadow:
        disabled || loading ? "none" : "0 4px 20px rgba(139, 92, 246, 0.3)",
    },
    secondary: {
      background:
        disabled || loading
          ? "rgba(255, 255, 255, 0.05)"
          : "rgba(255, 255, 255, 0.1)",
      color: "#fff",
      border: "1px solid rgba(255, 255, 255, 0.2)",
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
        opacity: disabled || loading ? 0.6 : 1,
      }}
      onMouseEnter={(e) => {
        if (!disabled && !loading) {
          e.target.style.transform = "translateY(-2px)";
          if (variant === "primary") {
            e.target.style.boxShadow = "0 6px 25px rgba(139, 92, 246, 0.4)";
          }
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled && !loading) {
          e.target.style.transform = "translateY(0)";
          if (variant === "primary") {
            e.target.style.boxShadow = "0 4px 20px rgba(139, 92, 246, 0.3)";
          }
        }
      }}
      {...props}
    >
      {loading && (
        <span
          style={{
            display: "inline-block",
            width: "16px",
            height: "16px",
            border: "2px solid rgba(255, 255, 255, 0.3)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            animation: "spin 0.6s linear infinite",
          }}
        />
      )}
      <span>{children}</span>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
