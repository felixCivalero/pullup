// backend/src/email/providers/resendProvider.js

import { Resend } from "resend";
import { SES_FROM_EMAIL } from "../config.js";

let resendClient = null;

function getResendClient() {
  if (resendClient) return resendClient;
  const apiKey =
    process.env.RESEND_API_KEY || process.env.TEST_RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[resendProvider] RESEND_API_KEY or TEST_RESEND_API_KEY must be set when EMAIL_PROVIDER=resend",
    );
  }
  resendClient = new Resend(apiKey);
  return resendClient;
}

export async function sendEmailViaResend({
  from = SES_FROM_EMAIL,
  to,
  subject,
  html,
  text,
}) {
  const client = getResendClient();

  const payload = {
    from,
    to,
    subject,
  };

  if (text) payload.text = text;
  if (html) payload.html = html;
  if (!payload.text && !payload.html) payload.html = "";

  const result = await client.emails.send(payload);

  const messageId =
    result?.data?.id || result?.id || null;

  return {
    provider: "resend",
    messageId,
    raw: result,
  };
}

