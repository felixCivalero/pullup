// The page's look (events.look, migrations/159): a background colour and a
// font. Every colour on the event page reads CSS variables set here, so text,
// lines, the sign-up and its button follow the background: dark ink on a
// light page, white on a dark one. No look (events made before 2026-11-05) =
// the original dark page, which is also each variable's fallback.

export const LOOK_FONTS = [
  { id: "standard", label: "Standard", stack: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" },
  { id: "grotesk", label: "Grotesk", stack: "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif", google: "Space+Grotesk:wght@400;500;600;700" },
  { id: "serif", label: "Serif", stack: "'Playfair Display', Georgia, 'Times New Roman', serif", google: "Playfair+Display:wght@400;600;700;800" },
  { id: "mono", label: "Mono", stack: "'Space Mono', ui-monospace, SFMono-Regular, Menlo, monospace", google: "Space+Mono:wght@400;700" },
  { id: "rounded", label: "Rund", stack: "'Nunito', ui-rounded, 'SF Pro Rounded', -apple-system, sans-serif", google: "Nunito:wght@400;600;700;800" },
];

export const LOOK_COLORS = [
  { bg: "#ffffff", label: "Vit" },
  { bg: "#f4efe6", label: "Krita" },
  { bg: "#05040a", label: "Svart" },
  { bg: "#14213d", label: "Natt" },
  { bg: "#1f3d2b", label: "Skog" },
  { bg: "#ec178f", label: "Rosa" },
];

const DARK = "#05040a";

function rgb(hex) {
  const h = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.slice(1) : DARK.slice(1);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

// Relative luminance (WCAG): above ~0.45 the page reads as light.
export function isLight(hex) {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

export const fontOf = (look) => LOOK_FONTS.find((f) => f.id === look?.font) || LOOK_FONTS[0];

// The CSS variables for a page root's style.
export function lookVars(look) {
  if (!look) return {};
  const bg = look.bg || DARK;
  const light = isLight(bg);
  // On a strong colour (pink, blue…) the date takes the text colour; the
  // green date is for near-black and near-white pages.
  const [r, g, b] = rgb(bg);
  const vivid = Math.max(r, g, b) - Math.min(r, g, b) > 70;
  return {
    "--pg-bg": bg,
    "--pg-bg-rgb": rgb(bg).join(","),
    "--pg-ink": light ? "#0a0a0a" : "#ffffff",
    "--pg-ink-rgb": light ? "10,10,10" : "255,255,255",
    "--pg-date": vivid ? (light ? "#0a0a0a" : "#ffffff") : light ? "#4d7c0f" : "#a3e635",
    "--pg-font": fontOf(look).stack,
    fontFamily: fontOf(look).stack,
    colorScheme: light ? "light" : "dark",
  };
}

// Loads the chosen font from Google Fonts once per page.
export function loadLookFont(look) {
  const f = fontOf(look);
  if (!f.google || typeof document === "undefined") return;
  const id = `pg-font-${f.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  document.head.appendChild(link);
}
