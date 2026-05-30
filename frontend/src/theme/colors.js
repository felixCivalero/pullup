/**
 * PullUp theme — the brand, carried inward.
 * White canvas, near-black ink, one screamy-pink accent, a calm teal for
 * functional highlights (dates, hover-to-preview). Strict and simple.
 *
 * Old silver/gold token names are kept as light-theme aliases so existing
 * consumers keep working; prefer the semantic names (accent / secondary /
 * text / border / surface) in new and migrated code.
 */

export const colors = {
  // ── Base: light canvas ──
  background: "#ffffff",
  backgroundElevated: "#ffffff",
  backgroundCard: "#ffffff",
  backgroundOverlay: "rgba(255, 255, 255, 0.96)",
  surface: "#fafafa",
  surfaceMuted: "#f4f4f5",

  // ── Brand accent: screamy pink (the one loud accent) ──
  accent: "#ec178f",
  accentHover: "#d1147f",
  accentActive: "#b81270",
  accentSoft: "rgba(236, 23, 143, 0.08)",
  accentSoftStrong: "rgba(236, 23, 143, 0.14)",
  accentBorder: "rgba(236, 23, 143, 0.30)",
  accentText: "#ec178f",
  accentShadow: "0 6px 18px rgba(236, 23, 143, 0.28)",

  // ── Secondary: calm teal (dates, hover-to-preview, email-preview accents) ──
  secondary: "#0d9488",
  secondaryHover: "#0f766e",
  secondarySoft: "rgba(13, 148, 136, 0.08)",
  secondarySoftStrong: "rgba(13, 148, 136, 0.14)",
  secondaryBorder: "rgba(13, 148, 136, 0.28)",

  // ── Text: near-black on white ──
  text: "#0a0a0a",
  textMuted: "rgba(10, 10, 10, 0.62)",
  textSubtle: "rgba(10, 10, 10, 0.45)",
  textFaded: "rgba(10, 10, 10, 0.30)",

  // ── Borders / hairlines ──
  border: "rgba(10, 10, 10, 0.10)",
  borderStrong: "rgba(10, 10, 10, 0.16)",
  borderFaint: "rgba(10, 10, 10, 0.06)",

  // ── Status ──
  live: "#16a34a",
  draft: "rgba(10, 10, 10, 0.40)",
  success: "#16a34a",
  successRgba: "rgba(22, 163, 74, 0.12)",
  warning: "#b45309",
  warningRgba: "rgba(180, 83, 9, 0.12)",
  danger: "#dc2626",
  dangerRgba: "rgba(220, 38, 38, 0.10)",
  info: "#0d9488",
  infoRgba: "rgba(13, 148, 136, 0.12)",

  // ── Admin: deep amber, legible on white (gold dies on a light canvas) ──
  gold: "#b45309",
  goldRgba: "rgba(180, 83, 9, 0.9)",
  goldShadow: "0 0 0 rgba(0,0,0,0)",
  gradientGold: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",

  // ── Backward-compat aliases (old silver names → light-theme values) ──
  silver: "#0a0a0a",
  silverLight: "#0a0a0a",
  silverBright: "#0a0a0a",
  silverMuted: "rgba(10, 10, 10, 0.62)",
  silverText: "#0a0a0a",
  silverTextMuted: "rgba(10, 10, 10, 0.62)",
  gradientPrimary: "#ec178f",
  gradientPrimarySoft: "rgba(236, 23, 143, 0.08)",
  gradientGlow: "none",
  gradientCursorGlow: "none",
  silverRgba: "rgba(10, 10, 10, 0.10)",
  silverRgbaLight: "rgba(10, 10, 10, 0.06)",
  silverRgbaBorder: "rgba(10, 10, 10, 0.10)",
  silverRgbaHover: "rgba(10, 10, 10, 0.05)",
  silverRgbaStrong: "rgba(10, 10, 10, 0.16)",
  silverShadow: "rgba(10, 10, 10, 0.08)",
  silverShadowHover: "rgba(10, 10, 10, 0.12)",
};

/** Default styling for Lucide icons — near-black ink, no glow on white. */
export const iconStyle = {
  color: colors.text,
  opacity: 0.9,
  flexShrink: 0,
};

/** Kept for compatibility — no glow on the light canvas. */
export const glitter = {
  filter: "none",
  filterMuted: "none",
};
