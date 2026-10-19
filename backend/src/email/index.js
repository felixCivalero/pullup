// backend/src/email/index.js
//
// One way to send mail: straight to Resend. The site sends a handful of mails
// (a request lands in Felix's inbox, a booklet link goes to a visitor), so
// there is no outbox queue and no worker process — a failed send is logged by
// the caller and the request itself is already saved in the database.

import { SES_FROM_EMAIL } from "./config.js";
import { sendEmailViaResend } from "./providers/resendProvider.js";

export async function sendEmail({ from = SES_FROM_EMAIL, to, subject, html, text, replyTo = null }) {
  const result = await sendEmailViaResend({ from, to, subject, html, text, replyTo });
  // The Resend SDK reports failures in the result instead of throwing.
  if (result?.raw?.error) {
    throw new Error(result.raw.error.message || "resend_send_failed");
  }
  return result;
}
