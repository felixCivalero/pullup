/**
 * PullUp theme: crisp, fresh, modern with a bling silver feel.
 * Inspired by high-fashion runway — silver metallics, deep black, clean contrast.
 */

export const colors = {
  // Base
  background: "#05040a",
  backgroundElevated: "rgba(12, 10, 18, 0.6)",
  backgroundCard: "rgba(20, 16, 30, 0.6)",
  backgroundOverlay: "rgba(12, 10, 18, 0.95)",

  // Silver / bling primary
  silver: "#c0c0c0",
  silverLight: "#e8e8e8",
  silverBright: "#f0f0f0",
  silverMuted: "#a8a8a8",
  silverText: "#e5e5e5",
  silverTextMuted: "#d4d4d4",

  // Gradients (replacing purple/pink)
  gradientPrimary:
    "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
  gradientPrimarySoft:
    "linear-gradient(135deg, rgba(240, 240, 240, 0.15) 0%, rgba(192, 192, 192, 0.2) 100%)",
  gradientGlow:
    "radial-gradient(circle at 20% 50%, rgba(192, 192, 192, 0.12) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 232, 232, 0.08) 0%, transparent 50%)",
  gradientCursorGlow: "radial-gradient(circle, rgba(192, 192, 192, 0.1) 0%, transparent 70%)",

  // RGBA for shadows, borders, hovers
  silverRgba: "rgba(192, 192, 192, 0.3)",
  silverRgbaLight: "rgba(232, 232, 232, 0.25)",
  silverRgbaBorder: "rgba(255, 255, 255, 0.15)",
  silverRgbaHover: "rgba(192, 192, 192, 0.2)",
  silverRgbaStrong: "rgba(192, 192, 192, 0.4)",
  silverShadow: "rgba(192, 192, 192, 0.25)",
  silverShadowHover: "rgba(192, 192, 192, 0.35)",

  // Text
  text: "#fff",
  textMuted: "rgba(255, 255, 255, 0.85)",
  textSubtle: "rgba(255, 255, 255, 0.7)",
  textFaded: "rgba(255, 255, 255, 0.5)",

  // Semantic (keep for success/warning/error)
  success: "#22c55e",
  successRgba: "rgba(34, 197, 94, 0.25)",
  warning: "#f59e0b",
  warningRgba: "rgba(245, 158, 11, 0.25)",
  danger: "rgba(239, 68, 68, 0.8)",
  info: "#3b82f6",
  infoRgba: "rgba(59, 130, 246, 0.2)",
};

/** Silver detail styling for Lucide icons — use as default for icon color/size */
export const iconStyle = {
  color: colors.silverText,
  opacity: 0.95,
  flexShrink: 0,
};

/** Glitter: silver diamond / jewelry lit in darkness — soft glow + shimmer */
export const glitter = {
  // Multi-layer drop-shadow so icons look lit from within (like silver in low light)
  filter:
    "drop-shadow(0 0 1px rgba(255,255,255,0.95)) drop-shadow(0 0 4px rgba(232,232,255,0.6)) drop-shadow(0 0 10px rgba(192,192,220,0.25))",
  filterMuted:
    "drop-shadow(0 0 1px rgba(255,255,255,0.7)) drop-shadow(0 0 3px rgba(232,232,255,0.35))",
};
