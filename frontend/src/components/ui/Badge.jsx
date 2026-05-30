// frontend/src/components/ui/Badge.jsx
import { colors } from "../../theme/colors.js";

export function Badge({ children, variant = "default", ...props }) {
  const variants = {
    default: {
      background: colors.surfaceMuted,
      border: `1px solid ${colors.border}`,
      color: colors.textMuted,
    },
    accent: {
      background: colors.accentSoft,
      border: `1px solid ${colors.accentBorder}`,
      color: colors.accent,
    },
    success: {
      background: colors.successRgba,
      border: `1px solid rgba(22, 163, 74, 0.30)`,
      color: colors.success,
    },
    warning: {
      background: colors.warningRgba,
      border: `1px solid rgba(180, 83, 9, 0.30)`,
      color: colors.warning,
    },
    danger: {
      background: colors.dangerRgba,
      border: `1px solid rgba(220, 38, 38, 0.30)`,
      color: colors.danger,
    },
  };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "5px 11px",
        borderRadius: "999px",
        fontSize: "12px",
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
