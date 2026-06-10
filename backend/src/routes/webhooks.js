// Webhook ingestion routes: email provider events (SES SNS/EventBridge, Resend
// inbound + delivery events) plus WhatsApp and Instagram Meta webhooks.
import express from "express";
import crypto from "crypto";

import { processSesEvent } from "../email/events/processSesEvent.js";
import { handleProviderEvent } from "../email/index.js";
import { handleSesInboundEvent } from "../email/webhooks/sesInboundWebhook.js";
import { handleResendInboundEvent } from "../email/webhooks/resendInboundWebhook.js";
import { handleResendEventEvent } from "../email/webhooks/resendEventsWebhook.js";
import {
  handleVerification as handleWhatsappWebhookVerification,
  handleEventDelivery as handleWhatsappWebhookDelivery,
} from "../whatsapp/webhooks/metaWebhook.js";
import {
  handleIgWebhookVerification,
  handleIgWebhookDelivery,
  handleIgDeauthorize,
  handleIgDataDeletion,
  handleIgDataDeletionStatus,
} from "../instagram/webhooks/metaIgWebhook.js";

export function registerWebhookRoutes(app) {
  // ---------------------------
  // WEBHOOKS: SES SNS webhook
  // ---------------------------
  app.post("/webhooks/ses", async (req, res) => {
    try {
      const result = await handleProviderEvent({
        provider: "ses",
        rawHeaders: req.headers,
        rawBody: req.body,
      });
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error("[Webhook][SES] Error processing webhook", error);
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      res.status(status).json({ error: error?.message || "Failed to process SES webhook" });
    }
  });

  // ---------------------------
  // WEBHOOKS: SES EventBridge (raw SES notifications)
  // ---------------------------
  app.post("/webhooks/ses-eventbridge", async (req, res) => {
    try {
      const secret = process.env.EVENTS_WEBHOOK_SECRET;
      const signatureHeader =
        req.headers["x-pullup-signature"] || req.headers["X-Pullup-Signature"];

      // Constant-time compare so an attacker can't time-side-channel out
      // the secret one byte at a time. Length-check first because
      // timingSafeEqual throws on unequal lengths.
      const isValid =
        !!secret &&
        !!signatureHeader &&
        typeof signatureHeader === "string" &&
        Buffer.byteLength(signatureHeader) === Buffer.byteLength(secret) &&
        crypto.timingSafeEqual(
          Buffer.from(signatureHeader),
          Buffer.from(secret),
        );

      if (!isValid) {
        console.warn("[Webhook][SES-EventBridge] Unauthorized request", {
          hasSecret: !!secret,
          hasSignature: !!signatureHeader,
        });
        return res.status(401).json({ ok: false, error: "unauthorized" });
      }

      const notification = req.body;

      if (!notification || typeof notification !== "object") {
        console.warn(
          "[Webhook][SES-EventBridge] Invalid body, expected object",
          typeof notification,
        );
        return res
          .status(400)
          .json({ ok: false, error: "invalid_body" });
      }

      const mail = notification.mail || {};
      const tags = mail.tags || {};
      const eventType = notification.eventType || null;
      const messageId = mail.messageId || null;
      const outboxIdTag = tags.outbox_id;
      const outboxId = Array.isArray(outboxIdTag)
        ? outboxIdTag[0]
        : outboxIdTag || null;

      console.log("[Webhook][SES-EventBridge] Incoming SES event", {
        eventType,
        messageId,
        outboxId,
      });

      const result = await processSesEvent(notification);

      return res.json({
        ok: true,
        eventType: result?.eventType ?? null,
      });
    } catch (error) {
      console.error(
        "[Webhook][SES-EventBridge] Error processing EventBridge webhook",
        error,
      );
      res.status(500).json({
        ok: false,
        error: "Failed to process SES EventBridge webhook",
      });
    }
  });

  // ---------------------------
  // WEBHOOKS: SES inbound (two-way email — guest replies → host Room thread)
  // ---------------------------
  // SNS posts notifications as text/plain, which the global express.json() skips,
  // so parse the body as text here and coerce to the SNS object. The handler does
  // SNS signature verification + subscription confirmation itself.
  app.post(
    "/webhooks/ses-inbound",
    express.text({ type: "*/*", limit: "15mb" }),
    async (req, res) => {
      try {
        const body =
          typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
        const result = await handleSesInboundEvent({ body });
        res.json(result);
      } catch (error) {
        console.error("[Webhook][SES-inbound] Error", error);
        const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
        res.status(status).json({ error: error?.message || "Failed to process inbound email" });
      }
    },
  );

  // ---------------------------
  // WEBHOOKS: Resend inbound (two-way email — guest replies → host Room thread)
  // ---------------------------
  // Resend posts application/json, so the global express.json() already parsed
  // req.body AND captured the exact bytes in req.rawBody (verify hook above) —
  // the Svix signature is checked against those raw bytes.
  app.post("/webhooks/resend-inbound", async (req, res) => {
    try {
      const result = await handleResendInboundEvent({
        rawBody: req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body || {}),
        body: req.body,
        headers: req.headers,
      });
      res.json(result);
    } catch (error) {
      console.error("[Webhook][Resend-inbound] Error", error);
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      res.status(status).json({ error: error?.message || "Failed to process inbound email" });
    }
  });

  // Resend DELIVERY events (delivered / bounced / opened / clicked) → Room ticks.
  // Gives email the same sent → delivered → read language as WhatsApp on the prod
  // provider. Same Svix secret as inbound.
  app.post("/webhooks/resend-events", async (req, res) => {
    try {
      const result = await handleResendEventEvent({
        rawBody: req.rawBody ? req.rawBody.toString("utf8") : JSON.stringify(req.body || {}),
        body: req.body,
        headers: req.headers,
      });
      res.json(result);
    } catch (error) {
      console.error("[Webhook][Resend-events] Error", error);
      const status = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
      res.status(status).json({ error: error?.message || "Failed to process resend event" });
    }
  });

  // ---------------------------
  // WEBHOOKS: WhatsApp (Meta Cloud API)
  // ---------------------------
  // GET = Meta's one-time verification challenge when registering the URL.
  // POST = ongoing event delivery (status updates + inbound messages).
  // Signature validation uses req.rawBody (captured by the global json
  // middleware's `verify` hook above).
  app.get("/webhooks/whatsapp", handleWhatsappWebhookVerification);
  app.post("/webhooks/whatsapp", handleWhatsappWebhookDelivery);

  // ---------------------------
  // WEBHOOKS: Instagram (Meta Graph — app "pullup dm")
  // ---------------------------
  // GET = Meta's verification challenge. POST = comments + inbound DMs.
  // Same rawBody-based signature validation as WhatsApp. Public URL (nginx
  // strips /api): https://pullup.se/api/webhooks/instagram
  app.get("/webhooks/instagram", handleIgWebhookVerification);
  app.post("/webhooks/instagram", handleIgWebhookDelivery);
  // App-management callbacks (Meta signed_request) — required to publish the app.
  app.post("/webhooks/instagram/deauthorize", handleIgDeauthorize);
  app.post("/webhooks/instagram/data-deletion", handleIgDataDeletion);
  app.get("/webhooks/instagram/data-deletion/status", handleIgDataDeletionStatus);
}
