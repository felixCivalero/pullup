// Payments routes: create payment intent, status/details/verify lookups, refunds,
// plus host payment lists (per-user and per-event). Extracted verbatim from index.js.

import {
  findEventById,
  canEditGuests,
  findPersonByEmail,
  getUserProfile,
  createPayment,
  getPaymentsForUser,
  getPaymentsForEvent,
  isUserEventHost,
  findPaymentById,
  updatePayment,
  findRsvpById,
  updateRsvp,
  findPersonById,
} from "../data.js";
import { requireAuth } from "../middleware/auth.js";
import {
  getOrCreateStripeCustomer,
  createPaymentIntent,
  createRefund,
} from "../stripe.js";
import { sendEmail } from "../services/emailService.js";
import { refundEmail } from "../emails/signupConfirmation.js";
import { getFrontendUrl } from "../lib/urls.js";
import { emitIntent, sourceFromRequest } from "../services/intentLog.js";

export function registerPaymentRoutes(app) {
  // PROTECTED: Create payment intent for event (requires auth, verifies ownership)
  // ---------------------------
  app.post(
    "/host/events/:eventId/create-payment",
    requireAuth,
    async (req, res) => {
      const { eventId } = req.params;
      const { email, name, rsvpId } = req.body;

      try {
        // Get event
        const event = await findEventById(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Only owner, admin, or editor can create payment links for guests
        const canEdit = await canEditGuests(req.user.id, event.id);
        if (!canEdit) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You don't have permission to create payments for this event.",
          });
        }

        if (event.ticketType !== "paid" || !event.ticketPrice) {
          return res.status(400).json({ error: "Event is not a paid event" });
        }

        // Get or create Stripe customer
        const customerId = await getOrCreateStripeCustomer(email, name);

        // Find person to get personId
        const person = await findPersonByEmail(email);
        if (!person) {
          return res.status(404).json({ error: "Person not found" });
        }

        // Get host's Stripe connected account ID (if connected)
        const hostProfile = await getUserProfile(event.hostId);
        const connectedAccountId = hostProfile.stripeConnectedAccountId || null;

        // Calculate ticket amount (what host receives)
        const ticketAmount = Number(event.ticketPrice);
        if (!ticketAmount || ticketAmount <= 0) {
          return res.status(400).json({ error: "Invalid ticket price" });
        }

        // Calculate platform service fee (paid by customer, not deducted from host)
        // Platform fee percentage from environment variable (default: 3%)
        const platformFeePercentage =
          parseFloat(
            process.env.TEST_PLATFORM_FEE_PERCENTAGE ||
              process.env.PLATFORM_FEE_PERCENTAGE ||
              "3"
          ) / 100;
        const platformFeeAmount = Math.round(
          ticketAmount * platformFeePercentage
        );

        // Customer pays: ticket amount + platform service fee
        const customerTotalAmount = ticketAmount + platformFeeAmount;

        console.log("[Payment] Platform fee calculation:", {
          ticketAmount,
          platformFeePercentage: `${(platformFeePercentage * 100).toFixed(1)}%`,
          platformFeeAmount,
          customerTotalAmount,
          amountToHost: ticketAmount, // Host receives full ticket amount
        });

        // Create payment intent with connected account if available
        const currency = (event.ticketCurrency || "usd").toLowerCase();
        const paymentIntent = await createPaymentIntent({
          customerId,
          amount: customerTotalAmount, // Customer pays ticket + service fee
          eventId: event.id,
          eventTitle: event.title,
          personId: person.id,
          connectedAccountId: connectedAccountId,
          applicationFeeAmount: platformFeeAmount, // Platform fee (customer pays this)
          currency,
        });

        // Create payment record
        const payment = await createPayment({
          // Payments are owned by the host (auth user),
          // attendees are linked via rsvpId.
          userId: event.hostId,
          eventId: event.id,
          rsvpId: rsvpId || null,
          stripePaymentIntentId: paymentIntent.id,
          stripeCustomerId: customerId,
          amount: customerTotalAmount, // Customer pays: ticket + service fee
          currency,
          status: "pending",
          description: `Ticket for ${event.title}`,
        });

        // Include fee breakdown in response for frontend display
        const paymentBreakdown = {
          ticketAmount,
          platformFeeAmount,
          customerTotalAmount,
          platformFeePercentage: platformFeePercentage * 100,
        };

        res.json({
          client_secret: paymentIntent.client_secret,
          payment_id: payment.id,
          payment_intent_id: paymentIntent.id,
          payment_breakdown: paymentBreakdown, // Fee breakdown for frontend display
        });
      } catch (error) {
        console.error("Payment creation error:", error);
        res
          .status(500)
          .json({ error: error.message || "Failed to create payment" });
      }
    }
  );

  // ---------------------------
  // PROTECTED: Get payments for user (requires auth)
  // ---------------------------
  app.get("/host/payments", requireAuth, async (req, res) => {
    try {
      // Use authenticated user's ID
      const userId = req.user.id;

      const userPayments = await getPaymentsForUser(userId);
      res.json({ payments: userPayments });
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // ---------------------------
  // PROTECTED: Get payments for event (requires auth, verifies ownership)
  // ---------------------------
  app.get("/host/events/:eventId/payments", requireAuth, async (req, res) => {
    try {
      const { eventId } = req.params;

      // Verify ownership
      const event = await findEventById(eventId);
      if (!event) return res.status(404).json({ error: "Event not found" });
      const { isHost } = await isUserEventHost(req.user.id, event.id);
      if (!isHost) {
        return res.status(403).json({
          error: "Forbidden",
          message: "You don't have access to this event",
        });
      }

      const eventPayments = await getPaymentsForEvent(eventId);
      res.json({ payments: eventPayments });
    } catch (error) {
      console.error("Error fetching payments:", error);
      res.status(500).json({ error: "Failed to fetch payments" });
    }
  });

  // ---------------------------
  // PUBLIC: Lightweight payment status lookup by payment ID
  // Used by attendee-side frontend to wait for webhook-confirmed status
  // ---------------------------
  app.get("/payments/:paymentId/status", async (req, res) => {
    try {
      const { paymentId } = req.params;
      if (!paymentId) {
        return res.status(400).json({ error: "paymentId is required" });
      }

      const payment = await findPaymentById(paymentId);
      if (!payment) {
        return res.status(404).json({ error: "not_found" });
      }

      // Only expose non-sensitive fields needed by the public frontend
      res.json({
        id: payment.id,
        status: payment.status, // "pending" | "succeeded" | "failed" | "refunded" | "canceled"
        amount: payment.amount,
        currency: payment.currency,
        eventId: payment.eventId,
        rsvpId: payment.rsvpId,
      });
    } catch (error) {
      console.error("Error fetching payment status:", error);
      res.status(500).json({ error: "Failed to fetch payment status" });
    }
  });

  // ---------------------------
  // PROTECTED: Create refund for a payment
  // Requires auth, verifies event ownership
  // ---------------------------
  app.post(
    "/host/events/:eventId/payments/:paymentId/refund",
    requireAuth,
    async (req, res) => {
      try {
        const { eventId, paymentId } = req.params;
        const { amount = null, reason = null, moveToWaitlist = true } = req.body;

        // Verify event exists
        const event = await findEventById(eventId);
        if (!event) {
          return res.status(404).json({ error: "Event not found" });
        }

        // Verify ownership - only owner or admin can process refunds (or editor; use canEditGuests)
        const canEdit = await canEditGuests(req.user.id, event.id);
        if (!canEdit) {
          return res.status(403).json({
            error: "Forbidden",
            message: "You don't have permission to refund for this event.",
          });
        }
        const payment = await findPaymentById(paymentId);
        if (!payment || payment.eventId !== eventId) {
          return res.status(404).json({ error: "Payment not found" });
        }

        // Verify payment can be refunded
        if (payment.status !== "succeeded") {
          return res.status(400).json({
            error: "invalid_payment_status",
            message: `Payment status is "${payment.status}". Only succeeded payments can be refunded.`,
          });
        }

        if (
          payment.status === "refunded" &&
          payment.refundedAmount >= payment.amount
        ) {
          return res.status(400).json({
            error: "already_refunded",
            message: "Payment is already fully refunded",
          });
        }

        // Calculate refund amount (null/undefined = full refund)
        // If amount is provided, it should be in dollars/cents format - convert to cents
        // If null/undefined, pass null to createRefund to calculate remaining amount
        let refundAmountInCents = null;
        if (amount !== null && amount !== undefined && amount !== "") {
          const amountNum = Number(amount);
          if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({
              error: "invalid_amount",
              message: "Refund amount must be a positive number",
            });
          }
          // Assume amount is in dollars, convert to cents
          refundAmountInCents = Math.round(amountNum * 100);
        }

        // Map refund reason to Stripe's accepted values
        // Stripe only accepts: 'duplicate', 'fraudulent', or 'requested_by_customer'
        const stripeReason =
          reason === "requested_by_host"
            ? "requested_by_customer" // Map host-initiated refunds to customer-requested
            : reason === "duplicate" || reason === "fraudulent"
            ? reason
            : "requested_by_customer"; // Default fallback

        // Create refund via Stripe
        console.log("[Refund] Initiating refund:", {
          paymentId: payment.id,
          paymentIntentId: payment.stripePaymentIntentId,
          refundAmount: refundAmountInCents
            ? `${refundAmountInCents / 100} (${refundAmountInCents} cents)`
            : "full (null - will calculate remaining)",
          originalReason: reason,
          stripeReason: stripeReason,
        });

        let refund;
        try {
          refund = await createRefund(
            payment.stripePaymentIntentId,
            refundAmountInCents, // Pass null for full refund, or amount in cents
            stripeReason
          );

          console.log("[Refund] Refund created successfully:", {
            refundId: refund.id,
            amount: refund.amount,
            status: refund.status,
          });
        } catch (error) {
          // Handle "already refunded" errors (both from our checks and Stripe)
          if (
            error.message?.includes("already been refunded") ||
            error.message?.includes("already fully refunded") ||
            error.message === "Charge has already been refunded"
          ) {
            return res.status(400).json({
              error: "already_refunded",
              message: "This payment has already been fully refunded.",
            });
          }

          // Handle specific Stripe errors
          if (error.type === "StripeInvalidRequestError") {
            if (error.code === "charge_already_refunded") {
              return res.status(400).json({
                error: "already_refunded",
                message: "This payment has already been fully refunded.",
              });
            }
            if (error.code === "parameter_invalid_integer") {
              return res.status(400).json({
                error: "invalid_amount",
                message: `Invalid refund amount: ${error.param || "amount"}`,
              });
            }
            // Generic Stripe validation error
            return res.status(400).json({
              error: "stripe_error",
              message: error.message || "Stripe validation error",
              code: error.code,
            });
          }
          // Re-throw other errors to be handled by global error handler
          throw error;
        }

        // Update payment status immediately (webhook will also update it)
        // This provides immediate feedback, webhook ensures consistency
        const isFullRefund =
          !refundAmountInCents || refund.amount >= payment.amount;
        await updatePayment(payment.id, {
          status: isFullRefund ? "refunded" : "succeeded", // Partial refunds stay "succeeded"
          refundedAmount: refund.amount,
          refundedAt: new Date().toISOString(),
        });

        // Update RSVP status if payment is linked to an RSVP
        if (payment.rsvpId) {
          const rsvp = await findRsvpById(payment.rsvpId);
          if (rsvp) {
            // Update payment status in RSVP
            await updateRsvp(
              payment.rsvpId,
              {
                paymentStatus: isFullRefund ? "refunded" : "paid",
              },
              { isOnlyPaymentUpdate: true }
            );

            // If full refund and moveToWaitlist is true, move guest to waitlist
            if (isFullRefund && moveToWaitlist) {
              console.log("[Refund] Moving RSVP to waitlist after full refund:", {
                rsvpId: payment.rsvpId,
              });
              await updateRsvp(
                payment.rsvpId,
                {
                  bookingStatus: "WAITLIST",
                  status: "waitlist",
                },
                { forceConfirm: false }
              );
            }
          }
        }

        // Send refund notification email to guest
        if (payment.rsvpId) {
          try {
            const rsvpForEmail = await findRsvpById(payment.rsvpId);
            const personForEmail = rsvpForEmail ? await findPersonById(rsvpForEmail.personId) : null;
            if (personForEmail?.email) {
              let hostBrand = {};
              try {
                const hostProfile = await getUserProfile(event.hostId);
                hostBrand = {
                  brandName: hostProfile?.brand || "",
                  brandWebsite: hostProfile?.brandWebsite || "",
                  contactEmail: hostProfile?.contactEmail || "",
                };
              } catch {}

              await sendEmail({
                to: personForEmail.email,
                personId: personForEmail.id || null,
                hostProfileId: event.hostId || null,
                subject: isFullRefund ? "Your payment has been refunded" : "Partial refund processed",
                html: refundEmail({
                  name: rsvpForEmail.name || personForEmail.name || "there",
                  eventTitle: event.title,
                  imageUrl: event.coverImageUrl || event.imageUrl || "",
                  slug: event.slug || "",
                  frontendUrl: getFrontendUrl(),
                  refundAmount: (refund.amount / 100).toFixed(2),
                  currency: refund.currency || event.ticketCurrency || "usd",
                  isFullRefund,
                  ...hostBrand,
                  brand: event.brand
                    ? {
                        background:   event.brand.backgroundColor || null,
                        primaryColor: event.brand.buttonColor || null,
                      }
                    : {},
                }),
              });
            }
          } catch (emailErr) {
            console.error("Failed to send refund email:", emailErr);
          }
        }

        emitIntent({
          hostId: req.user.id,
          tool: "refund_payment",
          args: { eventId: req.params.eventId, paymentId: req.params.paymentId, amount: req.body?.amount },
          source: sourceFromRequest(req),
          target: { type: "payment", id: req.params.paymentId },
          result: { refundId: refund.id, amount: refund.amount, isFullRefund },
        });

        return res.json({
          success: true,
          refund: {
            id: refund.id,
            amount: refund.amount,
            status: refund.status,
            currency: refund.currency,
          },
          payment: {
            id: payment.id,
            status: isFullRefund ? "refunded" : "succeeded",
            refundedAmount: refund.amount,
          },
          isFullRefund,
          emailSent: true,
        });
      } catch (error) {
        console.error("Error creating refund:", error);
        return res.status(500).json({
          error: "refund_failed",
          message: error.message || "Failed to create refund",
        });
      }
    }
  );

  // ---------------------------
  // PUBLIC: Get full payment details (including receipt URL)
  // Used by success page to display complete payment information
  // ---------------------------
  app.get("/payments/:paymentId/details", async (req, res) => {
    try {
      const { paymentId } = req.params;
      if (!paymentId) {
        return res.status(400).json({ error: "paymentId is required" });
      }

      const payment = await findPaymentById(paymentId);
      if (!payment) {
        return res.status(404).json({ error: "not_found" });
      }

      // Return full payment details (non-sensitive fields only)
      res.json({
        id: payment.id,
        status: payment.status,
        amount: payment.amount,
        currency: payment.currency,
        description: payment.description,
        receiptUrl: payment.receiptUrl, // Stripe receipt URL
        paidAt: payment.paidAt, // ISO timestamp from database
        eventId: payment.eventId,
        rsvpId: payment.rsvpId,
      });
    } catch (error) {
      console.error("Error fetching payment details:", error);
      res.status(500).json({ error: "Failed to fetch payment details" });
    }
  });

  // ---------------------------
  // PUBLIC: Verify PaymentIntent status from Stripe and update payment
  // Fallback when webhook doesn't arrive (e.g., in local development)
  // ---------------------------
  app.post("/payments/verify/:paymentIntentId", async (req, res) => {
    try {
      const { paymentIntentId } = req.params;
      if (!paymentIntentId) {
        return res.status(400).json({ error: "paymentIntentId is required" });
      }

      console.log(
        "[Payment Verify] Checking PaymentIntent status:",
        paymentIntentId
      );

      // Retrieve PaymentIntent from Stripe
      const { getStripeSecretKey } = await import("../stripe.js");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(getStripeSecretKey());

      let paymentIntent;
      try {
        // Expand charges to get receipt URL
        paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
          expand: ["charges"], // Expand charges to access receipt_url
        });
        console.log(
          "[Payment Verify] PaymentIntent status:",
          paymentIntent.status
        );
      } catch (error) {
        console.error("[Payment Verify] Error retrieving PaymentIntent:", error);
        return res.status(400).json({ error: "Invalid PaymentIntent ID" });
      }

      // If payment succeeded, manually trigger webhook handler logic
      if (paymentIntent.status === "succeeded") {
        console.log("[Payment Verify] Payment succeeded, triggering update...");
        const { handleStripeWebhook } = await import("../stripe.js");

        // Create a mock webhook event (with all required fields)
        const mockEvent = {
          type: "payment_intent.succeeded",
          id: `evt_verify_${Date.now()}`,
          created: Math.floor(Date.now() / 1000), // Unix timestamp
          livemode: false, // Test mode
          data: {
            object: paymentIntent,
          },
        };

        const result = await handleStripeWebhook(mockEvent);

        // Import data functions for payment lookup (used for receipt URL and redirect-based payments)
        const { findPaymentByStripePaymentIntentId, updatePayment } =
          await import("../data.js");

        // Extract receipt URL from charge if available and update payment
        // Stripe generates receipt URLs asynchronously, so we check here too
        const receiptUrl = paymentIntent.charges?.data?.[0]?.receipt_url || null;
        if (receiptUrl) {
          console.log(
            "[Payment Verify] Found receipt URL, ensuring it's stored:",
            receiptUrl
          );
          const payment = await findPaymentByStripePaymentIntentId(
            paymentIntentId
          );
          if (payment) {
            // Update receipt URL if not already set
            if (!payment.receiptUrl) {
              await updatePayment(payment.id, { receiptUrl });
              console.log("[Payment Verify] ✅ Receipt URL stored in database");
            } else {
              console.log("[Payment Verify] Receipt URL already stored");
            }
          }
        } else {
          console.log(
            "[Payment Verify] Receipt URL not yet available (Stripe generates it asynchronously)"
          );
        }

        if (result.processed) {
          console.log("[Payment Verify] ✅ Payment updated successfully");

          // Fetch full RSVP + event data for redirect-based payment methods (Klarna etc.)
          let rsvpData = null;
          let eventData = null;
          let paymentData = null;
          try {
            const dbPayment = await findPaymentByStripePaymentIntentId(paymentIntentId);
            if (dbPayment) {
              paymentData = {
                id: dbPayment.id,
                status: dbPayment.status,
                amount: dbPayment.amount,
                currency: dbPayment.currency,
                receiptUrl: receiptUrl || dbPayment.receiptUrl || null,
              };
              if (dbPayment.rsvpId) {
                const rsvp = await findRsvpById(dbPayment.rsvpId);
                if (rsvp) {
                  const person = await findPersonById(rsvp.personId);
                  rsvpData = {
                    name: rsvp.name || person?.name || null,
                    email: person?.email || null,
                    bookingStatus: rsvp.bookingStatus || "CONFIRMED",
                    wantsDinner: rsvp.wantsDinner || false,
                    partySize: rsvp.partySize || 1,
                    plusOnes: rsvp.plusOnes || 0,
                    dinnerPartySize: rsvp.dinnerPartySize || null,
                    dinnerTimeSlot: rsvp.dinnerTimeSlot || null,
                  };
                  eventData = await findEventById(rsvp.eventId);
                }
              }
            }
          } catch (lookupErr) {
            console.error("[Payment Verify] Error fetching RSVP/event data:", lookupErr);
          }

          return res.json({
            success: true,
            message: "Payment verified and updated",
            paymentIntentId: paymentIntent.id,
            status: paymentIntent.status,
            receiptUrl: receiptUrl || null,
            rsvp: rsvpData,
            event: eventData,
            payment: paymentData,
          });
        } else {
          console.error(
            "[Payment Verify] ❌ Failed to update payment:",
            result.error
          );
          return res.status(500).json({
            error: "Failed to update payment",
            details: result.error,
          });
        }
      } else {
        // Payment not succeeded yet
        console.log(
          "[Payment Verify] Payment not succeeded, status:",
          paymentIntent.status
        );
        return res.json({
          success: false,
          message: "Payment not succeeded yet",
          status: paymentIntent.status,
        });
      }
    } catch (error) {
      console.error("[Payment Verify] Error:", error);
      res.status(500).json({ error: "Failed to verify payment" });
    }
  });
}
