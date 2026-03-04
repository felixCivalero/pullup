// backend/src/email/providers/providerRouter.js

import { EMAIL_PROVIDER } from "../config.js";
import { sendEmailViaSes } from "./sesProvider.js";
import { sendEmailViaResend } from "./resendProvider.js";

export function getActiveProvider() {
  const provider = EMAIL_PROVIDER;

  if (provider === "ses") {
    return {
      name: "ses",
      sendEmail: sendEmailViaSes,
    };
  }

  if (provider === "resend") {
    return {
      name: "resend",
      sendEmail: sendEmailViaResend,
    };
  }

  // Fallback to Resend for unknown values to avoid hard failures.
  console.warn(
    `[providerRouter] Unknown EMAIL_PROVIDER="${provider}", falling back to Resend.`,
  );
  return {
    name: "resend",
    sendEmail: sendEmailViaResend,
  };
}

