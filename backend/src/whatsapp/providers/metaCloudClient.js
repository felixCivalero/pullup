// backend/src/whatsapp/providers/metaCloudClient.js
//
// Meta WhatsApp Cloud API client. Two methods we actually call from the
// rest of the codebase:
//
//   sendTemplate({ to, templateKey, variables, locale? })  → outbound template
//   sendText({ to, body })                                  → freeform within 24h window
//
// In sandbox mode (WHATSAPP_SANDBOX_MODE=true) we DO NOT hit the network.
// We log the payload and return a synthetic `provider_message_id` so the
// rest of the pipeline (outbox row, webhook, threading) can be exercised
// end-to-end without a verified WABA. This is critical for local dev
// while the Meta business verification (2-7 days) is in flight.

import {
  WHATSAPP_SANDBOX_MODE,
  META_GRAPH_VERSION,
  META_PHONE_NUMBER_ID,
  META_ACCESS_TOKEN,
} from "../config.js";
import {
  getTemplate,
  templateVariablesAsArray,
  renderTemplate,
} from "../templates/registry.js";
import { logger } from "../../logger.js";

const NAME = "meta_cloud";

function graphUrl(path) {
  return `https://graph.facebook.com/${META_GRAPH_VERSION}${path}`;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${META_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
  };
}

function sandboxMessageId(prefix = "sbx") {
  // wamid-shaped so anything pattern-matching real ids still works.
  const rand = Math.random().toString(36).slice(2, 10);
  return `wamid.${prefix}_${Date.now()}_${rand}`;
}

function stripPlus(e164) {
  return e164.startsWith("+") ? e164.slice(1) : e164;
}

/**
 * Send a templated message.
 *
 * @returns {Promise<{ provider: 'meta_cloud', provider_message_id: string,
 *                     sandbox_mode: boolean, body_text: string }>}
 */
export async function sendTemplate({
  to,
  templateKey,
  variables,
  locale,
}) {
  const tmpl = getTemplate(templateKey);
  const body_text = renderTemplate(templateKey, variables);

  if (WHATSAPP_SANDBOX_MODE) {
    logger?.info?.("[whatsapp/sandbox] sendTemplate", {
      to,
      templateKey,
      variables,
      body_text,
    });
    return {
      provider: NAME,
      provider_message_id: sandboxMessageId("tpl"),
      sandbox_mode: true,
      body_text,
    };
  }

  if (!META_PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    throw new Error(
      "[whatsapp/meta] sendTemplate: META_PHONE_NUMBER_ID and META_ACCESS_TOKEN required",
    );
  }

  const payload = {
    messaging_product: "whatsapp",
    to: stripPlus(to),
    type: "template",
    template: {
      name: tmpl.name,
      language: { code: locale || tmpl.locale },
      components: [
        {
          type: "body",
          parameters: templateVariablesAsArray(templateKey, variables),
        },
      ],
    },
  };

  const res = await fetch(graphUrl(`/${META_PHONE_NUMBER_ID}/messages`), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code ?? "unknown";
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(`[whatsapp/meta] sendTemplate failed: ${code} ${message}`);
    err.code = String(code);
    err.providerStatus = res.status;
    err.providerError = json?.error;
    throw err;
  }

  const provider_message_id = json?.messages?.[0]?.id;
  if (!provider_message_id) {
    throw new Error(`[whatsapp/meta] sendTemplate: missing message id in response`);
  }

  return {
    provider: NAME,
    provider_message_id,
    sandbox_mode: false,
    body_text,
  };
}

/**
 * Send a freeform text message. Only valid inside the 24h customer-service
 * window (i.e. user has messaged us in the last 24h).
 */
export async function sendText({ to, body }) {
  if (!body) {
    throw new Error("[whatsapp/meta] sendText: body required");
  }

  if (WHATSAPP_SANDBOX_MODE) {
    logger?.info?.("[whatsapp/sandbox] sendText", { to, body });
    return {
      provider: NAME,
      provider_message_id: sandboxMessageId("txt"),
      sandbox_mode: true,
      body_text: body,
    };
  }

  if (!META_PHONE_NUMBER_ID || !META_ACCESS_TOKEN) {
    throw new Error(
      "[whatsapp/meta] sendText: META_PHONE_NUMBER_ID and META_ACCESS_TOKEN required",
    );
  }

  const payload = {
    messaging_product: "whatsapp",
    to: stripPlus(to),
    type: "text",
    text: { body, preview_url: true },
  };

  const res = await fetch(graphUrl(`/${META_PHONE_NUMBER_ID}/messages`), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = json?.error?.code ?? "unknown";
    const message = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(`[whatsapp/meta] sendText failed: ${code} ${message}`);
    err.code = String(code);
    err.providerStatus = res.status;
    err.providerError = json?.error;
    throw err;
  }

  const provider_message_id = json?.messages?.[0]?.id;
  return {
    provider: NAME,
    provider_message_id,
    sandbox_mode: false,
    body_text: body,
  };
}

export const metaCloudProvider = {
  name: NAME,
  sendTemplate,
  sendText,
};
