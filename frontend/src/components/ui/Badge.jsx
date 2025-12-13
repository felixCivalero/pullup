// frontend/src/components/ui/Badge.jsx
export function Badge({ children, variant = "default", ...props }) {
  const variants = {
    default: {
      background: "rgba(139, 92, 246, 0.2)",
      border: "1px solid rgba(139, 92, 246, 0.4)",
      color: "#a78bfa",
    },
    success: {
      background: "rgba(16, 185, 129, 0.2)",
      border: "1px solid rgba(16, 185, 129, 0.4)",
      color: "#10b981",
    },
    warning: {
      background: "rgba(245, 158, 11, 0.2)",
      border: "1px solid rgba(245, 158, 11, 0.4)",
      color: "#f59e0b",
    },
    danger: {
      background: "rgba(239, 68, 68, 0.2)",
      border: "1px solid rgba(239, 68, 68, 0.4)",
      color: "#ef4444",
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 12px",
        borderRadius: "8px",
        fontSize: "13px",
        fontWeight: 600,
        ...variants[variant],
        ...props.style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
