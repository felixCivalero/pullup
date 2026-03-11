// backend/src/stripeConnect.js
// Stripe Connect using Account Links (modern onboarding flow)

import Stripe from "stripe";
import { getStripeSecretKey } from "./stripe.js";
import {
  updateUserStripeConnectedAccountId,
  getUserStripeConnectedAccountId,
} from "./data.js";

// Determine environment mode
const isDevelopment = process.env.NODE_ENV === "development";

// Helper: derive the public frontend base URL from env
function getFrontendBaseUrl() {
  if (isDevelopment) {
    return (
      process.env.TEST_FRONTEND_URL ||
      process.env.FRONTEND_URL ||
      "http://localhost:5173"
    );
  }

  if (!process.env.FRONTEND_URL) {
    throw new Error(
      "FRONTEND_URL environment variable is required in production for Stripe Connect redirects."
    );
  }

  return process.env.FRONTEND_URL;
}

/**
 * Initiate Stripe Connect onboarding via Account Links.
 * Creates a Connect Express account and returns a Stripe-hosted onboarding URL.
 */
export async function initiateConnectOnboarding(userId) {
  const stripe = new Stripe(getStripeSecretKey());
  const frontendBase = getFrontendBaseUrl().replace(/\/$/, "");

  // Check if user already has a connected account that needs to finish onboarding
  const existingAccountId = await getUserStripeConnectedAccountId(userId);

  let accountId = existingAccountId;

  if (existingAccountId) {
    // Verify the account still exists on Stripe
    try {
      const existing = await stripe.accounts.retrieve(existingAccountId);
      // If onboarding is already complete, no need to re-onboard
      if (existing.details_submitted && existing.charges_enabled) {
        return {
          alreadyComplete: true,
          accountId: existingAccountId,
        };
      }
      // Account exists but onboarding incomplete — generate a new link
      accountId = existingAccountId;
    } catch (err) {
      // Account was deleted or invalid — create a new one
      accountId = null;
    }
  }

  if (!accountId) {
    // Create a new Express connected account
    const account = await stripe.accounts.create({
      type: "express",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
        klarna_payments: { requested: true },
        link_payments: { requested: true },
      },
    });
    accountId = account.id;

    // Store the account ID immediately so we can resume onboarding later
    await updateUserStripeConnectedAccountId(userId, accountId);
  }

  // Stripe requires HTTPS for livemode redirect URLs.
  // Test mode works fine with HTTP localhost.
  let redirectBase = frontendBase;

  // Create an Account Link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${redirectBase}/settings?stripe_connect=refresh`,
    return_url: `${redirectBase}/settings?stripe_connect=success&account_id=${accountId}`,
    type: "account_onboarding",
  });

  return {
    onboardingUrl: accountLink.url,
    accountId,
  };
}

/**
 * Get connected account status for a user.
 */
export async function getConnectedAccountStatus(userId) {
  const connectedAccountId = await getUserStripeConnectedAccountId(userId);

  if (!connectedAccountId) {
    return {
      connected: false,
      accountId: null,
      accountDetails: null,
    };
  }

  try {
    const stripe = new Stripe(getStripeSecretKey());
    const account = await stripe.accounts.retrieve(connectedAccountId);

    return {
      connected: true,
      accountId: connectedAccountId,
      accountDetails: {
        id: account.id,
        email: account.email,
        businessName: account.business_profile?.name || account.settings?.dashboard?.display_name || null,
        country: account.country,
        default_currency: account.default_currency,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      },
    };
  } catch (error) {
    // Account may have been deleted on Stripe's side
    if (error.code === "account_invalid") {
      await updateUserStripeConnectedAccountId(userId, null);
    }
    return {
      connected: false,
      accountId: connectedAccountId,
      accountDetails: null,
      error: error.message,
    };
  }
}

/**
 * Disconnect Stripe account for a user.
 * With Express accounts we can't deauthorize via OAuth — we just remove the reference.
 */
export async function disconnectStripeAccount(userId) {
  const connectedAccountId = await getUserStripeConnectedAccountId(userId);

  if (!connectedAccountId) {
    return {
      success: false,
      message: "No connected account found",
    };
  }

  // Remove connected account ID from user profile
  await updateUserStripeConnectedAccountId(userId, null);

  return {
    success: true,
    message: "Stripe account disconnected successfully",
  };
}
