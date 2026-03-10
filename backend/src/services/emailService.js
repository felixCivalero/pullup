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

/**
 * Plain-text email when an existing user is added as co-host.
 */
export function coHostAddedEmailBody({ eventTitle, role }) {
  return `You've been added as ${role} to the event "${eventTitle}".

Log in to manage the event:

${PULLUP_URL}
`;
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
