// backend/src/stripeConnect.js
// Stripe Connect OAuth flow implementation

import Stripe from "stripe";
import { getStripeSecretKey } from "./stripe.js";
import {
  updateUserStripeConnectedAccountId,
  getUserStripeConnectedAccountId,
} from "./data.js";
import crypto from "crypto";

// Determine environment mode
const isDevelopment = process.env.NODE_ENV === "development";

// Get Stripe Connect Client ID
function getStripeConnectClientId() {
  let clientId;

  if (isDevelopment) {
    // Development mode: prefer TEST_ variables, fallback to regular
    clientId =
      process.env.TEST_STRIPE_CONNECT_CLIENT_ID ||
      process.env.STRIPE_CONNECT_CLIENT_ID;

    if (process.env.TEST_STRIPE_CONNECT_CLIENT_ID) {
      console.log("🔧 [DEV] Using TEST Stripe Connect Client ID");
    } else if (process.env.STRIPE_CONNECT_CLIENT_ID) {
      console.warn(
        "⚠️  [DEV] TEST_STRIPE_CONNECT_CLIENT_ID not found, using production Client ID"
      );
    }
  } else {
    // Production mode: always use regular variable names
    clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  }

  if (!clientId) {
    const missingVar = isDevelopment
      ? "TEST_STRIPE_CONNECT_CLIENT_ID or STRIPE_CONNECT_CLIENT_ID"
      : "STRIPE_CONNECT_CLIENT_ID";
    throw new Error(
      `${missingVar} environment variable is not set. Stripe Connect functionality is disabled.`
    );
  }

  return clientId;
}

// Get Stripe Connect redirect URI
function getStripeConnectRedirectUri() {
  let redirectUri;

  if (isDevelopment) {
    // Development mode: prefer TEST_ variables, fallback to regular, then defaults
    redirectUri =
      process.env.TEST_STRIPE_CONNECT_REDIRECT_URI ||
      process.env.STRIPE_CONNECT_REDIRECT_URI ||
      "http://localhost:3001/host/stripe/connect/callback";
  } else {
    // Production mode: use regular variable or default
    redirectUri =
      process.env.STRIPE_CONNECT_REDIRECT_URI ||
      "https://pullup.se/host/stripe/connect/callback";
  }

  return redirectUri;
}

// Generate a secure state token for OAuth flow
function generateStateToken(userId) {
  const randomBytes = crypto.randomBytes(32).toString("hex");
  const timestamp = Date.now();
  const state = `${userId}:${timestamp}:${randomBytes}`;
  return Buffer.from(state).toString("base64url");
}

// Verify and extract userId from state token
export function verifyStateToken(state) {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const [userId, timestamp, randomBytes] = decoded.split(":");

    // Verify timestamp is recent (within 10 minutes)
    const age = Date.now() - parseInt(timestamp, 10);
    if (age > 10 * 60 * 1000) {
      throw new Error("State token expired");
    }

    return userId;
  } catch (error) {
    throw new Error("Invalid state token");
  }
}

/**
 * Initiate Stripe Connect OAuth flow
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object with authorization URL
 */
export async function initiateConnectOAuth(userId) {
  const stripe = new Stripe(getStripeSecretKey());
  const clientId = getStripeConnectClientId();
  const redirectUri = getStripeConnectRedirectUri();
  const state = generateStateToken(userId);

  // Create OAuth authorization URL
  const authorizeUrl = `https://connect.stripe.com/oauth/authorize?${new URLSearchParams(
    {
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "read_write", // Request read_write access to connected account
      state: state,
    }
  ).toString()}`;

  return {
    authorizationUrl: authorizeUrl,
    state: state,
  };
}

/**
 * Handle Stripe Connect OAuth callback
 * @param {string} code - Authorization code from Stripe
 * @param {string} state - State token for verification
 * @returns {Promise<Object>} Object with connected account ID and details
 */
export async function handleConnectCallback(code, state) {
  // Verify state token and extract userId
  const userId = verifyStateToken(state);

  const stripe = new Stripe(getStripeSecretKey());

  // Exchange authorization code for access token
  let response;
  try {
    response = await stripe.oauth.token({
      grant_type: "authorization_code",
      code: code,
    });
  } catch (error) {
    throw new Error(`Failed to exchange authorization code: ${error.message}`);
  }

  const connectedAccountId = response.stripe_user_id;

  if (!connectedAccountId) {
    throw new Error("No connected account ID returned from Stripe");
  }

  // Store connected account ID in user profile
  await updateUserStripeConnectedAccountId(userId, connectedAccountId);

  // Get connected account details
  const account = await stripe.accounts.retrieve(connectedAccountId);

  return {
    connectedAccountId: connectedAccountId,
    accountDetails: {
      id: account.id,
      email: account.email,
      country: account.country,
      default_currency: account.default_currency,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      details_submitted: account.details_submitted,
    },
  };
}

/**
 * Get connected account status for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Object with connection status and account details
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
        country: account.country,
        default_currency: account.default_currency,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      },
    };
  } catch (error) {
    // If account retrieval fails, the account might have been disconnected
    return {
      connected: false,
      accountId: connectedAccountId,
      accountDetails: null,
      error: error.message,
    };
  }
}

/**
 * Disconnect Stripe account for a user
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Result of disconnection
 */
export async function disconnectStripeAccount(userId) {
  const connectedAccountId = await getUserStripeConnectedAccountId(userId);

  if (!connectedAccountId) {
    return {
      success: false,
      message: "No connected account found",
    };
  }

  try {
    const stripe = new Stripe(getStripeSecretKey());
    // Deauthorize the connected account
    await stripe.oauth.deauthorize({
      client_id: getStripeConnectClientId(),
      stripe_user_id: connectedAccountId,
    });

    // Remove connected account ID from user profile
    await updateUserStripeConnectedAccountId(userId, null);

    return {
      success: true,
      message: "Stripe account disconnected successfully",
    };
  } catch (error) {
    // Even if deauthorization fails, remove the local reference
    await updateUserStripeConnectedAccountId(userId, null);

    return {
      success: true,
      message: "Stripe account disconnected (local reference removed)",
      warning: error.message,
    };
  }
}
