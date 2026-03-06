// backend/src/email/providers/sesProvider.js

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import crypto from "crypto";
import {
  SES_REGION,
  SES_FROM_EMAIL,
  SES_CONFIGURATION_SET_NAME,
  SES_TEST_MODE,
} from "../config.js";

let sesClient = null;

function getSesClient() {
  if (SES_TEST_MODE) {
    // In test mode we don't actually need a client.
    return null;
  }
  if (sesClient) return sesClient;
  if (!SES_REGION) {
    throw new Error(
      "[sesProvider] SES_REGION is required when EMAIL_PROVIDER=ses and SES_TEST_MODE=false",
    );
  }
  sesClient = new SESv2Client({ region: SES_REGION });
  return sesClient;
}

export async function sendEmailViaSes({
  from = SES_FROM_EMAIL,
  to,
  subject,
  html,
  text,
  tags = {},
}) {
  if (!to) {
    throw new Error("[sesProvider] 'to' is required");
  }
  if (!subject) {
    throw new Error("[sesProvider] 'subject' is required");
  }

  const hasHtml = !!html;
  const hasText = !!text;

  if (!hasHtml && !hasText) {
    // Guarantee at least a text body
    text = "";
  }

  if (SES_TEST_MODE) {
    const fakeId = `TEST-${crypto.randomUUID()}`;
    console.log("[sesProvider] SES_TEST_MODE=true, not sending to SES", {
      to,
      subject,
      fakeId,
    });
    return {
      provider: "ses",
      messageId: fakeId,
      raw: { testMode: true },
    };
  }

  const client = getSesClient();

  const body = {};
  if (hasHtml) {
    body.Html = { Data: html, Charset: "UTF-8" };
  }
  if (hasText || !hasHtml) {
    body.Text = { Data: text ?? "", Charset: "UTF-8" };
  }

  const input = {
    Destination: {
      ToAddresses: [to],
    },
    FromEmailAddress: from,
    Content: {
      Simple: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: body,
      },
    },
  };

  if (SES_CONFIGURATION_SET_NAME) {
    input.ConfigurationSetName = SES_CONFIGURATION_SET_NAME;
  }

  const allTags = {
    ...tags,
    env: process.env.NODE_ENV || "unknown",
  };

  const emailTags = Object.entries(allTags).map(([Name, Value]) => ({
    Name,
    Value: String(Value),
  }));

  if (emailTags.length > 0) {
    input.EmailTags = emailTags;
  }

  const command = new SendEmailCommand(input);
  const result = await client.send(command);

  const messageId = result?.MessageId || null;

  return {
    provider: "ses",
    messageId,
    raw: result,
  };
}
