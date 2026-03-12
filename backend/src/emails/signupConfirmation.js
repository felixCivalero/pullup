/**
 * Branded PullUp signup confirmation & waitlist emails.
 * Matches the dark / gold VIP-invite style.
 */

const PULLUP_BG = "#05040a";
const GOLD = "#f59e0b";
const GOLD_LIGHT = "#fbbf24";
const WHITE = "#ffffff";
const MUTED = "rgba(255,255,255,0.6)";
const SUBTLE = "rgba(255,255,255,0.08)";

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
function emailShell(content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:${PULLUP_BG};color:${WHITE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:${PULLUP_BG};">
<tr><td align="center" style="padding:20px 16px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:${PULLUP_BG};">
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

/* ── Badge pill component ── */
function badge(text, { bg = "rgba(245,158,11,0.15)", border = "rgba(245,158,11,0.3)", color = GOLD_LIGHT } = {}) {
  return `<span style="display:inline-block;padding:6px 20px;border-radius:999px;background:${bg};border:1px solid ${border};color:${color};font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">${text}</span>`;
}

/* ── Footer with host branding ── */
function emailFooter({ message = "", brandName = "", brandWebsite = "", contactEmail = "", frontendUrl = "" } = {}) {
  // Build footer links: prefer host branding, fall back to just the event link (no PullUp branding)
  const parts = [];
  if (message) parts.push(message);
  if (contactEmail) parts.push(`<br>Questions? <a href="mailto:${contactEmail}" style="color:rgba(255,255,255,0.4);text-decoration:none;">${contactEmail}</a>`);
  if (brandWebsite) {
    const displayUrl = brandWebsite.replace(/^https?:\/\//, "");
    parts.push(`<br><a href="${brandWebsite}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;">${displayUrl}</a>`);
  } else if (brandName) {
    parts.push(`<br>${brandName}`);
  }

  return `<!-- Footer -->
<tr><td style="padding:24px 0 8px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.6;">
    ${parts.join("")}
  </p>
</td></tr>`;
}

/* ── CTA button ── */
function ctaButton(href, label) {
  return `<a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;padding:14px 36px;border-radius:999px;background-color:${GOLD};background-image:linear-gradient(135deg,${GOLD_LIGHT} 0%,${GOLD} 45%,#d97706 100%);color:${PULLUP_BG};font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:1px solid rgba(245,158,11,0.9);">${label}</a>`;
}

/* ── Small link button (for calendar) ── */
function smallButton(href, label) {
  return `<a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;padding:8px 16px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid ${SUBTLE};color:${MUTED};font-size:12px;font-weight:600;letter-spacing:0.04em;">${label}</a>`;
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
  frontendUrl = "https://pullup.se",
  spotifyUrl = "",
  ticketPrice = 0,
  ticketCurrency = "",
  receiptUrl = "",
  // host branding
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
}) {
  const dateFormatted = startsAt ? niceDate(startsAt, timezone) : (date || "");
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const googleCal = startsAt ? googleCalUrl({ title: eventTitle, startsAt, endsAt, location, slug, frontendUrl }) : "";
  const outlookCal = startsAt ? outlookCalUrl({ title: eventTitle, startsAt, endsAt, location, slug, frontendUrl }) : "";

  const partyText = plusOnes > 0
    ? `You + ${plusOnes} guest${plusOnes > 1 ? "s" : ""}`
    : "1 guest";

  const statusBadge = isWaitlist
    ? badge("WAITLIST", { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", color: MUTED })
    : badge("CONFIRMED", { bg: "linear-gradient(135deg,#fbbf24 0%,#f59e0b 45%,#d97706 100%)", border: "rgba(245,158,11,0.3)", color: PULLUP_BG });

  const content = `
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
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    ${isWaitlist
      ? `Hi ${name}, you've been added to the waitlist. We'll notify you if a spot opens up.`
      : `Hi ${name}, your spot is confirmed! We look forward to seeing you.`}
  </p>
</td></tr>

<!-- Event Details Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid ${SUBTLE};border-radius:12px;width:100%;max-width:440px;">
    ${dateFormatted ? `<tr><td style="padding:14px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">When</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${dateFormatted}</td>
      </tr></table>
    </td></tr>` : ""}
    ${location ? `<tr><td style="padding:10px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">Where</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${location}</td>
      </tr></table>
    </td></tr>` : ""}
    <tr><td style="padding:10px 20px ${ticketPrice ? "0" : "14px"};">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">Guests</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${partyText}</td>
      </tr></table>
    </td></tr>
    ${ticketPrice ? `<tr><td style="padding:10px 20px 14px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">Receipt</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${receiptUrl
          ? `<a href="${receiptUrl}" target="_blank" style="color:${WHITE};text-decoration:underline;text-decoration-color:rgba(255,255,255,0.3);">${ticketPrice} ${(ticketCurrency || "").toUpperCase()}</a>`
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
  ${ctaButton(eventUrl, "VIEW EVENT")}
</td></tr>

${(googleCal || outlookCal) ? `<!-- Add to Calendar -->
<tr><td align="center" style="padding:8px 0 4px;">
  <p style="margin:0 0 8px;font-size:12px;color:${MUTED};letter-spacing:0.06em;text-transform:uppercase;">Add to calendar</p>
  <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
    ${googleCal ? `<td style="padding:0 4px;">${smallButton(googleCal, "Google")}</td>` : ""}
    ${outlookCal ? `<td style="padding:0 4px;">${smallButton(outlookCal, "Outlook")}</td>` : ""}
  </tr></table>
</td></tr>` : ""}

${emailFooter({ message: isWaitlist ? "If spots open up, you'll receive a notification to confirm your spot." : "See you there!", brandName, brandWebsite, contactEmail, frontendUrl })}`;

  return emailShell(content);
}

/* ══════════════════════════════════════════
   8-HOUR REMINDER EMAIL
   ══════════════════════════════════════════ */
export function reminder8hEmail({
  name,
  eventTitle,
  time,
  imageUrl = "",
  location = "",
  slug = "",
  frontendUrl = "https://pullup.se",
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
}) {
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const content = `
<!-- Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("HAPPENING SOON")}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Message -->
<tr><td style="padding:8px 20px;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    Hi ${name}, <strong>${eventTitle}</strong> starts in about 8 hours.
  </p>
</td></tr>

<!-- Details Card -->
<tr><td align="center" style="padding:16px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid ${SUBTLE};border-radius:12px;">
    <tr><td style="padding:14px 20px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation">
        ${time ? `<tr><td style="padding:2px 10px 2px 0;font-size:14px;color:${MUTED};">Start</td><td style="font-size:14px;color:${WHITE};font-weight:600;">${time}</td></tr>` : ""}
        ${location ? `<tr><td style="padding:2px 10px 2px 0;font-size:14px;color:${MUTED};">Where</td><td style="font-size:14px;color:${WHITE};font-weight:600;">${location}</td></tr>` : ""}
      </table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:20px 0;">
  ${ctaButton(eventUrl, "VIEW EVENT")}
</td></tr>

${emailFooter({ message: "See you soon!", brandName, brandWebsite, contactEmail, frontendUrl })}`;

  return emailShell(content);
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
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
}) {
  const dateFormatted = startsAt ? niceDate(startsAt, timezone) : "";
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const partyText = plusOnes > 0
    ? `You + ${plusOnes} guest${plusOnes > 1 ? "s" : ""}`
    : "1 guest";

  const content = `
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("RESERVED", { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.3)", color: "#60a5fa" })}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    Hi ${name}, your spot is reserved for ${holdMinutes} minutes. Complete your payment to confirm.
  </p>
</td></tr>

<!-- Event Details Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid ${SUBTLE};border-radius:12px;width:100%;max-width:440px;">
    ${dateFormatted ? `<tr><td style="padding:14px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">When</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${dateFormatted}</td>
      </tr></table>
    </td></tr>` : ""}
    ${location ? `<tr><td style="padding:10px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">Where</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${location}</td>
      </tr></table>
    </td></tr>` : ""}
    <tr><td style="padding:10px 20px 14px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">Guests</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${partyText}</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${ctaButton(eventUrl, "COMPLETE PAYMENT")}
</td></tr>

${emailFooter({ message: `Your spot will be released if payment is not completed within ${holdMinutes} minutes.`, brandName, brandWebsite, contactEmail, frontendUrl })}`;

  return emailShell(content);
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
  brandName = "",
  brandWebsite = "",
  contactEmail = "",
}) {
  const dateFormatted = startsAt ? niceDate(startsAt, timezone) : "";
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
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("SPOT AVAILABLE", { bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.3)", color: "#4ade80" })}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    Hi ${name}, a spot has opened up for ${eventTitle}!
    ${isPaidEvent ? " Complete your payment to secure your spot." : " Confirm your booking below."}
  </p>
</td></tr>

<!-- Event Details Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid ${SUBTLE};border-radius:12px;width:100%;max-width:440px;">
    ${dateFormatted ? `<tr><td style="padding:14px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">When</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${dateFormatted}</td>
      </tr></table>
    </td></tr>` : ""}
    ${location ? `<tr><td style="padding:10px 20px 0;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">Where</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${location}</td>
      </tr></table>
    </td></tr>` : ""}
    <tr><td style="padding:10px 20px 14px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:10px;vertical-align:top;font-size:14px;color:${MUTED};">Guests</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;">${partyText}</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${ctaButton(ctaHref, "CONFIRM YOUR SPOT")}
</td></tr>

${emailFooter({ message: `This offer expires in ${expiryText}. After that, your spot may be offered to someone else.`, brandName, brandWebsite, contactEmail, frontendUrl })}`;

  return emailShell(content);
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
}) {
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const content = `
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("REFUND PROCESSED", { bg: "rgba(255,255,255,0.06)", border: "rgba(255,255,255,0.12)", color: MUTED })}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    ${isFullRefund
      ? `Hi ${name}, your payment for ${eventTitle} has been fully refunded.`
      : `Hi ${name}, a partial refund of ${refundAmount} ${currency.toUpperCase()} has been processed for ${eventTitle}.`}
  </p>
</td></tr>

${isFullRefund ? `<!-- Waitlist note -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    Your booking has been moved to the waitlist. The host will contact you if a spot opens up again.
  </p>
</td></tr>` : ""}

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${ctaButton(eventUrl, "VIEW EVENT")}
</td></tr>

${emailFooter({ brandName, brandWebsite, contactEmail, frontendUrl })}`;

  return emailShell(content);
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
}) {
  const eventUrl = slug ? `${frontendUrl}/e/${slug}` : frontendUrl;

  const content = `
<!-- Status Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("BOOKING CANCELLED", { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)", color: "#f87171" })}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Event Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    Hi ${name}, your booking for ${eventTitle} has been cancelled by the host.
  </p>
</td></tr>

<!-- Additional info -->
<tr><td style="padding:8px 20px 0;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    If you believe this was a mistake, please ${contactEmail ? `contact the organizer at <a href="mailto:${contactEmail}" style="color:rgba(255,255,255,0.7);">${contactEmail}</a>` : "contact the event organizer"}.
  </p>
</td></tr>

<!-- CTA Button -->
<tr><td align="center" style="padding:20px 0 8px;">
  ${ctaButton(eventUrl, "VIEW EVENT")}
</td></tr>

${emailFooter({ brandName, brandWebsite, contactEmail, frontendUrl })}`;

  return emailShell(content);
}
