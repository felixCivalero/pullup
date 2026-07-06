import { sendEmail as infraSendEmail } from "../email/index.js";

export async function sendEmail({ to, subject, html, text, from, personId = null, hostProfileId = null, campaignTag = null }) {
  return infraSendEmail({
    from: from || '"PullUp RSVP" <no-reply@pullup.se>',
    to,
    subject,
    html,
    text,
    // When a host↔guest send passes these, the email becomes repliable: a reply
    // routes back into this host's Room thread (two-way email). Platform emails
    // (auth, receipts) omit them and stay correctly non-repliable.
    personId,
    hostProfileId,
    // 'concierge_*' tags mark the reply chain as system communication: the
    // host's reply to a tagged notification is delivered as PullUp
    // (felix@pullup.se), not as an ordinary host message.
    campaignTag,
  });
}

const PULLUP_URL = "https://pullup.se";

/* ── Shared branded email shell (light identity: white canvas, pink accents) ── */
const BG = "#ffffff";
const INK = "#0c0a12";
const WHITE = "#ffffff";
const MUTED = "rgba(12,10,18,0.55)";
const PINK = "#ec178f";
const SUBTLE = "rgba(0,0,0,0.08)";

function emailShell(content) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"></head>
<body style="margin:0;padding:0;background:${BG};color:${INK};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
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
  return `<a href="${href}" target="_blank" style="display:inline-block;text-decoration:none;padding:14px 36px;border-radius:999px;background-color:${PINK};color:${WHITE};font-size:15px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;border:1px solid ${PINK};">${label}</a>`;
}

function badge(text) {
  return `<span style="display:inline-block;padding:6px 20px;border-radius:999px;background:rgba(236,23,143,0.10);border:1px solid rgba(236,23,143,0.30);color:${PINK};font-size:11px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;">${text}</span>`;
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
  <h1 translate="no" class="notranslate" style="margin:0;font-size:26px;font-weight:700;color:${INK};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Message -->
<tr><td style="padding:8px 20px;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(12,10,18,0.75);line-height:1.5;">
    You've been added as <strong style="color:${PINK};">${role}</strong> to this event. Log in to start managing it.
  </p>
</td></tr>

<!-- Role Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(0,0,0,0.035);border:1px solid ${SUBTLE};border-radius:12px;">
    <tr><td style="padding:14px 24px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:12px;font-size:14px;color:${MUTED};">Your role</td>
        <td style="font-size:14px;color:${INK};font-weight:600;text-transform:capitalize;">${role}</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:20px 0;">
  ${ctaButton(eventUrl, "MANAGE EVENT")}
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 0 8px;border-top:1px solid rgba(0,0,0,0.08);">
  <p style="margin:0;font-size:12px;color:rgba(12,10,18,0.45);text-align:center;line-height:1.6;">
    <a href="${PULLUP_URL}" target="_blank" style="color:rgba(12,10,18,0.55);text-decoration:none;">pullup.se</a>
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
  <h1 translate="no" class="notranslate" style="margin:0;font-size:26px;font-weight:700;color:${INK};line-height:1.3;">${eventTitle}</h1>
</td></tr>

<!-- Message -->
<tr><td style="padding:8px 20px;text-align:center;">
  <p style="margin:0;font-size:15px;color:rgba(12,10,18,0.75);line-height:1.5;">
    You've been invited to co-host this event as <strong style="color:${PINK};">${role}</strong>. Sign up or log in to accept and start managing it.
  </p>
</td></tr>

<!-- Role Card -->
<tr><td align="center" style="padding:20px 0 8px;">
  <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="background:rgba(0,0,0,0.035);border:1px solid ${SUBTLE};border-radius:12px;">
    <tr><td style="padding:14px 24px;">
      <table border="0" cellpadding="0" cellspacing="0" role="presentation"><tr>
        <td style="padding-right:12px;font-size:14px;color:${MUTED};">Invited as</td>
        <td style="font-size:14px;color:${INK};font-weight:600;text-transform:capitalize;">${role}</td>
      </tr></table>
    </td></tr>
  </table>
</td></tr>

<!-- CTA -->
<tr><td align="center" style="padding:20px 0;">
  ${ctaButton(eventUrl, "GET STARTED")}
</td></tr>

<!-- Footer -->
<tr><td style="padding:20px 0 8px;border-top:1px solid rgba(0,0,0,0.08);">
  <p style="margin:0;font-size:12px;color:rgba(12,10,18,0.45);text-align:center;line-height:1.6;">
    <a href="${PULLUP_URL}" target="_blank" style="color:rgba(12,10,18,0.55);text-decoration:none;">pullup.se</a>
  </p>
</td></tr>`;

  return emailShell(content);
}

