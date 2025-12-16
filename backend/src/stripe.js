// backend/src/stripe.js
import Stripe from "stripe";
import {
  findPersonByEmail,
  updatePersonStripeCustomerId,
  findPaymentByStripePaymentIntentId,
  findPaymentByStripeChargeId,
  updatePayment,
} from "./data.js";

// Determine environment mode
const isDevelopment = process.env.NODE_ENV === "development";

// In development: Use TEST_ prefixed variables if available, otherwise fall back to regular names
// In production: Always use regular variable names (STRIPE_SECRET_KEY)
let stripeSecretKey;

if (isDevelopment) {
  // Development mode: prefer TEST_ variables, fallback to regular
  stripeSecretKey =
    process.env.TEST_STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY;

  if (process.env.TEST_STRIPE_SECRET_KEY) {
    console.log("🔧 [DEV] Using TEST Stripe environment");
  } else if (process.env.STRIPE_SECRET_KEY) {
    console.warn(
      "⚠️  [DEV] TEST_STRIPE_SECRET_KEY not found, using production Stripe key"
    );
  }
} else {
  // Production mode: always use regular variable names
  stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  // Don't log in production to avoid noise
}

// Get Stripe secret key (for webhook verification, etc.)
export function getStripeSecretKey() {
  if (!stripeSecretKey) {
    const missingVar = isDevelopment
      ? "TEST_STRIPE_SECRET_KEY or STRIPE_SECRET_KEY"
      : "STRIPE_SECRET_KEY";
    throw new Error(
      `${missingVar} environment variable is not set. Stripe functionality is disabled.`
    );
  }
  return stripeSecretKey;
}

// Lazy initialization of Stripe client
function getStripeClient() {
  return new Stripe(getStripeSecretKey());
}

/**
 * Get or create a Stripe customer for a person
 * @param {string} email - Person's email
 * @param {string} name - Person's name
 * @returns {Promise<string>} Stripe customer ID
 */
export async function getOrCreateStripeCustomer(email, name = null) {
  // Find person by email
  const person = findPersonByEmail(email);
  if (!person) {
    throw new Error("Person not found");
  }

  // If person already has Stripe customer ID, return it
  if (person.stripeCustomerId) {
    return person.stripeCustomerId;
  }

  // Create new Stripe customer
  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: person.email,
    name: person.name || name || undefined,
    metadata: {
      person_id: person.id,
    },
  });

  // Store Stripe customer ID in person record
  updatePersonStripeCustomerId(person.id, customer.id);

  return customer.id;
}

/**
 * Create a payment intent for an event ticket
 * @param {string} customerId - Stripe customer ID
 * @param {number} amount - Amount in cents
 * @param {string} eventId - Event ID
 * @param {string} eventTitle - Event title
 * @param {string} personId - Person ID
 * @returns {Promise<Object>} Payment intent object
 */
export async function createPaymentIntent({
  customerId,
  amount,
  eventId,
  eventTitle,
  personId,
  currency = "usd",
}) {
  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    metadata: {
      event_id: eventId,
      event_title: eventTitle,
      person_id: personId,
    },
    description: `Ticket for ${eventTitle}`,
  });

  return paymentIntent;
}

/**
 * Create a Stripe product for an event
 * @param {string} eventTitle - Event title
 * @param {string} eventDescription - Event description
 * @param {string} eventId - Event ID
 * @param {string} startsAt - Event start date/time (ISO string)
 * @param {string} endsAt - Event end date/time (ISO string, optional)
 * @returns {Promise<Object>} Stripe product object
 */
export async function createStripeProduct({
  eventTitle,
  eventDescription = "",
  eventId,
  startsAt,
  endsAt = null,
}) {
  const stripe = getStripeClient();

  // Build product description
  let description = eventDescription || `Ticket for ${eventTitle}`;
  if (startsAt) {
    const startDate = new Date(startsAt).toLocaleDateString();
    description += ` - ${startDate}`;
  }

  const product = await stripe.products.create({
    name: eventTitle,
    description: description.substring(0, 500), // Stripe has a 500 char limit
    metadata: {
      event_id: eventId,
      event_start: startsAt,
      event_end: endsAt || "",
    },
  });

  return product;
}

/**
 * Create a Stripe price for an event ticket
 * @param {string} productId - Stripe product ID
 * @param {number} amount - Price in cents
 * @param {string} currency - Currency code (e.g., "usd", "eur")
 * @param {string} eventId - Event ID
 * @returns {Promise<Object>} Stripe price object
 */
export async function createStripePrice({
  productId,
  amount,
  currency,
  eventId,
}) {
  const stripe = getStripeClient();

  // Normalize currency to lowercase (Stripe requires lowercase)
  const normalizedCurrency = currency.toLowerCase();

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: amount,
    currency: normalizedCurrency,
    metadata: {
      event_id: eventId,
    },
  });

  return price;
}

/**
 * Handle Stripe webhook events
 * @param {Object} event - Stripe webhook event
 * @returns {Promise<Object>} Result of processing
 */
export async function handleStripeWebhook(event) {
  switch (event.type) {
    case "payment_intent.succeeded":
      return await handlePaymentIntentSucceeded(event.data.object);

    case "payment_intent.payment_failed":
      return await handlePaymentIntentFailed(event.data.object);

    case "charge.refunded":
      return await handleChargeRefunded(event.data.object);

    default:
      return {
        processed: false,
        message: `Unhandled event type: ${event.type}`,
      };
  }
}

/**
 * Handle successful payment intent
 */
async function handlePaymentIntentSucceeded(paymentIntent) {
  const payment = findPaymentByStripePaymentIntentId(paymentIntent.id);
  if (!payment) {
    return { processed: false, error: "Payment not found" };
  }

  updatePayment(payment.id, {
    status: "succeeded",
    stripeChargeId: paymentIntent.latest_charge || null,
    paidAt: new Date().toISOString(),
    receiptUrl: paymentIntent.charges?.data[0]?.receipt_url || null,
  });

  return { processed: true, paymentId: payment.id };
}

/**
 * Handle failed payment intent
 */
async function handlePaymentIntentFailed(paymentIntent) {
  const payment = findPaymentByStripePaymentIntentId(paymentIntent.id);
  if (!payment) {
    return { processed: false, error: "Payment not found" };
  }

  updatePayment(payment.id, {
    status: "failed",
  });

  return { processed: true, paymentId: payment.id };
}

/**
 * Handle refunded charge
 */
async function handleChargeRefunded(charge) {
  // Find payment by charge ID
  const payment = findPaymentByStripeChargeId(charge.id);
  if (!payment) {
    return { processed: false, error: "Payment not found" };
  }

  updatePayment(payment.id, {
    status: "refunded",
    refundedAmount: charge.amount_refunded,
    refundedAt: new Date().toISOString(),
  });

  return { processed: true, paymentId: payment.id };
}
