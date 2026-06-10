// Stripe webhook ingestion — mounted BEFORE the global JSON parser to keep the
// raw body for signature verification.
import express from "express";

import { isDevelopment } from "../lib/urls.js";
import { handleStripeWebhook, getStripeSecretKey } from "../stripe.js";

export function registerStripeWebhookRoutes(app) {
  // ---------------------------
  // WEBHOOKS: Stripe webhook handler (MUST be before express.json() middleware)
  // ---------------------------
  app.post(
    "/webhooks/stripe",
    // CRITICAL: Use express.raw() to preserve raw body for signature verification
    // Must match Stripe's exact body format (no JSON parsing)
    express.raw({
      type: "application/json",
      verify: (req, res, buf) => {
        // Store raw body for signature verification
        req.rawBody = buf;
      },
    }),
    async (req, res) => {
      // Log that webhook endpoint was hit
      console.log("[Webhook] ⚡ Webhook endpoint hit!");
      console.log("[Webhook] Request method:", req.method);
      console.log("[Webhook] Request headers:", {
        "content-type": req.headers["content-type"],
        "stripe-signature": req.headers["stripe-signature"]
          ? "present"
          : "missing",
      });

      const sig = req.headers["stripe-signature"];

      // Get webhook secret - prefer TEST_ prefixed in development
      const webhookSecret = isDevelopment
        ? process.env.TEST_STRIPE_WEBHOOK_SECRET ||
          process.env.STRIPE_WEBHOOK_SECRET
        : process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        const missingVar = isDevelopment
          ? "TEST_STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET"
          : "STRIPE_WEBHOOK_SECRET";
        console.error(`[Webhook] ❌ ${missingVar} not configured`);
        return res.status(500).json({ error: "Webhook secret not configured" });
      }

      if (isDevelopment && process.env.TEST_STRIPE_WEBHOOK_SECRET) {
        console.log("🔧 [DEV] Using TEST Stripe webhook secret");
        console.log(
          "[Webhook] Secret starts with:",
          webhookSecret?.substring(0, 10) + "..."
        );
      }

      // Verify body is raw buffer
      console.log("[Webhook] Body type:", typeof req.body);
      console.log("[Webhook] Body is Buffer:", Buffer.isBuffer(req.body));
      console.log("[Webhook] Body length:", req.body?.length);

      let event;

      try {
        const stripe = (await import("stripe")).default;
        const stripeInstance = new stripe(getStripeSecretKey());

        // Use raw body (Buffer) for signature verification
        // req.body should already be a Buffer from express.raw()
        const rawBody = req.rawBody || req.body;

        if (!Buffer.isBuffer(rawBody)) {
          console.error(
            "[Webhook] ❌ Body is not a Buffer! Type:",
            typeof rawBody
          );
          return res
            .status(400)
            .send("Webhook Error: Invalid request body format");
        }

        event = stripeInstance.webhooks.constructEvent(
          rawBody,
          sig,
          webhookSecret
        );
        console.log("[Webhook] ✅ Signature verified successfully");
        console.log("[Webhook] Event type:", event.type);
        console.log("[Webhook] Event ID:", event.id);
      } catch (err) {
        console.error("[Webhook] ❌ Signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // Process synchronously and only THEN ack 200. The previous pattern
      // was "ack 200, process in background" — any uncaught throw inside
      // handleStripeWebhook silently lost the event because Stripe saw 200
      // and never retried. The audit flagged this as a real source of
      // payment-state drift. Stripe's webhook timeout is ~30s; our
      // handlers are well under that, so awaiting is safe.
      //
      // Stripe automatically retries on any non-2xx for up to 3 days with
      // exponential backoff — so a 500 here is the correct way to ask for
      // a retry. We deliberately do NOT include err.message in the
      // response body to avoid leaking internal details to anyone able to
      // POST to /webhooks/stripe (signature verification already happened
      // above, so this is defense-in-depth).
      try {
        const result = await handleStripeWebhook(event);
        console.log("[Webhook] ✅ Event processed:", {
          type: event.type,
          id: event.id,
          processed: result.processed,
          error: result.error,
        });
        res.json({ received: true });
      } catch (error) {
        console.error("[Webhook] ❌ Processing error:", {
          type: event.type,
          id: event.id,
          error: error.message,
          stack: error.stack,
        });
        res.status(500).send("Webhook processing failed — will be retried");
      }
    }
  );
}
