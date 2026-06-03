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

const PULLUP_BG = "#05040a";
const GOLD = "#f59e0b";
const GOLD_LIGHT = "#fbbf24";
const WHITE = "#ffffff";
const MUTED = "rgba(255,255,255,0.6)";
const SUBTLE = "rgba(255,255,255,0.08)";

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
function _luminance(rgb) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}
function inkFor(bgHex) {
  const rgb = _hexToRgb(bgHex);
  if (!rgb) return "#0a0a0a";
  return _luminance(rgb) > 0.5 ? "#0a0a0a" : "#ffffff";
}
function rgbaFromHex(hex, alpha) {
  const rgb = _hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${alpha})`;
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/**
 * Build the email's token bundle from optional host-brand inputs. When
 * NOTHING was set, returns the legacy PullUp dark/gold theme + the
 * light-mode flip flag. When ANY field was set, returns the host's
 * brand resolved to all-tokens and disables the light-mode flip.
 *
 * @param {object} brand   { primaryColor, background, textColor, fontFamily, logoUrl }
 * @returns {object}       { bg, ink, primary, primaryInk, primarySoft,
 *                           primarySoftBorder, muted, subtle, fontStack,
 *                           logoUrl, isCustom, lightModeFlip }
 */
function resolveEmailBrand(brand = {}) {
  const isCustom = !!(
    brand?.primaryColor ||
    brand?.background ||
    brand?.textColor ||
    brand?.fontFamily ||
    brand?.logoUrl
  );

  if (!isCustom) {
    return {
      bg:                PULLUP_BG,
      ink:               WHITE,
      primary:           GOLD,
      primaryLight:      GOLD_LIGHT,
      primaryInk:        PULLUP_BG,
      primarySoft:       "rgba(245,158,11,0.15)",
      primarySoftBorder: "rgba(245,158,11,0.3)",
      muted:             MUTED,
      subtle:            SUBTLE,
      fontStack:         DEFAULT_FONT_STACK,
      logoUrl:           null,
      isCustom:          false,
      lightModeFlip:     true,
    };
  }

  const bg          = brand.background    || "#ffffff";
  const ink         = brand.textColor     || inkFor(bg);
  const primary     = brand.primaryColor  || "#ec178f";
  const primaryInk  = inkFor(primary);
  const fontStack   = EMAIL_FONT_STACKS[brand.fontFamily] || DEFAULT_FONT_STACK;
  // Derive muted/subtle from text color for legibility on the brand bg.
  const muted       = rgbaFromHex(ink, 0.62);
  const subtle      = rgbaFromHex(ink, 0.08);

  return {
    bg,
    ink,
    primary,
    primaryLight:      primary,
    primaryInk,
    primarySoft:       rgbaFromHex(primary, 0.14),
    primarySoftBorder: rgbaFromHex(primary, 0.30),
    muted,
    subtle,
    fontStack,
    logoUrl:           brand.logoUrl || null,
    isCustom:          true,
    // Host-branded emails render the SAME in both light + dark inbox modes —
    // their brand is the brand, no auto-flip.
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
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; supported-color-schemes: light dark; }${lightFlipCss}
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

/* ── Badge pill component ── */
function badge(text, brand, overrides = {}) {
  const b = brand || resolveEmailBrand(null);
  const bg = overrides.bg ?? b.primarySoft;
  const border = overrides.border ?? b.primarySoftBorder;
  const color = overrides.color ?? (b.isCustom ? b.primary : GOLD_LIGHT);
  return `<span style="display:inline-block;padding:6px 20px;border-radius:999px;background:${bg};border:1px solid ${border};color:${color};font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">${text}</span>`;
}

/* ── Footer with host branding ── */
function emailFooter({ message = "", brandName = "", brandWebsite = "", contactEmail = "", frontendUrl = "", unsubscribeUrl = "" } = {}, brand) {
  const b = brand || resolveEmailBrand(null);
  const linkColor = b.isCustom ? rgbaFromHex(b.ink, 0.55) : "rgba(255,255,255,0.4)";
  const muted = b.isCustom ? rgbaFromHex(b.ink, 0.45) : "rgba(255,255,255,0.3)";
  const dividerColor = b.isCustom ? rgbaFromHex(b.ink, 0.10) : "rgba(255,255,255,0.06)";

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
  if (!b.isCustom) {
    // Legacy gold-gradient look.
    return `<a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;padding:14px 36px;border-radius:999px;background-color:${GOLD};background-image:linear-gradient(135deg,${GOLD_LIGHT} 0%,${GOLD} 45%,#d97706 100%);color:${PULLUP_BG};font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:1px solid rgba(245,158,11,0.9);">${label}</a>`;
  }
  // Branded: flat brand-primary fill, ink chosen for contrast.
  return `<a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;padding:14px 36px;border-radius:999px;background-color:${b.primary};color:${b.primaryInk};font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:1px solid ${b.primary};font-family:${b.fontStack};">${label}</a>`;
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
  startsAt = "",
  endsAt = "",
  timezone = "",
  plusOnes = 0,
  slug = "",
  eventId = "",
  frontendUrl = "https://pullup.se",
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
  const roomUrl = eventId ? `${frontendUrl}/p/${eventId}` : "";

  // Calendar links only make sense when the date is real and public.
  const googleCal = !hideDate && startsAt ? googleCalUrl({ title: eventTitle, startsAt, endsAt, location: hideLocation ? "" : location, slug, frontendUrl }) : "";
  const outlookCal = !hideDate && startsAt ? outlookCalUrl({ title: eventTitle, startsAt, endsAt, location: hideLocation ? "" : location, slug, frontendUrl }) : "";

  const partyText = plusOnes > 0
    ? `You + ${plusOnes} guest${plusOnes > 1 ? "s" : ""}`
    : "1 guest";

  // CONFIRMED badge wears the host's primary; WAITLIST stays muted.
  const statusBadge = isWaitlist
    ? badge("WAITLIST", b, { bg: rgbaFromHex(b.ink, 0.06), border: rgbaFromHex(b.ink, 0.12), color: b.muted })
    : (b.isCustom
        ? badge("CONFIRMED", b, { bg: b.primary, border: b.primary, color: b.primaryInk })
        : badge("CONFIRMED", b, { bg: "linear-gradient(135deg,#fbbf24 0%,#f59e0b 45%,#d97706 100%)", border: "rgba(245,158,11,0.3)", color: PULLUP_BG }));

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
    ${isWaitlist
      ? `Hi ${name}, you've been added to the waitlist. We'll notify you if a spot opens up.`
      : `Hi ${name}, your spot is confirmed! We look forward to seeing you.`}
  </p>
</td></tr>

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
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${locationText}</td>
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
  ${ctaButton(eventUrl, "VIEW EVENT", b)}
</td></tr>

${(!isWaitlist && roomUrl) ? `<!-- The room (anticipation; opens once they pull up at the door) -->
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
   24-HOUR REMINDER EMAIL
   ══════════════════════════════════════════ */
export function reminder24hEmail({
  name,
  eventTitle,
  startsAt = "",
  timezone = "",
  imageUrl = "",
  location = "",
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
    Hi ${name}, <strong translate="no" class="notranslate">${eventTitle}</strong> is tomorrow!
  </p>
</td></tr>

<!-- Details Card -->
<tr><td align="center" style="padding:16px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:${rgbaFromHex(b.ink, 0.04)};border:1px solid ${b.subtle};border-radius:12px;">
    <tr><td style="padding:14px 20px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation">
        ${dateFormatted ? `<tr><td style="padding:2px 10px 2px 0;font-size:14px;color:${b.muted};font-family:${b.fontStack};">When</td><td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${dateFormatted}</td></tr>` : ""}
        ${locationText ? `<tr><td style="padding:2px 10px 2px 0;font-size:14px;color:${b.muted};font-family:${b.fontStack};">Where</td><td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${locationText}</td></tr>` : ""}
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
   RESERVATION EMAIL (payment pending)
   ══════════════════════════════════════════ */
export function reservationEmail({
  name,
  eventTitle,
  imageUrl = "",
  location = "",
  startsAt = "",
  endsAt = "",
  timezone = "",
  plusOnes = 0,
  slug = "",
  frontendUrl = "https://pullup.se",
  holdMinutes = 30,
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
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${locationText}</td>
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
        <td style="font-size:14px;color:${b.ink};font-weight:600;font-family:${b.fontStack};">${locationText}</td>
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
