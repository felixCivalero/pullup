// ════════════════════════════════════════════════════════════════════════
// DAILY DIGEST EMAIL — the host's slim once-a-day "what happened in your
// world" summary. ONE clean PullUp look: white canvas, near-black ink, pink
// accent. No host brand theming (brand design is being removed). Transactional
// host email (the host opted in). No emojis (house rule).
// ════════════════════════════════════════════════════════════════════════

const BG = "#ffffff";
const INK = "#0a0a0a";
const MUTED = "rgba(10,10,10,0.55)";
const FAINT = "rgba(10,10,10,0.42)";
const HAIRLINE = "rgba(10,10,10,0.10)";
const CARD = "#fafafa";
const PINK = "#ec178f";
const FONT_STACK = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Light-only: tell clients to keep it light so dark-mode doesn't invert the
// white canvas into something muddy.
function shell(content) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<style>:root{color-scheme:light;}</style></head>
<body style="margin:0;padding:0;background:${BG};color:${INK};font-family:${FONT_STACK};">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:${BG};">
<tr><td align="center" style="padding:32px 16px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:480px;">
${content}
</table></td></tr></table></body></html>`;
}

function sectionBlock(section, isFirst) {
  const rows = section.items.map((it, i) => `<tr><td style="padding:${i ? "13px" : "0"} 0 13px;${i ? `border-top:1px solid ${HAIRLINE};` : ""}">
    <p style="margin:0;font-size:15px;font-weight:600;color:${INK};line-height:1.4;">${esc(it.title)}</p>
    ${it.subtitle ? `<p style="margin:3px 0 0;font-size:13.5px;color:${MUTED};line-height:1.5;">${esc(it.subtitle)}</p>` : ""}
  </td></tr>`).join("");
  const more = section.overflow > 0
    ? `<tr><td style="padding:13px 0 0;border-top:1px solid ${HAIRLINE};"><p style="margin:0;font-size:13.5px;color:${FAINT};">+${section.overflow} more</p></td></tr>`
    : "";
  return `<tr><td style="padding:${isFirst ? "0" : "26px"} 0 0;">
    <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.09em;text-transform:uppercase;color:${PINK};font-weight:700;">${esc(section.label)} · ${section.count}</p>
    <table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">${rows}${more}</table>
  </td></tr>`;
}

/**
 * Build the daily-digest email HTML.
 *
 * @param {object}  opts
 * @param {string}  opts.hostName       host's first name (for the greeting)
 * @param {object}  opts.digest         shaped digest { totalCount, sections }
 * @param {string[]} opts.headlineParts e.g. ["3 new RSVPs","1 message"]
 * @param {string}  opts.roomUrl        link back to the host's room/dashboard
 * @param {string}  opts.frontendUrl
 * @param {boolean} opts.isPreview      true → friendly "nothing new today" framing
 */
export function dailyDigestEmail({
  hostName = "",
  digest = { totalCount: 0, sections: [] },
  headlineParts = [],
  roomUrl = "",
  frontendUrl = "https://pullup.se",
  isPreview = false,
} = {}) {
  const greeting = hostName ? `Hi ${esc(hostName)},` : "Here's your day,";
  const link = roomUrl || frontendUrl;
  const hasActivity = (digest?.totalCount || 0) > 0;

  const headline = hasActivity ? headlineParts.join(" · ") : "Nothing new today";
  const intro = isPreview
    ? "Here's a preview — a sample of everything you've turned on, so you can check your settings. Your real summary only shows what actually happened."
    : hasActivity
      ? "Here's what happened in your world over the last day."
      : "All quiet over the last day.";

  const sections = (digest?.sections || []).map((s, i) => sectionBlock(s, i === 0)).join("");

  const content = `
<tr><td style="padding:0 0 2px;">
  <p style="margin:0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:${FAINT};font-weight:700;">PullUp · Daily summary${isPreview ? " · preview" : ""}</p>
</td></tr>

<tr><td style="padding:6px 0 0;">
  <h1 style="margin:0;font-size:24px;font-weight:700;color:${INK};line-height:1.25;letter-spacing:-0.01em;">${esc(headline)}</h1>
</td></tr>

<tr><td style="padding:8px 0 0;">
  <p style="margin:0;font-size:15px;color:${MUTED};line-height:1.5;">${esc(greeting)} ${esc(intro)}</p>
</td></tr>

${hasActivity ? `<tr><td style="padding:18px 0 0;">${sections}</td></tr>` : ""}

<tr><td align="center" style="padding:24px 0 8px;">
  <a href="${esc(link)}" target="_blank" style="display:inline-block;text-decoration:none;padding:13px 32px;border-radius:999px;background-color:${PINK};color:#ffffff;font-size:14px;font-weight:700;">Open your room</a>
</td></tr>

<tr><td style="padding:22px 0 0;border-top:1px solid ${HAIRLINE};">
  <p style="margin:14px 0 0;font-size:12px;color:${FAINT};text-align:center;line-height:1.6;">
    You're getting this because you turned on the daily summary. Manage it anytime in Settings.
  </p>
</td></tr>`;

  return shell(content);
}

/**
 * Subject line — kept deliberately plain and consistent: "Daily summary".
 * (headlineParts/hasActivity are accepted for backward-compat but unused.)
 */
export function dailyDigestSubject() {
  return "Daily summary";
}
