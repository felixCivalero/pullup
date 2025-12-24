import { Resend } from "resend";
import { renderEventEmailTemplate } from "./emailTemplateService.js";

const resend = new Resend(
  process.env.RESEND_API_KEY || process.env.TEST_RESEND_API_KEY
);

export async function sendEmail({ to, subject, html }) {
  return resend.emails.send({
    from: '"PullUp RSVP" <no-reply@pullup.se>', // This shows PullUp RSVP as the sender name
    to,
    subject,
    html,
  });
}

/**
 * Send email with Resend template
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {Object} params.templateContent - Template content (headline, introQuote, etc.)
 * @param {Object} params.event - Event data
 * @param {Object} params.person - Person data (optional, for personalization)
 * @returns {Promise} Resend API response
 */
export async function sendEmailWithTemplate({
  to,
  subject,
  templateContent,
  event,
  person,
}) {
  const html = renderEventEmailTemplate({ event, templateContent, person });

  return resend.emails.send({
    from: '"PullUp" <no-reply@pullup.se>',
    to,
    subject,
    html,
  });
}
