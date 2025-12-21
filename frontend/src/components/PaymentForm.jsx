// frontend/src/components/PaymentForm.jsx
// Stripe payment form for paid event tickets
// Note: Requires @stripe/react-stripe-js package
// Install with: npm install @stripe/react-stripe-js
import { useState, useEffect, useRef } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "./ui/Button";
import { useToast } from "./Toast";
import { publicFetch } from "../lib/api.js";

// Get Stripe publishable key from environment
// In development: prefer TEST_ prefixed, fallback to regular
// In production: use regular variable name
const isDevelopment =
  import.meta.env.DEV || import.meta.env.MODE === "development";

const getStripePublishableKey = () => {
  if (isDevelopment) {
    return (
      import.meta.env.VITE_TEST_STRIPE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
    );
  }
  return import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
};

const stripePromise = (() => {
  const key = getStripePublishableKey();
  if (!key) {
    console.warn("Stripe publishable key not found");
    return null;
  }
  return loadStripe(key);
})();

// Payment form component (inner component that uses Stripe hooks)
function PaymentFormInner({
  clientSecret,
  amount,
  currency,
  onSuccess,
  onError,
  showButton = true, // Whether to render the internal submit button
  eventSlug = null, // Optional: event slug for redirect-based payment methods
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { showToast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const hasInitializedRef = useRef(false); // Prevent double initialization
  const clientSecretRef = useRef(clientSecret); // Track clientSecret changes
  const mountCountRef = useRef(0); // Track component mounts

  // Reset initialization flag when clientSecret changes
  useEffect(() => {
    if (clientSecretRef.current !== clientSecret) {
      clientSecretRef.current = clientSecret;
      hasInitializedRef.current = false;
      setIsReady(false);
      mountCountRef.current = 0; // Reset mount count on clientSecret change
    }
  }, [clientSecret]);

  // Track component mounts (React StrictMode causes double mount in dev)
  useEffect(() => {
    mountCountRef.current += 1;
    console.log(
      `[PaymentForm] Component mounted (count: ${mountCountRef.current})`
    );

    // Reset initialization flag on unmount
    return () => {
      console.log(`[PaymentForm] Component unmounting`);
      // Don't reset hasInitializedRef here - we want to prevent double init even across remounts
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling

    console.log("[PaymentForm] handleSubmit called", {
      hasStripe: !!stripe,
      hasElements: !!elements,
      hasClientSecret: !!clientSecret,
      isReady,
    });

    if (!stripe || !elements || !clientSecret) {
      console.error("[PaymentForm] Missing required dependencies:", {
        stripe: !!stripe,
        elements: !!elements,
        clientSecret: !!clientSecret,
      });
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      console.log(
        "[PaymentForm] Confirming payment with clientSecret:",
        clientSecret?.substring(0, 20) + "..."
      );

      // CRITICAL: For PaymentElement, must call elements.submit() BEFORE confirmPayment()
      // This validates the payment method and prepares it for confirmation
      console.log("[PaymentForm] Submitting payment element...");
      const { error: submitError } = await elements.submit();

      if (submitError) {
        console.error(
          "[PaymentForm] Payment element submission error:",
          submitError
        );
        setError(submitError.message || "Payment validation failed");
        showToast(submitError.message || "Payment validation failed", "error");
        setProcessing(false);
        if (onError) {
          onError(submitError);
        }
        return;
      }

      // Now confirm payment with Stripe PaymentElement
      // PaymentElement handles all payment methods automatically
      console.log(
        "[PaymentForm] Payment element submitted, confirming payment..."
      );

      const confirmParams = {};
      // Add return_url for redirect-based payment methods (Klarna, etc.)
      if (eventSlug) {
        confirmParams.return_url = `${window.location.origin}/e/${eventSlug}/success`;
      }

      const { error: confirmError, paymentIntent } =
        await stripe.confirmPayment({
          elements,
          clientSecret,
          confirmParams,
          redirect: "if_required", // Only redirect if required (e.g., 3DS, Klarna)
        });

      console.log("[PaymentForm] Payment confirmation result:", {
        error: confirmError?.message,
        status: paymentIntent?.status,
        id: paymentIntent?.id,
      });

      if (confirmError) {
        console.error(
          "[PaymentForm] Payment confirmation error:",
          confirmError
        );
        setError(confirmError.message || "Payment failed");
        showToast(confirmError.message || "Payment failed", "error");
        setProcessing(false);
        if (onError) {
          onError(confirmError);
        }
        return;
      }

      if (!paymentIntent) {
        console.error(
          "[PaymentForm] No paymentIntent returned from confirmPayment"
        );
        setError("Payment confirmation failed. Please try again.");
        showToast("Payment confirmation failed. Please try again.", "error");
        setProcessing(false);
        if (onError) {
          onError(new Error("No paymentIntent returned"));
        }
        return;
      }

      // Handle different payment intent statuses
      if (paymentIntent.status === "succeeded") {
        console.log("[PaymentForm] Payment succeeded, calling onSuccess");
        showToast("Payment successful! 🎉", "success");
        onSuccess(paymentIntent);
        // Don't set processing to false here - let parent handle it
      } else if (paymentIntent.status === "requires_action") {
        // 3DS authentication required - Stripe.js handles this automatically
        // The paymentIntent will be updated after authentication
        console.log("[PaymentForm] Payment requires action (3DS)");
        setError(
          "Payment requires additional authentication. Please complete the verification."
        );
        showToast(
          "Please complete the authentication to finish your payment.",
          "info"
        );
        setProcessing(false);
      } else if (paymentIntent.status === "processing") {
        // Payment is processing (e.g., bank transfer)
        console.log("[PaymentForm] Payment is processing");
        setError("Payment is processing. This may take a few moments.");
        showToast(
          "Payment is processing. This may take a few moments.",
          "info"
        );
        setProcessing(false);
      } else {
        console.error(
          "[PaymentForm] Payment not completed, status:",
          paymentIntent.status
        );
        setError(`Payment status: ${paymentIntent.status}. Please try again.`);
        showToast(
          `Payment status: ${paymentIntent.status}. Please try again.`,
          "error"
        );
        setProcessing(false);
        if (onError) {
          onError(new Error(`Payment status: ${paymentIntent.status}`));
        }
      }
    } catch (err) {
      console.error("[PaymentForm] Payment error:", err);
      setError(err.message || "An error occurred");
      showToast(err.message || "An error occurred", "error");
      setProcessing(false);
      if (onError) {
        onError(err);
      }
    }
  };

  const formatAmount = (cents, curr) => {
    const amount = (cents / 100).toFixed(2);
    const symbol = curr === "sek" ? "kr" : "$";
    return `${symbol}${amount}`;
  };

  // Don't use a form element since this is rendered inside RsvpForm's form
  // Only render PaymentElement when clientSecret is available
  if (!clientSecret) {
    return (
      <div
        style={{
          fontSize: "13px",
          opacity: 0.6,
          marginBottom: "16px",
          color: "#fff",
          fontStyle: "italic",
          padding: "12px",
          background: "rgba(255,255,255,0.05)",
          borderRadius: "8px",
        }}
      >
        Payment details will be processed when you complete your RSVP.
      </div>
    );
  }

  return (
    <div>
      <div
        style={{
          padding: "12px",
          background: "rgba(255,255,255,0.05)",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.1)",
          marginBottom: "16px",
        }}
      >
        <PaymentElement
          key={clientSecret} // Stable key prevents remounting
          options={{
            layout: "tabs", // Show payment methods as tabs
            // Disable wallets to prevent additional mounting triggers
            wallets: {
              applePay: "never",
              googlePay: "never",
            },
            // Disable Stripe Link autofill to prevent double mounting
            // Link is the "secure checkout" feature that can cause remounts
            // Note: This doesn't completely disable Link, but reduces its impact
            // Don't specify paymentMethodOrder - let Stripe show what's available
            // PaymentElement will automatically display available methods based on:
            // - Account capabilities
            // - Customer location
            // - Currency
            // - What's activated for the connected account
          }}
          // Use appearance prop for styling (not style inside options)
          appearance={{
            variables: {
              colorPrimary: "#8b5cf6",
              colorBackground: "transparent",
              colorText: "#fff",
              colorDanger: "#ef4444",
              fontFamily: "system-ui, -apple-system, sans-serif",
              spacingUnit: "4px",
              borderRadius: "8px",
            },
            rules: {
              ".Input": {
                backgroundColor: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#fff",
              },
              ".Input::placeholder": {
                color: "rgba(255,255,255,0.5)",
              },
              ".Input:focus": {
                borderColor: "#8b5cf6",
              },
            },
          }}
          onReady={() => {
            // Prevent double initialization (React StrictMode causes double renders in dev)
            if (hasInitializedRef.current) {
              console.log(
                "[PaymentForm] PaymentElement ready (duplicate call ignored)",
                {
                  mountCount: mountCountRef.current,
                  clientSecret: clientSecret?.substring(0, 20) + "...",
                }
              );
              return;
            }
            hasInitializedRef.current = true;
            console.log("[PaymentForm] PaymentElement ready", {
              mountCount: mountCountRef.current,
              clientSecret: clientSecret?.substring(0, 20) + "...",
            });
            setIsReady(true);
          }}
          onChange={(e) => {
            // Track payment element state
            if (e.complete) {
              setIsReady(true);
              setError(null);
            } else {
              setIsReady(false);
            }
            if (e.error) {
              setError(e.error.message);
            }
          }}
        />
      </div>
      {error && (
        <div
          style={{
            padding: "10px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "6px",
            color: "#ef4444",
            fontSize: "14px",
            marginBottom: "16px",
          }}
        >
          {error}
        </div>
      )}
      {showButton && (
        <Button
          type="button"
          onClick={(e) => {
            console.log("[PaymentForm] Pay button clicked");
            handleSubmit(e);
          }}
          disabled={
            !stripe || !elements || processing || !clientSecret || !isReady
          }
          fullWidth
          style={{
            background:
              processing || !stripe || !elements || !clientSecret || !isReady
                ? "rgba(139, 92, 246, 0.5)"
                : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
            cursor:
              processing || !stripe || !elements || !clientSecret || !isReady
                ? "not-allowed"
                : "pointer",
            fontSize: "16px",
            fontWeight: 600,
            padding: "16px 24px",
            borderRadius: "12px",
            border: "none",
            transition: "all 0.2s ease",
            boxShadow:
              processing || !stripe || !elements || !clientSecret || !isReady
                ? "none"
                : "0 4px 20px rgba(139, 92, 246, 0.3)",
          }}
          onMouseEnter={(e) => {
            if (!processing && stripe && elements && clientSecret && isReady) {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 6px 24px rgba(139, 92, 246, 0.4)";
            }
          }}
          onMouseLeave={(e) => {
            if (!processing && stripe && elements && clientSecret && isReady) {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 20px rgba(139, 92, 246, 0.3)";
            }
          }}
        >
          {processing
            ? "Processing..."
            : !stripe || !elements
            ? "Loading..."
            : !clientSecret
            ? "Waiting for payment..."
            : !isReady
            ? "Complete payment details"
            : `Pay ${formatAmount(amount, currency)}`}
        </Button>
      )}
    </div>
  );
}

// Main PaymentForm component wrapper
export function PaymentForm({
  clientSecret,
  amount,
  currency = "usd",
  onSuccess,
  onError,
  showButton = true, // Allow hiding the submit button for external control
  eventSlug = null, // Optional: event slug for redirect-based payment methods
}) {
  if (!stripePromise) {
    return (
      <div
        style={{
          padding: "20px",
          background: "rgba(239, 68, 68, 0.1)",
          border: "1px solid rgba(239, 68, 68, 0.3)",
          borderRadius: "12px",
          color: "#ef4444",
        }}
      >
        Stripe is not configured. Please contact support.
      </div>
    );
  }

  // Only render Elements when clientSecret is available
  // PaymentElement requires clientSecret to initialize
  if (!clientSecret) {
    return (
      <div
        style={{
          padding: "20px",
          background: "rgba(139, 92, 246, 0.1)",
          border: "1px solid rgba(139, 92, 246, 0.3)",
          borderRadius: "12px",
          color: "#a78bfa",
        }}
      >
        Waiting for payment setup...
      </div>
    );
  }

  // Use clientSecret as key to prevent remounting when it changes
  // This ensures PaymentElement only mounts once per unique clientSecret
  // Note: React StrictMode in development will cause double renders, but the ref guard
  // in PaymentFormInner prevents double initialization
  return (
    <Elements
      key={`elements-${clientSecret}`}
      stripe={stripePromise}
      options={{ clientSecret }}
    >
      <PaymentFormInner
        key={`inner-${clientSecret}`}
        clientSecret={clientSecret}
        amount={amount}
        currency={currency}
        onSuccess={onSuccess}
        onError={onError}
        showButton={showButton}
        eventSlug={eventSlug}
      />
    </Elements>
  );
}
