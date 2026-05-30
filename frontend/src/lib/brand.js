// frontend/src/lib/brand.js
//
// Host brand identity utilities.
//
//   FONTS                    — curated webfont catalog
//   PALETTES                 — five starter presets the editor surfaces
//   resolveBrand(hostBrand)  — applies defaults + auto-contrast, returns
//                              a fully-resolved token bundle the renderer
//                              can rely on (no null-checks downstream)
//   loadFont(fontName)       — lazily injects the Google Fonts <link>
//   pickTextColor(bgHex)     — WCAG-style contrast pair from a background
//
// The contract: any guest-facing surface (event page, email mockup, RSVP
// form embed) reads from `resolveBrand(event.hostBrand)`. If the host
// hasn't set anything, defaults flow in — PullUp's existing dark theme.

const PULLUP_DEFAULT = Object.freeze({
  primaryColor: "#ec178f",
  background:   "#0a0617",   // existing PullUp event-page dark
  textColor:    "#ffffff",
  fontFamily:   "Inter",
  logoUrl:      null,
});

/**
 * Curated webfont catalog. Order = order shown in the editor dropdown.
 * `system: true` means no @font-face is needed; render with the CSS
 * font-family stack directly (cheaper, no extra request).
 */
export const FONTS = [
  { name: "Inter",                category: "Sans",    family: '"Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif', googleFamily: "Inter:wght@400;500;600;700", weights: [400, 500, 600, 700] },
  { name: "DM Sans",              category: "Sans",    family: '"DM Sans", "Helvetica Neue", Arial, sans-serif',                    googleFamily: "DM+Sans:wght@400;500;600;700",     weights: [400, 500, 600, 700] },
  { name: "Manrope",              category: "Sans",    family: '"Manrope", "Helvetica Neue", Arial, sans-serif',                    googleFamily: "Manrope:wght@400;500;600;700",     weights: [400, 500, 600, 700] },
  { name: "Space Grotesk",        category: "Display", family: '"Space Grotesk", "Helvetica Neue", Arial, sans-serif',              googleFamily: "Space+Grotesk:wght@400;500;600;700", weights: [400, 500, 600, 700] },
  { name: "Outfit",               category: "Display", family: '"Outfit", "Helvetica Neue", Arial, sans-serif',                     googleFamily: "Outfit:wght@400;500;600;700",      weights: [400, 500, 600, 700] },
  { name: "Helvetica",            category: "System",  family: '"Helvetica Neue", Helvetica, Arial, sans-serif', system: true },
  { name: "Playfair Display",     category: "Serif",   family: '"Playfair Display", Georgia, serif',                                googleFamily: "Playfair+Display:wght@400;500;700;900", weights: [400, 500, 700, 900] },
  { name: "Lora",                 category: "Serif",   family: '"Lora", Georgia, serif',                                            googleFamily: "Lora:wght@400;500;600;700",        weights: [400, 500, 600, 700] },
  { name: "Cormorant Garamond",   category: "Serif",   family: '"Cormorant Garamond", Georgia, serif',                              googleFamily: "Cormorant+Garamond:wght@400;500;600;700", weights: [400, 500, 600, 700] },
  { name: "Georgia",              category: "System",  family: 'Georgia, "Times New Roman", serif', system: true },
  { name: "Space Mono",           category: "Mono",    family: '"Space Mono", ui-monospace, "SF Mono", Menlo, monospace',           googleFamily: "Space+Mono:wght@400;700",          weights: [400, 700] },
  { name: "IBM Plex Mono",        category: "Mono",    family: '"IBM Plex Mono", ui-monospace, "SF Mono", Menlo, monospace',         googleFamily: "IBM+Plex+Mono:wght@400;500;700",   weights: [400, 500, 700] },
];

const FONTS_BY_NAME = Object.fromEntries(FONTS.map((f) => [f.name, f]));

/**
 * Resolve a curated font NAME to its full CSS font-family stack.
 * Returns null for unknown / empty names (caller falls back to inherit).
 * Used by per-section font controls on the event page.
 */
export function fontStack(name) {
  const e = FONTS_BY_NAME[name];
  return e ? e.family : null;
}

/** Five starter palettes. Editor surfaces these as one-click swatches. */
export const PALETTES = [
  { name: "Editorial",          primaryColor: "#0a0a0a", background: "#ffffff", textColor: "#0a0a0a", fontFamily: "Playfair Display" },
  { name: "Cinematic noir",     primaryColor: "#d4a017", background: "#0a0617", textColor: "#ffffff", fontFamily: "Inter" },
  { name: "Stockholm minimal",  primaryColor: "#0d9488", background: "#f7f6f1", textColor: "#0a0a0a", fontFamily: "DM Sans" },
  { name: "Nairobi vivid",      primaryColor: "#b91c1c", background: "#fef3c7", textColor: "#3f1d1d", fontFamily: "Lora" },
  { name: "Festival neon",      primaryColor: "#a3e635", background: "#000000", textColor: "#ffffff", fontFamily: "Space Grotesk" },
];

// ── Color helpers ────────────────────────────────────────────────────

function hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }) {
  // WCAG relative luminance. Inputs 0-255, output 0-1.
  const linear = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/**
 * Given a background hex, return the text-color hex with the best
 * legibility (near-black on light bg, near-white on dark bg).
 */
export function pickTextColor(bgHex) {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return "#0a0a0a";
  return relativeLuminance(rgb) > 0.5 ? "#0a0a0a" : "#ffffff";
}

/**
 * "Soft" version of a color — useful for hover backgrounds, focus rings.
 * Returns the input hex with a low alpha as an rgba() string.
 */
export function softColor(hex, alpha = 0.12) {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * Picks a contrasting "ink-on-primary" color so a CTA button using
 * brand.primaryColor as background has legible text on top of it.
 */
export function pickInkOnPrimary(primaryHex) {
  return pickTextColor(primaryHex);
}

// ── Brand resolution ─────────────────────────────────────────────────

/**
 * Take whatever the API returns (may be {} or partial) and return a
 * fully-resolved brand bundle. Downstream renderers can index keys
 * without null-guarding.
 *
 * @param {object|null} hostBrand
 * @returns {{ primaryColor, background, textColor, fontFamily, logoUrl,
 *            inkOnPrimary, isCustom, fontCss }}
 */
export function resolveBrand(hostBrand) {
  const b = hostBrand || {};
  const primaryColor = b.primaryColor || PULLUP_DEFAULT.primaryColor;
  const background   = b.background   || PULLUP_DEFAULT.background;
  // Auto-contrast text when host left it null.
  const textColor    = b.textColor    || pickTextColor(background);
  const fontName     = b.fontFamily   || PULLUP_DEFAULT.fontFamily;
  const fontEntry    = FONTS_BY_NAME[fontName] || FONTS_BY_NAME[PULLUP_DEFAULT.fontFamily];

  return {
    primaryColor,
    background,
    textColor,
    inkOnPrimary: pickInkOnPrimary(primaryColor),
    fontFamily:   fontName,
    fontCss:      fontEntry.family,
    logoUrl:      b.logoUrl || null,
    // True if the host actually set anything; surfaces want this to
    // decide between "render their brand" and "wear PullUp defaults."
    isCustom: !!(
      b.primaryColor ||
      b.background ||
      b.textColor ||
      b.fontFamily ||
      b.logoUrl
    ),
  };
}

// ── Webfont loading ──────────────────────────────────────────────────

const LOADED_FONTS = new Set();

/**
 * Lazy-inject the Google Fonts <link> for a curated font. Idempotent:
 * second call is a no-op. System fonts skip the network request.
 */
export function loadFont(fontName) {
  if (typeof document === "undefined") return;
  const entry = FONTS_BY_NAME[fontName];
  if (!entry || entry.system) return;
  if (LOADED_FONTS.has(entry.name)) return;
  LOADED_FONTS.add(entry.name);

  const href = `https://fonts.googleapis.com/css2?family=${entry.googleFamily}&display=swap`;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.brandFont = entry.name;
  document.head.appendChild(link);
}

/**
 * Convenience — given a resolved brand, ensure its font is loaded.
 * Call from the top of any component that renders host-branded content.
 */
export function loadBrandFont(resolvedBrand) {
  if (resolvedBrand?.fontFamily) loadFont(resolvedBrand.fontFamily);
}

export const DEFAULT_BRAND = PULLUP_DEFAULT;
