import { Resend } from "resend";

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
