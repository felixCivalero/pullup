import { sendEmail as infraSendEmail } from "../email/index.js";
import { renderEventEmailTemplate } from "./emailTemplateService.js";

export async function sendEmail({ to, subject, html, text, from }) {
  return infraSendEmail({
    from: from || '"PullUp RSVP" <no-reply@pullup.se>',
    to,
    subject,
    html,
    text,
  });
}

const PULLUP_URL = "https://pullup.se";

/* ── Shared branded email shell ── */
const BG = "#05040a";
const WHITE = "#ffffff";
const MUTED = "rgba(255,255,255,0.6)";
const GOLD = "#f59e0b";
const GOLD_LIGHT = "#fbbf24";
const SUBTLE = "rgba(255,255,255,0.08)";

function emailShell(content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>
<body style="margin:0;padding:0;background:${BG};color:${WHITE};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:${BG};">
<tr><td align="center" style="padding:20px 16px;">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:${BG};">
${content}
</table>
</td></tr>
</table>
</body></html>`;
}

function ctaButton(href, label) {
  return `<a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;padding:14px 36px;border-radius:999px;background-color:${GOLD};background-image:linear-gradient(135deg,${GOLD_LIGHT} 0%,${GOLD} 45%,#d97706 100%);color:${BG};font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:1px solid rgba(245,158,11,0.9);">${label}</a>`;
}

function badge(text) {
  return `<span style="display:inline-block;padding:6px 20px;border-radius:999px;background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.3);color:${GOLD_LIGHT};font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">${text}</span>`;
}

/**
 * Branded HTML email when an existing user is added as co-host.
 */
export function coHostAddedEmailBody({ eventTitle, role }) {
  // Plain text fallback
  return `You've been added as ${role} to the event "${eventTitle}".

Log in to manage the event:

${PULLUP_URL}
`;
}

export function coHostAddedEmailHtml({ eventTitle, role, imageUrl = "", slug = "" }) {
  const eventUrl = slug ? `${PULLUP_URL}/e/${slug}` : PULLUP_URL;

  const content = `
<!-- Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("CO-HOST")}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Message -->
<tr><td style="padding:8px 20px;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    You've been added as <strong style="color:${GOLD_LIGHT};">${role}</strong> to this event. Log in to start managing it.
  </p>
</td></tr>

<!-- Role Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid ${SUBTLE};border-radius:12px;">
    <tr><td style="padding:14px 24px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:12px;font-size:14px;color:${MUTED};">Your role</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;text-transform:capitalize;">${role}</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:20px 0;">
  ${ctaButton(eventUrl, "MANAGE EVENT")}
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 0 8px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.6;">
    <a href="${PULLUP_URL}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;">pullup.se</a>
  </p>
</td></tr>`;

  return emailShell(content);
}

/**
 * Plain-text email when someone is invited to co-host (no account yet).
 */
export function coHostInvitedEmailBody({ eventTitle, role }) {
  return `You're invited to co-host the event "${eventTitle}" as ${role}.

Sign up or log in to accept and manage the event:

${PULLUP_URL}
`;
}

export function coHostInvitedEmailHtml({ eventTitle, role, imageUrl = "", slug = "" }) {
  const eventUrl = slug ? `${PULLUP_URL}/e/${slug}` : PULLUP_URL;

  const content = `
<!-- Badge -->
<tr><td align="center" style="padding:24px 0 16px;">
  ${badge("CO-HOST INVITE")}
</td></tr>

${imageUrl ? `<!-- Event Image -->
<tr><td style="padding:0;">
  <img src="${imageUrl}" alt="${eventTitle.replace(/"/g, "&quot;")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px;object-fit:cover;max-height:280px;border:0;outline:none;" />
</td></tr>` : ""}

<!-- Title -->
<tr><td style="padding:20px 0 4px;text-align:center;">
  <h1 style="margin:0;font-size:26px;font-weight:700;color:${WHITE};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Message -->
<tr><td style="padding:8px 20px;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(255,255,255,0.7);line-height:1.5;">
    You've been invited to co-host this event as <strong style="color:${GOLD_LIGHT};">${role}</strong>. Sign up or log in to accept and start managing it.
  </p>
</td></tr>

<!-- Role Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(255,255,255,0.04);border:1px solid ${SUBTLE};border-radius:12px;">
    <tr><td style="padding:14px 24px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:12px;font-size:14px;color:${MUTED};">Invited as</td>
        <td style="font-size:14px;color:${WHITE};font-weight:600;text-transform:capitalize;">${role}</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:20px 0;">
  ${ctaButton(eventUrl, "GET STARTED")}
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 0 8px;border-top:1px solid rgba(255,255,255,0.06);">
  <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);text-align:center;line-height:1.6;">
    <a href="${PULLUP_URL}" target="_blank" style="color:rgba(255,255,255,0.4);text-decoration:none;">pullup.se</a>
  </p>
</td></tr>`;

  return emailShell(content);
}

/**
 * Send email with Resend template
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {Object} params.templateContent - Template content (headline, introQuote, etc.)
 * @param {Object} params.event - Event data
 * @param {Object} params.person - Person data (optional, for personalization)
 * @returns {Promise} Enqueued outbox row
 */
export async function sendEmailWithTemplate({
  to,
  subject,
  templateContent,
  event,
  person,
}) {
  const html = renderEventEmailTemplate({ event, templateContent, person });

  return infraSendEmail({
    from: '"PullUp" <no-reply@pullup.se>',
    to,
    subject,
    html,
  });
}
