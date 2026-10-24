// Buying sends (lib/emailCredits.js). The balance and the packs, a Checkout
// session per purchase, and two ways a payment lands — Stripe's webhook and
// the browser coming back from Checkout — both crediting the session once.
import express from "express";
import { requireOwner } from "../middleware/requireOwner.js";
import { getFrontendUrl } from "../lib/urls.js";
import {
  PACKS, packById, checkoutParams, createCheckout, getCheckout, creditBalance, recordPurchase, recentPurchases, verifyStripeSignature,
} from "../lib/emailCredits.js";
import { HOST_ID } from "./adminEvents.js";

const WEBHOOK_PATH = "/stripe/email-credits";
// Stripe signs the exact bytes: this route reads the raw body, so it's
// mounted before the global JSON parser (see index.js).
export const emailCreditsWebhookParser = [WEBHOOK_PATH, express.raw({ type: "application/json", limit: "1mb" })];

export function registerEmailCreditRoutes(app) {
  // The host's balance, what can be bought, and what has been.
  app.get("/admin/credits", requireOwner, async (req, res) => {
    try {
      const [balance, purchases] = await Promise.all([creditBalance(HOST_ID), recentPurchases(HOST_ID)]);
      return res.json({ balance, packs: PACKS, purchases });
    } catch (err) {
      console.error("[credits] balance:", err?.message);
      return res.status(500).json({ error: "failed" });
    }
  });

  // A Stripe Checkout page for one pack; the browser goes there.
  app.post("/admin/credits/checkout", requireOwner, async (req, res) => {
    const pack = packById(req.body?.pack);
    if (!pack) return res.status(400).json({ error: "invalid", detail: "pack" });
    try {
      const session = await createCheckout(checkoutParams({
        pack,
        hostId: HOST_ID,
        email: req.user.email,
        frontendUrl: getFrontendUrl(),
        returnPath: req.body?.returnPath,
        taxRateId: process.env.STRIPE_VAT_TAX_RATE_ID || null,
      }));
      return res.json({ url: session.url });
    } catch (err) {
      console.error("[credits] checkout:", err?.message);
      return res.status(502).json({ error: "checkout_failed" });
    }
  });

  // Back from Checkout: look the session up at Stripe and credit it, so the
  // balance is right even if the webhook is late (or not set up).
  app.post("/admin/credits/confirm", requireOwner, async (req, res) => {
    const id = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
    if (!/^cs_[\w]+$/.test(id)) return res.status(400).json({ error: "invalid" });
    try {
      const session = await getCheckout(id);
      if (session.metadata?.host_id !== HOST_ID) return res.status(404).json({ error: "not_found" });
      const added = await recordPurchase(session);
      return res.json({ paid: session.payment_status === "paid", added, balance: await creditBalance(HOST_ID) });
    } catch (err) {
      console.error("[credits] confirm:", err?.message);
      return res.status(502).json({ error: "confirm_failed" });
    }
  });

  app.post(WEBHOOK_PATH, async (req, res) => {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";
    if (!verifyStripeSignature(raw, req.headers["stripe-signature"], process.env.STRIPE_EMAIL_CREDITS_WEBHOOK_SECRET)) {
      return res.status(400).json({ error: "bad_signature" });
    }
    try {
      const event = JSON.parse(raw);
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
        const added = await recordPurchase(event.data?.object);
        if (added) console.log(`[credits] purchase ${event.data.object.id} → ${event.data.object.metadata?.host_id}`);
      }
      return res.json({ received: true });
    } catch (err) {
      console.error("[credits] webhook:", err?.message);
      return res.status(500).json({ error: "failed" }); // Stripe retries
    }
  });
}
