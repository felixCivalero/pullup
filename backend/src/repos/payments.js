// Payments repo — payment records (Stripe-backed) + RSVP payment_status sync.
// Extracted verbatim from data.js (zero behavior change).
import { supabase } from "../supabase.js";

export async function createPayment({
  userId,
  eventId,
  rsvpId = null,
  stripePaymentIntentId,
  stripeCustomerId,
  stripeChargeId = null,
  stripeCheckoutSessionId = null,
  amount,
  currency = "usd",
  status = "pending",
  paymentMethod = null,
  description = null,
  receiptUrl = null,
}) {
  // Ensure amount is a valid number
  const amountNum = typeof amount === "number" ? amount : Number(amount);
  if (isNaN(amountNum) || amountNum < 0) {
    throw new Error(`Invalid amount: ${amount}. Must be a positive number.`);
  }

  // Ensure rsvpId is either null or a valid UUID string (not false)
  const rsvpIdValue = rsvpId && rsvpId !== false ? rsvpId : null;

  const paymentData = {
    user_id: userId,
    event_id: eventId,
    rsvp_id: rsvpIdValue,
    stripe_payment_intent_id: stripePaymentIntentId,
    stripe_customer_id: stripeCustomerId,
    stripe_charge_id: stripeChargeId,
    stripe_checkout_session_id: stripeCheckoutSessionId,
    amount: amountNum,
    currency,
    status, // "pending" | "succeeded" | "failed" | "refunded" | "canceled"
    payment_method: paymentMethod,
    description,
    receipt_url: receiptUrl,
    refunded_amount: 0,
    refunded_at: null,
    paid_at: status === "succeeded" ? new Date().toISOString() : null,
    metadata: {},
  };

  const { data: insertedPayment, error: insertError } = await supabase
    .from("payments")
    .insert(paymentData)
    .select()
    .single();

  if (insertError) {
    console.error("Error creating payment:", insertError);
    throw new Error("Failed to create payment");
  }

  // Link payment to RSVP if provided
  if (rsvpId && insertedPayment) {
    await supabase
      .from("rsvps")
      .update({
        payment_id: insertedPayment.id,
        payment_status: status === "succeeded" ? "paid" : "pending",
      })
      .eq("id", rsvpId);
  }

  // Map to application format
  return {
    id: insertedPayment.id,
    userId: insertedPayment.user_id,
    eventId: insertedPayment.event_id,
    rsvpId: insertedPayment.rsvp_id,
    stripePaymentIntentId: insertedPayment.stripe_payment_intent_id,
    stripeCustomerId: insertedPayment.stripe_customer_id,
    stripeChargeId: insertedPayment.stripe_charge_id,
    stripeCheckoutSessionId: insertedPayment.stripe_checkout_session_id,
    amount: insertedPayment.amount,
    currency: insertedPayment.currency,
    status: insertedPayment.status,
    paymentMethod: insertedPayment.payment_method,
    description: insertedPayment.description,
    receiptUrl: insertedPayment.receipt_url,
    refundedAmount: insertedPayment.refunded_amount,
    refundedAt: insertedPayment.refunded_at,
    createdAt: insertedPayment.created_at,
    updatedAt: insertedPayment.updated_at,
    paidAt: insertedPayment.paid_at,
    metadata: insertedPayment.metadata,
  };
}

// Helper: Map database payment to application format
function mapPaymentFromDb(dbPayment) {
  return {
    id: dbPayment.id,
    userId: dbPayment.user_id,
    eventId: dbPayment.event_id,
    rsvpId: dbPayment.rsvp_id,
    stripePaymentIntentId: dbPayment.stripe_payment_intent_id,
    stripeCustomerId: dbPayment.stripe_customer_id,
    stripeChargeId: dbPayment.stripe_charge_id,
    stripeCheckoutSessionId: dbPayment.stripe_checkout_session_id,
    amount: dbPayment.amount,
    currency: dbPayment.currency,
    status: dbPayment.status,
    paymentMethod: dbPayment.payment_method,
    description: dbPayment.description,
    receiptUrl: dbPayment.receipt_url,
    refundedAmount: dbPayment.refunded_amount,
    refundedAt: dbPayment.refunded_at,
    createdAt: dbPayment.created_at,
    updatedAt: dbPayment.updated_at,
    paidAt: dbPayment.paid_at,
    metadata: dbPayment.metadata,
  };
}

// Find payment by ID
export async function findPaymentById(paymentId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", paymentId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPaymentFromDb(data);
}

// Find payment by Stripe Payment Intent ID
export async function findPaymentByStripePaymentIntentId(
  stripePaymentIntentId
) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("stripe_payment_intent_id", stripePaymentIntentId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPaymentFromDb(data);
}

// Find payment by Stripe Charge ID
export async function findPaymentByStripeChargeId(stripeChargeId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("stripe_charge_id", stripeChargeId)
    .single();

  if (error || !data) {
    return null;
  }

  return mapPaymentFromDb(data);
}

// Update payment
export async function updatePayment(paymentId, updates) {
  // Map application-style updates to DB columns
  const dbUpdates = {};
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.stripeChargeId !== undefined)
    dbUpdates.stripe_charge_id = updates.stripeChargeId;
  if (updates.paidAt !== undefined) dbUpdates.paid_at = updates.paidAt;
  if (updates.receiptUrl !== undefined)
    dbUpdates.receipt_url = updates.receiptUrl;
  if (updates.refundedAmount !== undefined) {
    const refundedAmountNum =
      typeof updates.refundedAmount === "number"
        ? updates.refundedAmount
        : Number(updates.refundedAmount);
    if (!isNaN(refundedAmountNum) && refundedAmountNum >= 0) {
      dbUpdates.refunded_amount = refundedAmountNum;
    }
  }
  if (updates.refundedAt !== undefined)
    dbUpdates.refunded_at = updates.refundedAt;
  if (updates.stripePaymentIntentId !== undefined)
    dbUpdates.stripe_payment_intent_id = updates.stripePaymentIntentId;

  const { data, error } = await supabase
    .from("payments")
    .update(dbUpdates)
    .eq("id", paymentId)
    .select()
    .single();

  if (error || !data) {
    return { error: "not_found" };
  }

  // Also keep RSVP.payment_status in sync for convenience
  if (data.rsvp_id) {
    let paymentStatus = null;
    if (data.status === "succeeded") {
      paymentStatus = "paid";
    } else if (data.status === "refunded") {
      paymentStatus = "refunded";
    } else if (data.status === "failed" || data.status === "canceled") {
      paymentStatus = "unpaid";
    }

    if (paymentStatus !== null) {
      await supabase
        .from("rsvps")
        .update({ payment_status: paymentStatus })
        .eq("id", data.rsvp_id);
    }
  }

  return { payment: mapPaymentFromDb(data) };
}

// Get payments for user
export async function getPaymentsForUser(userId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((p) => mapPaymentFromDb(p));
}

// Get payments for event
export async function getPaymentsForEvent(eventId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("event_id", eventId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data.map((p) => mapPaymentFromDb(p));
}
