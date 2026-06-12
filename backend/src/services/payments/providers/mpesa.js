// backend/src/services/payments/providers/mpesa.js
//
// M-Pesa via Safaricom Daraja — the Nairobi rail. STK push: we fire a charge
// at the guest's phone, their M-Pesa PIN prompt pops, they approve, Daraja
// calls our webhook. CheckoutRequestID is the provider_ref end to end.
//
// Env: MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET / MPESA_SHORTCODE /
//      MPESA_PASSKEY / MPESA_ENV (sandbox|production) / MPESA_CALLBACK_URL.
// Sandbox creds come free from developer.safaricom.co.ke — the rail is fully
// testable before any Paybill exists.

import { mpesaConfig } from "../../../config/billing.js";

const BASE = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

// OAuth tokens live ~1h; cache for 55min so bursts don't hammer the endpoint.
let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken(cfg) {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;
  const auth = Buffer.from(`${cfg.consumerKey}:${cfg.consumerSecret}`).toString("base64");
  const res = await fetch(
    `${BASE[cfg.env]}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  if (!res.ok) throw new Error(`mpesa_oauth_failed: ${res.status}`);
  const json = await res.json();
  cachedToken = json.access_token;
  cachedTokenExpiry = Date.now() + 55 * 60 * 1000;
  return cachedToken;
}

// Daraja wants timestamps as YYYYMMDDHHmmss (Nairobi-agnostic; it just has to
// match the Password hash).
function darajaTimestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds())
  );
}

// 2547XXXXXXXX — Daraja takes no plus, no leading zero.
export function normalizeKenyanMsisdn(phone) {
  let p = String(phone || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = `254${p.slice(1)}`;
  if (p.startsWith("7") || p.startsWith("1")) p = `254${p}`;
  if (!/^254\d{9}$/.test(p)) return null;
  return p;
}

export const mpesaProvider = {
  key: "mpesa",

  available() {
    return mpesaConfig().configured;
  },

  // STK push the guest's phone. amountCents arrives in KES cents; M-Pesa
  // moves whole shillings only, so we round up — never undercharge the host.
  async createCharge({ amountCents, phone, description, reference }) {
    const cfg = mpesaConfig();
    if (!cfg.configured) throw new Error("mpesa_not_configured");
    const msisdn = normalizeKenyanMsisdn(phone);
    if (!msisdn) throw new Error("invalid_kenyan_phone");

    const token = await getAccessToken(cfg);
    const timestamp = darajaTimestamp();
    const password = Buffer.from(
      `${cfg.shortcode}${cfg.passkey}${timestamp}`
    ).toString("base64");

    const res = await fetch(`${BASE[cfg.env]}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: cfg.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.max(1, Math.ceil((Number(amountCents) || 0) / 100)),
        PartyA: msisdn,
        PartyB: cfg.shortcode,
        PhoneNumber: msisdn,
        CallBackURL: cfg.callbackUrl,
        AccountReference: (reference || "PullUp").slice(0, 12),
        TransactionDesc: (description || "PullUp ticket").slice(0, 13),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ResponseCode !== "0") {
      throw new Error(
        `mpesa_stk_failed: ${json.errorMessage || json.ResponseDescription || res.status}`
      );
    }

    return {
      providerRef: json.CheckoutRequestID,
      status: "pending",
      instructions: {
        type: "stk_push",
        phone: msisdn,
        message: "Check your phone — approve the M-Pesa prompt to confirm your spot.",
      },
    };
  },

  // Daraja's callback → one normalized settlement event.
  // ResultCode 0 = paid; anything else (1032 = user cancelled, etc.) = failed.
  parseWebhook(body) {
    const cb = body?.Body?.stkCallback;
    if (!cb?.CheckoutRequestID) return null;
    const succeeded = Number(cb.ResultCode) === 0;
    const items = cb.CallbackMetadata?.Item || [];
    const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value || null;
    return {
      providerRef: cb.CheckoutRequestID,
      eventType: succeeded ? "stk.paid" : `stk.failed.${cb.ResultCode}`,
      outcome: succeeded ? "succeeded" : "failed",
      receipt,
      raw: body,
    };
  },
};
