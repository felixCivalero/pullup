// backend/src/services/payments/providers/swish.js
//
// Swish Handel — the Stockholm rail. Two flows from one payment request:
//   m-commerce (no payerAlias) → Swish returns a PaymentRequestToken; the
//     guest's phone deep-links `swish://paymentrequest?token=...` and the
//     Swish app opens pre-filled.
//   e-commerce (payerAlias = guest's number) → the request lands directly in
//     their Swish app, no token needed.
// We send e-commerce when the guest typed a number, m-commerce otherwise.
//
// Transport is mTLS — Swish authenticates merchants by client certificate,
// not API keys. Env: SWISH_PAYEE_ALIAS / SWISH_CERT_PATH / SWISH_KEY_PATH /
// SWISH_CA_PATH / SWISH_ENV. Sandbox = the public MSS simulator with the
// published test certs, so the rail is testable before the bank agreement.
//
// Callbacks: Swish POSTs {id, status: PAID|DECLINED|ERROR|CANCELLED} to our
// webhook. We treat the callback as a HINT and re-fetch the payment request
// from Swish over mTLS before settling — the confirmation is then rooted in
// our outbound authenticated channel, not in trusting inbound JSON.

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import { swishConfig } from "../../../config/billing.js";

const BASE = {
  sandbox: "https://mss.cpc.getswish.net/swish-cpcapi",
  production: "https://cpc.getswish.net/swish-cpcapi",
};

let cachedAgent = null;
function tlsAgent(cfg) {
  if (cachedAgent) return cachedAgent;
  cachedAgent = new https.Agent({
    cert: readFileSync(cfg.certPath),
    key: readFileSync(cfg.keyPath),
    ca: cfg.caPath ? readFileSync(cfg.caPath) : undefined,
  });
  return cachedAgent;
}

// Minimal https-with-client-cert request (fetch can't carry client certs).
function swishRequest(cfg, method, path, body = null) {
  const url = new URL(`${BASE[cfg.env]}${path}`);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        hostname: url.hostname,
        path: url.pathname,
        agent: tlsAgent(cfg),
        headers: body ? { "Content-Type": "application/json" } : {},
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data ? safeJson(data) : null,
          })
        );
      }
    );
    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function safeJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// Swish e-commerce wants 46XXXXXXXXX (no plus, country code, no leading zero).
export function normalizeSwedishMsisdn(phone) {
  let p = String(phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = `46${p.slice(1)}`;
  if (!/^46\d{7,11}$/.test(p)) return null;
  return p;
}

export const swishProvider = {
  key: "swish",

  available() {
    return swishConfig().configured;
  },

  async createCharge({ amountCents, currency, phone, description, reference }) {
    const cfg = swishConfig();
    if (!cfg.configured) throw new Error("swish_not_configured");
    if ((currency || "").toLowerCase() !== "sek") {
      throw new Error("swish_requires_sek");
    }

    // Swish instruction ids: 32 uppercase hex, minted by the merchant.
    const instructionId = crypto.randomUUID().replace(/-/g, "").toUpperCase();
    const payerAlias = phone ? normalizeSwedishMsisdn(phone) : null;

    const body = {
      payeePaymentReference: (reference || "PULLUP").replace(/[^A-Za-z0-9]/g, "").slice(0, 35),
      callbackUrl: cfg.callbackUrl,
      payeeAlias: cfg.payeeAlias,
      currency: "SEK",
      amount: ((Number(amountCents) || 0) / 100).toFixed(2),
      message: (description || "PullUp ticket").slice(0, 50),
      ...(payerAlias ? { payerAlias } : {}),
    };

    const res = await swishRequest(
      cfg,
      "PUT",
      `/api/v2/paymentrequests/${instructionId}`,
      body
    );
    if (res.status !== 201) {
      const msg = Array.isArray(res.body)
        ? res.body.map((e) => e.errorCode).join(",")
        : res.status;
      throw new Error(`swish_request_failed: ${msg}`);
    }

    const token = res.headers["paymentrequesttoken"] || null;
    return {
      providerRef: instructionId,
      status: "pending",
      instructions: payerAlias
        ? {
            type: "swish_ecommerce",
            message: "Open Swish on your phone — the payment request is waiting.",
          }
        : {
            type: "swish_mcommerce",
            token,
            appUrl: token
              ? `swish://paymentrequest?token=${token}&callbackurl=`
              : null,
            message: "Tap to open Swish and approve the payment.",
          },
    };
  },

  // Callback → normalized hint. Settlement re-verifies via fetchStatus before
  // trusting it (see module header).
  parseWebhook(body) {
    if (!body?.id) return null;
    const status = String(body.status || "").toUpperCase();
    const outcome =
      status === "PAID" ? "succeeded" : status === "CREATED" ? null : "failed";
    if (outcome === null) return null; // not a settlement event
    return {
      providerRef: body.id,
      eventType: `swish.${status.toLowerCase()}`,
      outcome,
      raw: body,
      needsVerification: true,
    };
  },

  // Authoritative status straight from Swish over mTLS.
  async fetchStatus(providerRef) {
    const cfg = swishConfig();
    const res = await swishRequest(cfg, "GET", `/api/v1/paymentrequests/${providerRef}`);
    if (res.status !== 200 || !res.body) return null;
    const status = String(res.body.status || "").toUpperCase();
    return status === "PAID" ? "succeeded" : status === "CREATED" ? "pending" : "failed";
  },
};
