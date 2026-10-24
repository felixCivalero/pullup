// The mail module's palette — the admin's look (black on white, grey
// surfaces, orange for tokens and highlights) instead of the old app's pink
// and teal. Same keys as theme/colors.js so the restored components didn't
// change; only their import did. The email content keeps its own colours.
import { colors as base } from "../../theme/colors.js";

export const colors = {
  ...base,
  background: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f4f4f5",
  accent: "#0a0a0a",
  accentHover: "#000000",
  accentSoft: "rgba(10, 10, 10, 0.045)",
  accentSoftStrong: "rgba(10, 10, 10, 0.08)",
  accentBorder: "rgba(10, 10, 10, 0.16)",
  accentShadow: "none",
  secondary: "#D9480F",
  secondaryHover: "#b83c0c",
  secondarySoft: "rgba(217, 72, 15, 0.08)",
  secondarySoftStrong: "rgba(217, 72, 15, 0.14)",
  secondaryBorder: "rgba(217, 72, 15, 0.28)",
  text: "#0a0a0a",
  textMuted: "#3a3a3e",
  textSubtle: "#6e6e73",
  textFaded: "#a1a1aa",
  border: "rgba(0, 0, 0, 0.1)",
  borderStrong: "rgba(0, 0, 0, 0.16)",
  borderFaint: "rgba(0, 0, 0, 0.06)",
  success: "#1f7a3a",
  successRgba: "rgba(31, 122, 58, 0.1)",
  danger: "#D9480F",
};
