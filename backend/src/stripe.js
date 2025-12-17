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
  const person = await findPersonByEmail(email);
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
  await updatePersonStripeCustomerId(person.id, customer.id);

  return customer.id;
}

/**
 * Create a payment intent for an event ticket
 * @param {string} customerId - Stripe customer ID
 * @param {number} amount - Amount in cents
 * @param {string} eventId - Event ID
 * @param {string} eventTitle - Event title
 * @param {string} personId - Person ID
 * @param {string} connectedAccountId - Optional: Stripe Connect account ID
 * @param {number} applicationFeeAmount - Optional: Platform fee in cents
 * @param {string} currency - Currency code (default: "usd")
 * @returns {Promise<Object>} Payment intent object
 */
export async function createPaymentIntent({
  customerId,
  amount,
  eventId,
  eventTitle,
  personId,
  connectedAccountId = null,
  applicationFeeAmount = null,
  currency = "usd",
}) {
  const stripe = getStripeClient();

  // Build payment intent parameters
  const paymentIntentParams = {
    amount,
    currency,
    customer: customerId,
    confirmation_method: "automatic", // Use automatic for client-side confirmation with publishable key
    // Important: When using Stripe Connect, we must use on_behalf_of for proper confirmation
    metadata: {
      event_id: eventId,
      event_title: eventTitle,
      person_id: personId,
    },
    description: `Ticket for ${eventTitle}`,
  };

  // Log the parameters being sent (for debugging)
  console.log("[Stripe] Creating PaymentIntent with params:", {
    amount,
    currency,
    confirmation_method: paymentIntentParams.confirmation_method,
    has_connected_account: !!connectedAccountId,
    application_fee_amount: applicationFeeAmount || null,
  });

  // If connected account is provided, use Stripe Connect
  if (connectedAccountId) {
    // Use transfer_data to send funds to connected account
    paymentIntentParams.transfer_data = {
      destination: connectedAccountId,
    };

    // CRITICAL for Stripe Connect: on_behalf_of must match transfer_data.destination
    // This ensures proper attribution and allows client-side confirmation
    paymentIntentParams.on_behalf_of = connectedAccountId;

    // Add application fee if specified (platform fee)
    if (applicationFeeAmount && applicationFeeAmount > 0) {
      paymentIntentParams.application_fee_amount = applicationFeeAmount;
    }

    // Store connected account ID in metadata for reference
    paymentIntentParams.metadata.connected_account_id = connectedAccountId;
  }

  // CRITICAL: Ensure confirmation_method is explicitly set to "automatic"
  // (must be set after all other params to prevent override)
  // For Stripe Connect, "automatic" allows client-side confirmation with publishable key
  // "manual" would require server-side confirmation, which we don't want
  paymentIntentParams.confirmation_method = "automatic";

  // Only specify "card" as a required payment method type
  // PaymentElement will automatically show other available methods (Klarna, Swish, etc.)
  // if they are activated for the connected account, without needing to specify them here
  // This prevents errors when payment methods aren't activated yet
  paymentIntentParams.payment_method_types = ["card"];

  const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

  // Log the created PaymentIntent to verify confirmation_method and application fee
  console.log("[Stripe] PaymentIntent created:", {
    id: paymentIntent.id,
    confirmation_method: paymentIntent.confirmation_method,
    status: paymentIntent.status,
    application_fee_amount: paymentIntent.application_fee_amount || null,
    amount: paymentIntent.amount,
    amount_received: paymentIntent.amount_received || null,
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
  const payment = await findPaymentByStripePaymentIntentId(paymentIntent.id);
  if (!payment) {
    return { processed: false, error: "Payment not found" };
  }

  await updatePayment(payment.id, {
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
  const payment = await findPaymentByStripePaymentIntentId(paymentIntent.id);
  if (!payment) {
    return { processed: false, error: "Payment not found" };
  }

  await updatePayment(payment.id, {
    status: "failed",
  });

  return { processed: true, paymentId: payment.id };
}

/**
 * Handle refunded charge
 */
async function handleChargeRefunded(charge) {
  // Find payment by charge ID
  const payment = await findPaymentByStripeChargeId(charge.id);
  if (!payment) {
    return { processed: false, error: "Payment not found" };
  }

  await updatePayment(payment.id, {
    status: "refunded",
    refundedAmount: charge.amount_refunded,
    refundedAt: new Date().toISOString(),
  });

  return { processed: true, paymentId: payment.id };
}
