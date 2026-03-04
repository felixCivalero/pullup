// backend/lambda/emailEventsHandler.js
// Thin EventBridge -> HTTP forwarder for SES events.

import crypto from "crypto";

export async function handler(event) {
  try {
    if (!event || typeof event !== "object") {
      console.warn("[emailEventsHandler] Received invalid event", event);
      return {
        statusCode: 400,
        body: JSON.stringify({ ok: false, error: "Invalid event" }),
      };
    }

    // Guard on SES source if present
    if (event.source && event.source !== "aws.ses") {
      console.log(
        "[emailEventsHandler] Ignoring non-SES event",
        event.source,
      );
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, ignored: true }),
      };
    }

    const notification = event.detail || {};

    const url = process.env.EVENTS_WEBHOOK_URL;
    const secret = process.env.EVENTS_WEBHOOK_SECRET;

    if (!url || !secret) {
      console.error(
        "[emailEventsHandler] Missing EVENTS_WEBHOOK_URL or EVENTS_WEBHOOK_SECRET",
      );
      return {
        statusCode: 500,
        body: JSON.stringify({
          ok: false,
          error: "Lambda is not configured with webhook URL/secret",
        }),
      };
    }

    const body = JSON.stringify(notification);
    const signature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-events-signature": signature,
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(
        "[emailEventsHandler] Backend returned non-2xx",
        response.status,
        text,
      );
      // Throwing ensures EventBridge will retry and DLQ will capture persistent failures.
      throw new Error(
        `Backend webhook failed with status ${response.status}: ${text}`,
      );
    }

    const respBody = await response.text();

    return {
      statusCode: 200,
      body: respBody || JSON.stringify({ ok: true }),
    };
  } catch (error) {
    console.error("[emailEventsHandler] Error forwarding SES event", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        ok: false,
        error: error.message || "Internal error",
      }),
    };
  }
}

