// src/components/HomeIntegrationsTab.jsx
import { useState, useEffect } from "react";
import { useToast } from "./Toast";
import { authenticatedFetch } from "../lib/api.js";

export function IntegrationsTab() {
  const { showToast } = useToast();
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeAccountEmail, setStripeAccountEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  // Load Stripe connection status from backend
  useEffect(() => {
    loadStripeStatus();
    checkOAuthCallback();
  }, []);

  async function loadStripeStatus() {
    try {
      setLoading(true);
      const response = await authenticatedFetch("/host/stripe/connect/status");
      if (!response.ok) {
        throw new Error("Failed to load Stripe status");
      }

      const data = await response.json();
      setStripeConnected(data.connected);
      if (data.accountDetails?.email) {
        setStripeAccountEmail(data.accountDetails.email);
      } else {
        setStripeAccountEmail("");
      }
    } catch (error) {
      console.error("Failed to load Stripe status:", error);
      setStripeConnected(false);
      setStripeAccountEmail("");
    } finally {
      setLoading(false);
    }
  }

  // Check for OAuth callback in URL params
  function checkOAuthCallback() {
    const params = new URLSearchParams(window.location.search);
    const stripeConnect = params.get("stripe_connect");
    const accountId = params.get("account_id");
    const errorMessage = params.get("message");

    if (stripeConnect === "success" && accountId) {
      showToast("Stripe connected successfully! 💳", "success");
      // Reload status
      loadStripeStatus();
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    } else if (stripeConnect === "error" && errorMessage) {
      showToast(
        `Stripe connection failed: ${decodeURIComponent(errorMessage)}`,
        "error"
      );
      // Clean URL
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  async function handleConnectStripe() {
    if (stripeConnected) {
      // Disconnect
      try {
        setConnecting(true);
        const response = await authenticatedFetch(
          "/host/stripe/connect/disconnect",
          {
            method: "POST",
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to disconnect");
        }

        setStripeConnected(false);
        setStripeAccountEmail("");
        showToast("Stripe disconnected", "success");
      } catch (error) {
        console.error("Failed to disconnect Stripe:", error);
        showToast(
          error.message || "Failed to disconnect Stripe account",
          "error"
        );
      } finally {
        setConnecting(false);
      }
    } else {
      // Initiate OAuth flow
      try {
        setConnecting(true);
        const response = await authenticatedFetch(
          "/host/stripe/connect/initiate",
          {
            method: "POST",
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to initiate connection");
        }

        const data = await response.json();
        // Redirect to Stripe OAuth page
        window.location.href = data.authorizationUrl;
      } catch (error) {
        console.error("Failed to initiate Stripe Connect:", error);
        showToast(error.message || "Failed to connect Stripe account", "error");
        setConnecting(false);
      }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
      {/* STRIPE INTEGRATION */}
      <IntegrationsSection
        title="Payment Processing"
        description="Connect Stripe to accept payments for your paid events."
      >
        <div
          style={{
            padding: "20px",
            background: "rgba(20, 16, 30, 0.6)",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", gap: "16px", flex: 1 }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                borderRadius: "12px",
                background: "rgba(99, 102, 241, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "24px",
                flexShrink: 0,
              }}
            >
              💳
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "4px",
                }}
              >
                Stripe
              </div>
              <div
                style={{ fontSize: "13px", opacity: 0.7, marginBottom: "8px" }}
              >
                Accept payments for paid events. Process refunds and manage your
                payment settings.
              </div>
              {stripeConnected && stripeAccountEmail && (
                <div
                  style={{
                    fontSize: "12px",
                    opacity: 0.6,
                    marginTop: "8px",
                    padding: "6px 10px",
                    background: "rgba(34, 197, 94, 0.1)",
                    borderRadius: "6px",
                    border: "1px solid rgba(34, 197, 94, 0.2)",
                    display: "inline-block",
                  }}
                >
                  Connected as {stripeAccountEmail}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnectStripe}
            disabled={loading || connecting}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: stripeConnected
                ? "1px solid rgba(255,255,255,0.1)"
                : "none",
              background:
                loading || connecting
                  ? "rgba(255,255,255,0.1)"
                  : stripeConnected
                  ? "transparent"
                  : "linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor: loading || connecting ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.3s ease",
              opacity: loading || connecting ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (stripeConnected && !loading && !connecting) {
                e.target.style.background = "rgba(239, 68, 68, 0.2)";
                e.target.style.borderColor = "rgba(239, 68, 68, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (stripeConnected && !loading && !connecting) {
                e.target.style.background = "transparent";
                e.target.style.borderColor = "rgba(255,255,255,0.1)";
              }
            }}
          >
            {loading
              ? "Loading..."
              : connecting
              ? "Connecting..."
              : stripeConnected
              ? "Disconnect"
              : "Connect Stripe"}
          </button>
        </div>
      </IntegrationsSection>

      {/* ACCOUNT SYNCING */}
      <IntegrationsSection
        title="Account Syncing"
        description="Sync your events and contacts with external services."
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <SyncItem
            icon="📅"
            title="Calendar Syncing"
            description="Sync your PullUp events with your Google, Outlook, or Apple calendar."
            buttonText="Add iCal Subscription"
          />
          <SyncItem
            icon="G"
            title="Sync Contacts with Google"
            description="Sync your Gmail contacts to easily invite them to your events."
            buttonText="Enable Syncing"
          />
        </div>
      </IntegrationsSection>
    </div>
  );
}

function IntegrationsSection({ title, description, children }) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: "16px",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 600,
              marginBottom: "4px",
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: "14px",
              opacity: 0.7,
            }}
          >
            {description}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}

function SyncItem({ icon, title, description, buttonText }) {
  return (
    <div
      style={{
        padding: "16px",
        background: "rgba(20, 16, 30, 0.6)",
        borderRadius: "12px",
        border: "1px solid rgba(255,255,255,0.05)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", gap: "12px", flex: 1 }}>
        <span style={{ fontSize: "20px", marginTop: "2px" }}>{icon}</span>
        <div>
          <div
            style={{
              fontSize: "15px",
              fontWeight: 600,
              marginBottom: "4px",
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.7 }}>{description}</div>
        </div>
      </div>
      <button
        type="button"
        style={{
          padding: "8px 16px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(139, 92, 246, 0.2)",
          color: "#fff",
          fontSize: "13px",
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {buttonText}
      </button>
    </div>
  );
}
