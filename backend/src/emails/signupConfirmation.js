/**
 * Branded PullUp transactional emails (signup confirmation, waitlist,
 * reservation, VIP invite, 24h reminder).
 *
 * Per-host branding (migration 046): each email accepts a `brand` token
 * bundle. When the host has set their own brand, those tokens drive
 * background/text/accent/font — and we drop the prefers-color-scheme
 * light-mode flip (the host's pick is the host's pick, not auto-flipped
 * for inbox theme).
 *
 * When the host hasn't set anything, the original PullUp dark/gold look
 * stays, with the dual-mode @media flip so light-mode inboxes see a
 * clean white version.
 */

import { formatCoordinates } from "../lib/coordinates.js";

// Light identity: white canvas, near-black ink, brand pink. Emails always
// render light — no dark default, no prefers-color-scheme flip — so what the
// guest sees matches the light dashboard, not the dark guest event pages.
const CANVAS = "#ffffff";      // email background — always white
const INK = "#0c0a12";         // near-black text
const PINK = "#ec178f";        // brand pink (accents, badges, buttons)
const PINK_LIGHT = "#f45cae";
const WHITE = "#ffffff";
const MUTED = "rgba(12,10,18,0.55)";
const SUBTLE = "rgba(0,0,0,0.06)";

// ── Email-safe font catalog ──
// Mirrors src/lib/brand.js FONTS, narrowed to families that render
// acceptably across major mail clients via @font-face + system fallback.
const EMAIL_FONT_STACKS = {
  "Inter":              "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
  "DM Sans":            "'DM Sans', 'Helvetica Neue', Arial, sans-serif",
  "Manrope":            "Manrope, 'Helvetica Neue', Arial, sans-serif",
  "Space Grotesk":      "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif",
  "Outfit":             "Outfit, 'Helvetica Neue', Arial, sans-serif",
  "Helvetica":          "'Helvetica Neue', Helvetica, Arial, sans-serif",
  "Playfair Display":   "'Playfair Display', Georgia, 'Times New Roman', serif",
  "Lora":               "Lora, Georgia, 'Times New Roman', serif",
  "Cormorant Garamond": "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
  "Georgia":            "Georgia, 'Times New Roman', serif",
  "Space Mono":         "'Space Mono', ui-monospace, 'SF Mono', Menlo, monospace",
  "IBM Plex Mono":      "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

const DEFAULT_FONT_STACK = EMAIL_FONT_STACKS["Inter"];

// WCAG-ish relative luminance for contrast-pair picking.
function _hexToRgb(hex) {
  if (typeof hex !== "string") return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbaFromHex(hex, alpha) {
  const rgb = _hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/**
 * The email's token bundle. Host-customizable email branding was removed —
 * every transactional email now wears PullUp's light identity: white canvas,
 * near-black ink, brand pink. No dark default, no prefers-color-scheme flip
 * (color-scheme is pinned to light). The `brand` argument is intentionally
 * ignored; it remains in the signature only so the (now no-op) call sites
 * don't need to change in lockstep.
 *
 * @returns {object} { bg, ink, primary, primaryInk, primarySoft,
 *                      primarySoftBorder, muted, subtle, fontStack,
 *                      logoUrl, isCustom, lightModeFlip }
 */
function resolveEmailBrand() {
  return {
    bg:                CANVAS,
    ink:               INK,
    primary:           PINK,
    primaryLight:      PINK_LIGHT,
    primaryInk:        WHITE,
    primarySoft:       "rgba(236,23,143,0.10)",
    primarySoftBorder: "rgba(236,23,143,0.30)",
    muted:             MUTED,
    subtle:            SUBTLE,
    fontStack:         DEFAULT_FONT_STACK,
    logoUrl:           null,
    isCustom:          false,
    lightModeFlip:     false,
  };
}

/* ── Google Calendar link helper (server-side, no window) ── */
function formatCalDate(d) {
  if (!d || isNaN(new Date(d).getTime())) return "";
  return new Date(d)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function googleCalUrl({ title, startsAt, endsAt, location, slug, frontendUrl }) {
  const start = formatCalDate(startsAt);
  const end = formatCalDate(endsAt || new Date(new Date(startsAt).getTime() + 3 * 3600000));
  if (!start) return "";
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;
  const details = encodeURIComponent(`Event page: ${eventUrl}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}&details=${details}&location=${encodeURIComponent(location || "")}`;
}

function outlookCalUrl({ title, startsAt, endsAt, location, slug, frontendUrl }) {
  const start = formatCalDate(startsAt);
  const end = formatCalDate(endsAt || new Date(new Date(startsAt).getTime() + 3 * 3600000));
  if (!start) return "";
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;
  const details = encodeURIComponent(`Event page: ${eventUrl}`);
  return `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(title)}&startdt=${start}&enddt=${end}&body=${details}&location=${encodeURIComponent(location || "")}`;
}

/* ── Shared layout wrapper ── */
function emailShell(content, brand) {
  const b = brand || resolveEmailBrand(null);
  // Custom-branded emails render the host's choice in BOTH modes — no
  // auto-flip. Legacy (PullUp default) emails keep the light-mode flip
  // so light-inbox users get a clean white look while dark-inbox users
  // get the PullUp dark/gold aesthetic.
  const lightFlipCss = b.lightModeFlip
    ? `
  @media (prefers-color-scheme: light) {
    body.pu-shell, table.pu-shell { background: #ffffff !important; color: #0c0a12 !important; }
    .pu-text, .pu-shell h1, .pu-shell h2, .pu-shell h3 { color: #0c0a12 !important; }
    .pu-shell p { color: rgba(12,10,18,0.85) !important; }
    .pu-muted, .pu-shell .pu-muted { color: rgba(12,10,18,0.55) !important; }
    .pu-shell hr, .pu-shell [data-divider], .pu-shell td[style*="border-top"] { border-top-color: rgba(0,0,0,0.08) !important; }
    .pu-subtle-bg { background: rgba(0,0,0,0.03) !important; border-color: rgba(0,0,0,0.08) !important; }
  }`
    : "";

  return `<!DOCTYPE html><html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<style>
  :root { color-scheme: light only; supported-color-schemes: light; }${lightFlipCss}
</style>
</head>
<body class="pu-shell" style="margin:0;padding:0;background:${b.bg};color:${b.ink};font-family:${b.fontStack};">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="pu-shell" style="background:${b.bg};">
<tr><td align="center" style="padding:20px 16px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" class="pu-shell" style="max-width:520px;background:${b.bg};">
${content}
</table>
</td></tr>
</table>
</body></html>`;
}

/* ── Nice date formatting ── */
function niceDate(dateStr, timezone) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr || "";
  const opts = timezone ? { timeZone: timezone } : {};
  const datePart = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", ...opts });
  const timePart = d.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", ...opts });
  return `${datePart} · ${timePart}`;
}

/* ── TBA-aware display resolvers ──
   For events the host marked as "reveal later", startsAt and location are
   private placeholders used for sorting/reminders. Emails should show the
   reveal hint (or "Date TBA" / "Location revealed later") instead of leaking
   the real values. */
function resolveDateText({ startsAt, timezone, hideDate, dateRevealHint, fallback = "" }) {
  if (hideDate) return dateRevealHint || "Date TBA";
  return startsAt ? niceDate(startsAt, timezone) : fallback;
}
function resolveLocationText({ location, hideLocation, revealHint }) {
  if (hideLocation) return revealHint || "Location revealed later";
  return location || "";
}
// Always Google Maps. Exact pin when the event carries coords, address search
// otherwise. (Loose null-check so an undefined coord falls through to text.)
function googleMapsUrl(location, lat, lng) {
  if (lat != null && lng != null) return `https://www.google.com/maps?q=${lat},${lng}`;
  if (location) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  return null;
}
// Inner HTML for a "Where" cell: the location as a tappable Maps link, or plain
// text when the location is hidden (reveal-later) or we have nothing to link.
// When showCoordinates is on (and the location isn't hidden), the exact lat/lng
// pair is appended on its own line — email can't do a copy button, so it's a
// tappable Maps link that drops the precise pin.
function locationLinkHtml({ location, locationLat, locationLng, hideLocation, revealHint, showCoordinates }, color) {
  const text = resolveLocationText({ location, hideLocation, revealHint });
  if (!text) return "";
  const url = hideLocation ? null : googleMapsUrl(location, locationLat, locationLng);
  const label = url
    ? `<a href="${url}" target="_blank" style="color:${color};text-decoration:underline;">${text}</a>`
    : text;
  if (!showCoordinates || hideLocation) return label;
  const coords = formatCoordinates(locationLat, locationLng);
  if (!coords) return label;
  const coordsUrl = `https://www.google.com/maps?q=${locationLat},${locationLng}`;
  return `${label}<br><a href="${coordsUrl}" target="_blank" style="color:${color};text-decoration:none;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:13px;opacity:0.85;">${coords}</a>`;
}

/* ── Badge pill component ── */
function badge(text, brand, overrides = {}) {
  const b = brand || resolveEmailBrand(null);
  const bg = overrides.bg ?? b.primarySoft;
  const border = overrides.border ?? b.primarySoftBorder;
  const color = overrides.color ?? b.primary;
  return `<span style="display:inline-block;padding:6px 20px;border-radius:999px;background:${bg};border:1px solid ${border};color:${color};font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">${text}</span>`;
}

/* ── Footer with host branding ── */
function emailFooter({ message = "", brandName = "", brandWebsite = "", contactEmail = "", frontendUrl = "", unsubscribeUrl = "" } = {}, brand) {
  const b = brand || resolveEmailBrand(null);
  const linkColor = rgbaFromHex(b.ink, 0.55);
  const muted = rgbaFromHex(b.ink, 0.45);
  const dividerColor = rgbaFromHex(b.ink, 0.10);

  const parts = [];
  if (message) parts.push(message);
  if (contactEmail) parts.push(`<br>Questions? <a href="mailto:${contactEmail}" style="color:${linkColor};text-decoration:none;">${contactEmail}</a>`);
  if (brandWebsite) {
    const displayUrl = brandWebsite.replace(/^https?:\/\//, "");
    parts.push(`<br><a href="${brandWebsite}" target="_blank" style="color:${linkColor};text-decoration:none;">${displayUrl}</a>`);
  } else if (brandName) {
    parts.push(`<br>${brandName}`);
  }
  if (unsubscribeUrl) {
    parts.push(`<br><a href="${unsubscribeUrl}#ses:no-track" style="color:${muted};text-decoration:underline;">Unsubscribe from marketing emails</a>`);
  }

  return `<!-- Footer -->
<tr><td data-divider style="padding:24px 0 8px;border-top:1px solid ${dividerColor};">
  <p class="pu-muted" style="margin:0;font-size:12px;color:${muted};text-align:center;line-height:1.6;">
    ${parts.join("")}
  </p>
</td></tr>`;
}

/* ── CTA button ── */
function ctaButton(href, label, brand) {
  const b = brand || resolveEmailBrand(null);
  // Flat brand-pink fill, white ink.
  return `<a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;padding:14px 36px;border-radius:999px;background-color:${b.primary};color:${b.primaryInk};font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:1px solid ${b.primary};font-family:${b.fontStack};">${label}</a>`;
}

/* ── Host's custom note (comms studio) — injected into the email body. ── */
function noteBlock(customNote, brand) {
  const b = brand || resolveEmailBrand(null);
  const text = (customNote || "").toString().trim();
  if (!text) return "";
  const esc = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
  return `<tr><td style="padding:6px 20px 0;">
    <div class="pu-subtle-bg" style="padding:14px 16px;border-radius:12px;background:${rgbaFromHex(b.ink, 0.04)};border:1px solid ${b.subtle};">
      <p style="margin:0;font-size:14px;line-height:1.55;color:${rgbaFromHex(b.ink, 0.85)};font-family:${b.fontStack};">${esc}</p>
    </div>
  </td></tr>`;
}

/* ── Small link button (for calendar) ── */
function smallButton(href, label, brand) {
  const b = brand || resolveEmailBrand(null);
  return `<a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;padding:8px 16px;border-radius:999px;background:${b.subtle};border:1px solid ${b.subtle};color:${b.muted};font-size:12px;font-weight:600;letter-spacing:0.04em;">${label}</a>`;
}

/* ── Optional logo header for branded emails ── */
function logoHeader(b) {
  if (!b?.isCustom || !b.logoUrl) return "";
  return `<tr><td align="center" style="padding:24px 0 8px;">
    <img src="${b.logoUrl}" alt="" style="max-height:48px;max-width:160px;width:auto;height:auto;display:inline-block;">
  </td></tr>`;
}

/* ══════════════════════════════════════════
   SIGNUP CONFIRMATION / WAITLIST EMAIL
   ══════════════════════════════════════════ */
export function signupConfirmationEmail({
  name,
  eventTitle,
  date,
  isWaitlist = false,
  // new enriched fields
  imageUrl = "",
  location = "",
  locationLat = null,
  locationLng = null,
  showCoordinates = false,
  startsAt = "",
  endsAt = "",
  timezone = "",
  plusOnes = 0,
  slug = "",
  eventId = "",
  customNote = "",
  frontendUrl = "https://pullup.se",
  // Room key (services/roomKeys.js): a session-granting link — tapping it
  // signs the guest in and lands them INSIDE the event Room. Falls back to
  // the plain room URL (login wall) when minting failed.
  roomKeyUrl = "",
  // Digital-product delivery (kind='product'): a link back to the gated
  // /p/:slug?purchase=<rsvpId> page where the download/secret/unlock is served.
  // When set, this email confirms a PURCHASE, not an event spot.
  productDeliveryUrl = "",
  productTitle = "",
  spotifyUrl = "",
  ticketPrice = 0,
  ticketCurrency = "",
  receiptUrl = "",
  // reveal-later flags
  hideDate = false,
  hideLocation = false,
  dateRevealHint = "",
  revealHint = "",
  // host branding (legacy footer text)
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
  // Host visual brand (migration 046). When any field set, this email
  // wears the host's brand; otherwise we render the PullUp dark/gold
  // default with the prefers-color-scheme: light flip.
  brand = null,
}) {
  const b = resolveEmailBrand(brand);
  const dateFormatted = resolveDateText({ startsAt, timezone, hideDate, dateRevealHint, fallback: date || "" });
  const locationText = resolveLocationText({ location, hideLocation, revealHint });
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;
  // The room: the post-arrival space, gated by a pull-up (scan at the door).
  // Confirmed guests get a one-line heads-up + link to the door (anticipation
  // pre-event; the real interior opens once they scan in person).
  const roomUrl = roomKeyUrl || (eventId ? `${frontendUrl}/p/${eventId}` : "");

  // Calendar links only make sense when the date is real and public.
  const googleCal = !hideDate && startsAt ? googleCalUrl({ title: eventTitle, startsAt, endsAt, location: hideLocation ? "" : location, slug, frontendUrl }) : "";
  const outlookCal = !hideDate && startsAt ? outlookCalUrl({ title: eventTitle, startsAt, endsAt, location: hideLocation ? "" : location, slug, frontendUrl }) : "";

  const partyText = plusOnes > 0
    ? `You + ${plusOnes} guest${plusOnes > 1 ? "s" : ""}`
    : "1 guest";

  // CONFIRMED badge wears the host's primary; WAITLIST stays muted.
  const statusBadge = isWaitlist
    ? badge("WAITLIST", b, { bg: rgbaFromHex(b.ink, 0.06), border: rgbaFromHex(b.ink, 0.12), color: b.muted })
    : badge("CONFIRMED", b);

  // Detail-card surface: subtle tint of the page bg, derived from text ink
  // so it works on any background brand.
  const cardBg = rgbaFromHex(b.ink, 0.04);

  const content = `
${logoHeader(b)}
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${statusBadge}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 translate="no" class="pu-text notranslate" style="margin:0;font-size:26px;font-weight:700;color:${b.ink};line-height:1.3;font-family:${b.fontStack};">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    ${productDeliveryUrl
      ? `Hi ${name}, your purchase is confirmed. Tap below to access it.`
      : isWaitlist
      ? `Hi ${name}, you've been added to the waitlist. We'll notify you if a spot opens up.`
      : `Hi ${name}, your spot is confirmed! We look forward to seeing you.`}
  </p>
</td></tr>

${noteBlock(customNote, b)}

<!-- Event Details Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:${cardBg};border:1px solid ${b.subtle};border-radius:12px;width:100%;max-width:440px;">
    ${dateFormatted ? `<tr><td style="padding:14px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">When</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${dateFormatted}</td>
      </tr></table>
    </td></tr>` : ""}
    ${locationText ? `<tr><td style="padding:10px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Where</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${locationLinkHtml({ location, locationLat, locationLng, hideLocation, revealHint, showCoordinates }, b.ink)}</td>
      </tr></table>
    </td></tr>` : ""}
    <tr><td style="padding:10px 20px ${ticketPrice ? "0" : "14px"};">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Guests</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${partyText}</td>
      </tr></table>
    </td></tr>
    ${ticketPrice ? `<tr><td style="padding:10px 20px 14px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Receipt</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${receiptUrl
          ? `<a href="${receiptUrl}" target="_blank" style="color:${b.ink};text-decoration:underline;text-decoration-color:${rgbaFromHex(b.ink, 0.3)};">${ticketPrice} ${(ticketCurrency || "").toUpperCase()}</a>`
          : `${ticketPrice} ${(ticketCurrency || "").toUpperCase()}`}</td>
      </tr></table>
    </td></tr>` : ""}
  </table>
</td></tr>

${spotifyUrl ? `<!-- Spotify -->
<tr><td align="center" style="padding:8px 0;">
  <a href="${spotifyUrl}" target="_blank" style="display:inline-block;text-decoration:none;padding:8px 16px;border-radius:999px;background:rgba(30,215,96,0.12);border:1px solid rgba(30,215,96,0.3);color:#1ed760;font-size:13px;font-weight:600;">
    <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Spotify_icon.svg/232px-Spotify_icon.svg.png" alt="" width="16" height="16" style="border:0;margin-right:6px;vertical-align:middle;" />Listen on Spotify
  </a>
</td></tr>` : ""}

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${productDeliveryUrl
    ? ctaButton(productDeliveryUrl, "ACCESS YOUR PURCHASE", b)
    : ctaButton(eventUrl, "VIEW EVENT", b)}
</td></tr>

${(!isWaitlist && !productDeliveryUrl && roomUrl) ? `<!-- The room (anticipation; opens once they pull up at the door) -->
<tr><td align="center" style="padding:8px 20px 4px;">
  <p class="pu-muted" style="margin:0;font-size:13px;color:${b.muted};line-height:1.5;font-family:${b.fontStack};">
    <a href="${roomUrl}" target="_blank" style="color:${b.ink};text-decoration:underline;text-decoration-color:${rgbaFromHex(b.ink, 0.3)};">The room</a> is open now — step in to get ready. When the event starts, pull up at the door to stay in.
  </p>
</td></tr>` : ""}

${(googleCal || outlookCal) ? `<!-- Add to Calendar -->
<tr><td align="center" style="padding:8px 0 4px;">
  <p style="margin:0 0 8px;font-size:12px;color:${b.muted};letter-spacing:0.06em;text-transform:uppercase;font-family:${b.fontStack};">Add to calendar</p>
  <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
    ${googleCal ? `<td style="padding:0 4px;">${smallButton(googleCal, "Google", b)}</td>` : ""}
    ${outlookCal ? `<td style="padding:0 4px;">${smallButton(outlookCal, "Outlook", b)}</td>` : ""}
  </tr></table>
</td></tr>` : ""}

${emailFooter({ message: isWaitlist ? "If spots open up, you'll receive a notification to confirm your spot." : "See you there!", brandName, brandWebsite, contactEmail, frontendUrl }, b)}`;

  return emailShell(content, b);
}

/* ══════════════════════════════════════════
   PASSWORDLESS SIGN-IN LINK EMAIL
   One-tap magic link. No password, ever — this link signs you in.
   ══════════════════════════════════════════ */
export function loginLinkEmail({
  name = "",
  actionLink,
  brandName = "",
  contactEmail = "",
  frontendUrl = "https://pullup.se",
  brand = null,
}) {
  const b = resolveEmailBrand(brand);
  const greeting = name ? `Hi ${name},` : "Welcome back";

  const content = `
${logoHeader(b)}
<!-- Badge -->
<tr><td align="center" style="padding:24px 0 12px;">
  ${badge("SIGN IN", b)}
</td></tr>

<!-- Heading -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <h1 class="pu-text" style="margin:0;font-size:24px;font-weight:700;color:${b.ink};line-height:1.3;font-family:${b.fontStack};">${greeting}</h1>
</td></tr>

<!-- Message -->
<tr><td style="padding:10px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    Tap below to open PullUp. No password needed — this link signs you straight in.
  </p>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:22px 0 8px;">
  ${ctaButton(actionLink, "OPEN PULLUP", b)}
</td></tr>

<!-- Fine print -->
<tr><td align="center" style="padding:6px 20px 0;">
  <p class="pu-muted" style="margin:0;font-size:12px;color:${b.muted};line-height:1.5;font-family:${b.fontStack};">
    This link works once and expires soon. If you didn't ask to sign in, you can safely ignore this email.
  </p>
</td></tr>

${emailFooter({ brandName, contactEmail, frontendUrl }, b)}`;

  return emailShell(content, b);
}

/* ══════════════════════════════════════════
   24-HOUR REMINDER EMAIL
   ══════════════════════════════════════════ */
export function reminder24hEmail({
  name,
  eventTitle,
  startsAt = "",
  timezone = "",
  imageUrl = "",
  location = "",
  locationLat = null,
  locationLng = null,
  showCoordinates = false,
  slug = "",
  frontendUrl = "https://pullup.se",
  // reveal-later flags
  hideDate = false,
  hideLocation = false,
  dateRevealHint = "",
  revealHint = "",
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
  unsubscribeUrl = "",
  customNote = "",
  brand = {},
}) {
  const b = resolveEmailBrand(brand);
  const dateFormatted = resolveDateText({ startsAt, timezone, hideDate, dateRevealHint });
  const locationText = resolveLocationText({ location, hideLocation, revealHint });
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const content = `
${logoHeader(b)}
<!-- Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("HAPPENING SOON", b)}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 translate="no" class="pu-text notranslate" style="margin:0;font-size:26px;font-weight:700;color:${b.ink};line-height:1.3;font-family:${b.fontStack};">${eventTitle}</h1>
</td></tr>

<!-- Message -->
<tr><td style="padding:8px 20px;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    Hi ${name}, <strong translate="no" class="notranslate">${eventTitle}</strong> is coming up!
  </p>
</td></tr>

${noteBlock(customNote, b)}

<!-- Details Card -->
<tr><td align="center" style="padding:16px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:${rgbaFromHex(b.ink, 0.04)};border:1px solid ${b.subtle};border-radius:12px;">
    <tr><td style="padding:14px 20px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation">
        ${dateFormatted ? `<tr><td style="padding:2px 10px 2px 0;font-size:14px;color:${b.muted};font-family:${b.fontStack};">When</td><td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${dateFormatted}</td></tr>` : ""}
        ${locationText ? `<tr><td style="padding:2px 10px 2px 0;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Where</td><td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${locationLinkHtml({ location, locationLat, locationLng, hideLocation, revealHint, showCoordinates }, b.ink)}</td></tr>` : ""}
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:20px 0;">
  ${ctaButton(eventUrl, "VIEW EVENT", b)}
</td></tr>

${emailFooter({ message: "See you tomorrow!", brandName, brandWebsite, contactEmail, frontendUrl, unsubscribeUrl }, b)}`;

  return emailShell(content, b);
}

/* ══════════════════════════════════════════
   COMPOSED MESSAGE EMAIL — the per-event Communication panel's WYSIWYG sends
   (sign-up info / reminder / post-event). The host writes the message with
   live-detail tokens; eventComms.resolveCommsHtml turns it into `bodyHtml`
   (escaped prose + resolved tokens/links). This renders that body inside the
   branded shell so what the host previews is what the guest receives.
   ══════════════════════════════════════════ */
export function composedMessageEmail({
  eventTitle = "",
  badgeText = "",
  imageUrl = "",
  bodyHtml = "",
  frontendUrl = "https://pullup.se",
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
  unsubscribeUrl = "",
  footerMessage = "",
  noticeBanner = null, // { title, subtitle } — a loud full-width status bar
  brand = {},
}) {
  const b = resolveEmailBrand(brand);
  // A high-contrast amber bar that a guest cannot miss — used to make the
  // "you're on the waitlist, NOT confirmed" state unmistakable (people kept
  // reading the waitlist email as a confirmation). Brand-independent warm tones
  // so it never reads as the normal pink "you're in".
  const noticeHtml = noticeBanner ? `<!-- Notice banner -->
<tr><td style="padding:20px 0 2px;">
  <div style="background:#FFF3E0;border:1px solid #F2B96B;border-radius:14px;padding:16px 18px;text-align:center;">
    <div style="font-size:15px;font-weight:800;color:#9A5B00;letter-spacing:0.01em;font-family:${b.fontStack};">${noticeBanner.title || ""}</div>
    ${noticeBanner.subtitle ? `<div style="font-size:12.5px;color:#9A5B00;opacity:0.85;margin-top:4px;font-family:${b.fontStack};">${noticeBanner.subtitle}</div>` : ""}
  </div>
</td></tr>` : "";
  const content = `
${logoHeader(b)}
${noticeHtml}
${badgeText && !noticeBanner ? `<!-- Badge -->
<tr><td align="center" style="padding:24px 0 8px;">
  ${badge(badgeText, b)}
</td></tr>` : ""}

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:16px 0 4px;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- The host's composed message (tokens already resolved to HTML) -->
<tr><td style="padding:18px 20px 6px;">
  <p style="margin:0;font-size:15.5px;color:${b.ink};line-height:1.6;font-family:${b.fontStack};">${bodyHtml}</p>
</td></tr>

${emailFooter({ message: footerMessage, brandName, brandWebsite, contactEmail, frontendUrl, unsubscribeUrl }, b)}`;

  return emailShell(content, b);
}

/* ══════════════════════════════════════════
   RESERVATION EMAIL (payment pending)
   ══════════════════════════════════════════ */
export function reservationEmail({
  name,
  eventTitle,
  imageUrl = "",
  location = "",
  locationLat = null,
  locationLng = null,
  showCoordinates = false,
  startsAt = "",
  endsAt = "",
  timezone = "",
  plusOnes = 0,
  slug = "",
  frontendUrl = "https://pullup.se",
  holdMinutes = 30,
  customNote = "",
  // reveal-later flags
  hideDate = false,
  hideLocation = false,
  dateRevealHint = "",
  revealHint = "",
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
  brand = {},
}) {
  const b = resolveEmailBrand(brand);
  const dateFormatted = resolveDateText({ startsAt, timezone, hideDate, dateRevealHint });
  const locationText = resolveLocationText({ location, hideLocation, revealHint });
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const partyText = plusOnes > 0
    ? `You + ${plusOnes} guest${plusOnes > 1 ? "s" : ""}`
    : "1 guest";

  const content = `
${logoHeader(b)}
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("RESERVED", b, { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.3)", color: "#60a5fa" })}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 translate="no" class="pu-text notranslate" style="margin:0;font-size:26px;font-weight:700;color:${b.ink};line-height:1.3;font-family:${b.fontStack};">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    Hi ${name}, your spot is reserved for ${holdMinutes} minutes. Complete your payment to confirm.
  </p>
</td></tr>

${noteBlock(customNote, b)}

<!-- Event Details Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:${rgbaFromHex(b.ink, 0.04)};border:1px solid ${b.subtle};border-radius:12px;width:100%;max-width:440px;">
    ${dateFormatted ? `<tr><td style="padding:14px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">When</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${dateFormatted}</td>
      </tr></table>
    </td></tr>` : ""}
    ${locationText ? `<tr><td style="padding:10px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Where</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${locationLinkHtml({ location, locationLat, locationLng, hideLocation, revealHint, showCoordinates }, b.ink)}</td>
      </tr></table>
    </td></tr>` : ""}
    <tr><td style="padding:10px 20px 14px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Guests</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${partyText}</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${ctaButton(eventUrl, "COMPLETE PAYMENT", b)}
</td></tr>

${emailFooter({ message: `Your spot will be released if payment is not completed within ${holdMinutes} minutes.`, brandName, brandWebsite, contactEmail, frontendUrl }, b)}`;

  return emailShell(content, b);
}

/* ══════════════════════════════════════════
   WAITLIST OFFER EMAIL (spot opened up)
   ══════════════════════════════════════════ */
export function waitlistOfferEmail({
  name,
  eventTitle,
  imageUrl = "",
  location = "",
  locationLat = null,
  locationLng = null,
  showCoordinates = false,
  startsAt = "",
  endsAt = "",
  timezone = "",
  plusOnes = 0,
  slug = "",
  frontendUrl = "https://pullup.se",
  offerLink = "",
  isPaidEvent = false,
  expiresInHours = 6,
  expiresInMinutes = null,
  customNote = "",
  // reveal-later flags
  hideDate = false,
  hideLocation = false,
  dateRevealHint = "",
  revealHint = "",
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
  brand = {},
}) {
  const b = resolveEmailBrand(brand);
  const dateFormatted = resolveDateText({ startsAt, timezone, hideDate, dateRevealHint });
  const locationText = resolveLocationText({ location, hideLocation, revealHint });
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;
  const ctaHref = offerLink || eventUrl;

  // Format expiry text smartly
  const totalMinutes = expiresInMinutes || (expiresInHours * 60);
  const expiryText = totalMinutes < 60
    ? `${totalMinutes} minutes`
    : totalMinutes < 120
    ? "1 hour"
    : `${Math.round(totalMinutes / 60)} hours`;

  const partyText = plusOnes > 0
    ? `You + ${plusOnes} guest${plusOnes > 1 ? "s" : ""}`
    : "1 guest";

  const content = `
${logoHeader(b)}
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("SPOT AVAILABLE", b, { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.3)", color: "#4ade80" })}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 translate="no" class="pu-text notranslate" style="margin:0;font-size:26px;font-weight:700;color:${b.ink};line-height:1.3;font-family:${b.fontStack};">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    Hi ${name}, a spot has opened up for <span translate="no" class="notranslate">${eventTitle}</span>!
    ${isPaidEvent ? " Complete your payment to secure your spot." : " Confirm your booking below."}
  </p>
</td></tr>

${noteBlock(customNote, b)}

<!-- Event Details Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:${rgbaFromHex(b.ink, 0.04)};border:1px solid ${b.subtle};border-radius:12px;width:100%;max-width:440px;">
    ${dateFormatted ? `<tr><td style="padding:14px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">When</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${dateFormatted}</td>
      </tr></table>
    </td></tr>` : ""}
    ${locationText ? `<tr><td style="padding:10px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Where</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${locationLinkHtml({ location, locationLat, locationLng, hideLocation, revealHint, showCoordinates }, b.ink)}</td>
      </tr></table>
    </td></tr>` : ""}
    <tr><td style="padding:10px 20px 14px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Guests</td>
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${partyText}</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${ctaButton(ctaHref, "CONFIRM YOUR SPOT", b)}
</td></tr>

${emailFooter({ message: `This offer expires in ${expiryText}. After that, your spot may be offered to someone else.`, brandName, brandWebsite, contactEmail, frontendUrl }, b)}`;

  return emailShell(content, b);
}

/* ══════════════════════════════════════════
   REFUND EMAIL
   ══════════════════════════════════════════ */
export function refundEmail({
  name,
  eventTitle,
  imageUrl = "",
  slug = "",
  frontendUrl = "https://pullup.se",
  refundAmount = "",
  currency = "",
  isFullRefund = true,
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
  brand = {},
}) {
  const b = resolveEmailBrand(brand);
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const content = `
${logoHeader(b)}
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("REFUND PROCESSED", b, { bg: rgbaFromHex(b.ink, 0.06), border: rgbaFromHex(b.ink, 0.12), color: b.muted })}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 translate="no" class="pu-text notranslate" style="margin:0;font-size:26px;font-weight:700;color:${b.ink};line-height:1.3;font-family:${b.fontStack};">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    ${isFullRefund
      ? `Hi ${name}, your payment for <span translate="no" class="notranslate">${eventTitle}</span> has been fully refunded.`
      : `Hi ${name}, a partial refund of ${refundAmount} ${currency.toUpperCase()} has been processed for <span translate="no" class="notranslate">${eventTitle}</span>.`}
  </p>
</td></tr>

${isFullRefund ? `<!-- Waitlist note -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    Your booking has been moved to the waitlist. The host will contact you if a spot opens up again.
  </p>
</td></tr>` : ""}

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${ctaButton(eventUrl, "VIEW EVENT", b)}
</td></tr>

${emailFooter({ brandName, brandWebsite, contactEmail, frontendUrl }, b)}`;

  return emailShell(content, b);
}

/* ══════════════════════════════════════════
   CANCELLATION EMAIL
   ══════════════════════════════════════════ */
export function cancellationEmail({
  name,
  eventTitle,
  imageUrl = "",
  slug = "",
  frontendUrl = "https://pullup.se",
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
  brand = {},
}) {
  const b = resolveEmailBrand(brand);
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const content = `
${logoHeader(b)}
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("BOOKING CANCELLED", b, { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)", color: "#f87171" })}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 translate="no" class="pu-text notranslate" style="margin:0;font-size:26px;font-weight:700;color:${b.ink};line-height:1.3;font-family:${b.fontStack};">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    Hi ${name}, your booking for <span translate="no" class="notranslate">${eventTitle}</span> has been cancelled by the host.
  </p>
</td></tr>

<!-- Additional info -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:${rgbaFromHex(b.ink, 0.7)};line-height:1.5;font-family:${b.fontStack};">
    If you believe this was a mistake, please ${contactEmail ? `contact the organizer at <a href="mailto:${contactEmail}" style="color:${rgbaFromHex(b.ink, 0.7)};">${contactEmail}</a>` : "contact the event organizer"}.
  </p>
</td></tr>

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${ctaButton(eventUrl, "VIEW EVENT", b)}
</td></tr>

${emailFooter({ brandName, brandWebsite, contactEmail, frontendUrl }, b)}`;

  return emailShell(content, b);
}
