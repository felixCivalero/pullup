// src/components/HomeSettingsTab.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  LogOut,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";

export function SettingsTab({ user, setUser, onSave, showToast }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  // Stripe state
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeAccountEmail, setStripeAccountEmail] = useState("");
  const [stripeBusinessName, setStripeBusinessName] = useState("");
  const [stripeDetailsSubmitted, setStripeDetailsSubmitted] = useState(false);
  const [stripeChargesEnabled, setStripeChargesEnabled] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeConnecting, setStripeConnecting] = useState(false);

  useEffect(() => {
    loadStripeStatus();
    checkStripeCallback();
  }, []);

  async function loadStripeStatus() {
    try {
      setStripeLoading(true);
      const response = await authenticatedFetch("/host/stripe/connect/status");
      if (!response.ok) throw new Error("Failed to load Stripe status");
      const data = await response.json();
      setStripeConnected(data.connected);
      setStripeAccountEmail(data.accountDetails?.email || "");
      setStripeBusinessName(data.accountDetails?.businessName || "");
      setStripeDetailsSubmitted(data.accountDetails?.details_submitted || false);
      setStripeChargesEnabled(data.accountDetails?.charges_enabled || false);
    } catch (error) {
      console.error("Failed to load Stripe status:", error);
      setStripeConnected(false);
      setStripeAccountEmail("");
      setStripeBusinessName("");
      setStripeDetailsSubmitted(false);
      setStripeChargesEnabled(false);
    } finally {
      setStripeLoading(false);
    }
  }

  function checkStripeCallback() {
    const params = new URLSearchParams(window.location.search);
    const stripeConnect = params.get("stripe_connect");
    const accountId = params.get("account_id");
    const errorMessage = params.get("message");

    if (stripeConnect === "success" && accountId) {
      showToast("Stripe connected successfully!", "success");
      loadStripeStatus();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (stripeConnect === "refresh") {
      // User left onboarding early — prompt them to try again
      showToast("Stripe onboarding incomplete. Click Connect to resume.", "error");
      loadStripeStatus();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (stripeConnect === "error" && errorMessage) {
      showToast(
        `Stripe connection failed: ${decodeURIComponent(errorMessage)}`,
        "error"
      );
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  async function handleConnectStripe() {
    // If connected but onboarding incomplete, re-initiate onboarding
    if (stripeConnected && !stripeDetailsSubmitted) {
      try {
        setStripeConnecting(true);
        const response = await authenticatedFetch(
          "/host/stripe/connect/initiate",
          { method: "POST" }
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to resume onboarding");
        }
        const data = await response.json();
        if (data.alreadyComplete) {
          showToast("Stripe is already connected!", "success");
          loadStripeStatus();
          setStripeConnecting(false);
          return;
        }
        window.location.href = data.authorizationUrl;
      } catch (error) {
        console.error("Failed to resume Stripe onboarding:", error);
        showToast(error.message || "Failed to resume Stripe setup", "error");
        setStripeConnecting(false);
      }
      return;
    }

    if (stripeConnected) {
      try {
        setStripeConnecting(true);
        const response = await authenticatedFetch(
          "/host/stripe/connect/disconnect",
          { method: "POST" }
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to disconnect");
        }
        setStripeConnected(false);
        setStripeAccountEmail("");
        setStripeDetailsSubmitted(false);
        setStripeChargesEnabled(false);
        showToast("Stripe disconnected", "success");
      } catch (error) {
        console.error("Failed to disconnect Stripe:", error);
        showToast(
          error.message || "Failed to disconnect Stripe account",
          "error"
        );
      } finally {
        setStripeConnecting(false);
      }
    } else {
      try {
        setStripeConnecting(true);
        const response = await authenticatedFetch(
          "/host/stripe/connect/initiate",
          { method: "POST" }
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to initiate connection");
        }
        const data = await response.json();
        if (data.alreadyComplete) {
          showToast("Stripe is already connected!", "success");
          loadStripeStatus();
          setStripeConnecting(false);
          return;
        }
        window.location.href = data.authorizationUrl;
      } catch (error) {
        console.error("Failed to initiate Stripe Connect:", error);
        showToast(error.message || "Failed to connect Stripe account", "error");
        setStripeConnecting(false);
      }
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
      showToast("Failed to sign out", "error");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
      <style>{`
        .settings-input {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.1);
          background: rgba(20, 16, 30, 0.6);
          color: #fff;
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s;
        }
        .settings-input:focus {
          border-color: rgba(255,255,255,0.25);
        }
        .settings-input::placeholder {
          color: rgba(255,255,255,0.3);
        }
      `}</style>

      {/* INTEGRATIONS */}
      <SettingsSection
        title="Integrations"
        description="Connect external services to power your events."
      >
        <div
          style={{
            padding: "20px",
            background: "rgba(20, 16, 30, 0.6)",
            borderRadius: "12px",
            border: `1px solid ${
              stripeConnected && stripeChargesEnabled
                ? "rgba(34, 197, 94, 0.15)"
                : stripeConnected && !stripeDetailsSubmitted
                ? "rgba(245, 158, 11, 0.15)"
                : "rgba(255,255,255,0.05)"
            }`,
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
                background: stripeConnected && stripeChargesEnabled
                  ? "rgba(34, 197, 94, 0.15)"
                  : stripeConnected && !stripeDetailsSubmitted
                  ? "rgba(245, 158, 11, 0.15)"
                  : "rgba(99, 102, 241, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <SilverIcon as={CreditCard} size={20} />
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  marginBottom: "4px",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                Stripe
                {stripeConnected && stripeChargesEnabled && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "rgba(34, 197, 94, 0.15)",
                      color: "#22c55e",
                    }}
                  >
                    Connected
                  </span>
                )}
                {stripeConnected && !stripeDetailsSubmitted && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "rgba(245, 158, 11, 0.15)",
                      color: "#f59e0b",
                    }}
                  >
                    Setup incomplete
                  </span>
                )}
                {stripeConnected && stripeDetailsSubmitted && !stripeChargesEnabled && (
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      padding: "2px 8px",
                      borderRadius: "999px",
                      background: "rgba(245, 158, 11, 0.15)",
                      color: "#f59e0b",
                    }}
                  >
                    Pending verification
                  </span>
                )}
              </div>
              <div
                style={{ fontSize: "13px", opacity: 0.7, lineHeight: 1.5 }}
              >
                Accept payments for paid events, process refunds, and manage
                payouts.
              </div>
              {stripeConnected && (stripeBusinessName || stripeAccountEmail) && (
                <div
                  style={{
                    fontSize: "12px",
                    opacity: 0.5,
                    marginTop: "6px",
                  }}
                >
                  {stripeBusinessName && <span style={{ fontWeight: 500 }}>{stripeBusinessName}</span>}
                  {stripeBusinessName && stripeAccountEmail && " · "}
                  {stripeAccountEmail}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleConnectStripe}
            disabled={stripeLoading || stripeConnecting}
            style={{
              padding: "10px 20px",
              borderRadius: "8px",
              border: stripeConnected && stripeDetailsSubmitted
                ? "1px solid rgba(255,255,255,0.1)"
                : "none",
              background:
                stripeLoading || stripeConnecting
                  ? "rgba(255,255,255,0.1)"
                  : stripeConnected && stripeDetailsSubmitted
                  ? "transparent"
                  : "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
              color: "#fff",
              fontSize: "13px",
              fontWeight: 600,
              cursor:
                stripeLoading || stripeConnecting ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              transition: "all 0.3s ease",
              opacity: stripeLoading || stripeConnecting ? 0.6 : 1,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (stripeConnected && stripeDetailsSubmitted && !stripeLoading && !stripeConnecting) {
                e.target.style.background = "rgba(239, 68, 68, 0.2)";
                e.target.style.borderColor = "rgba(239, 68, 68, 0.5)";
              }
            }}
            onMouseLeave={(e) => {
              if (stripeConnected && stripeDetailsSubmitted && !stripeLoading && !stripeConnecting) {
                e.target.style.background = "transparent";
                e.target.style.borderColor = "rgba(255,255,255,0.1)";
              }
            }}
          >
            {stripeLoading
              ? "Loading..."
              : stripeConnecting
              ? "Connecting..."
              : stripeConnected && !stripeDetailsSubmitted
              ? "Complete Setup"
              : stripeConnected
              ? "Disconnect"
              : "Connect Stripe"}
          </button>
        </div>
      </SettingsSection>

      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingTop: "48px",
          display: "flex",
          flexDirection: "column",
          gap: "48px",
        }}
      >
        {/* SIGN OUT */}
        <SettingsSection
          title="Sign Out"
          description="Sign out of your PullUp account. You can sign back in at any time."
        >
          <button
            type="button"
            onClick={handleSignOut}
            style={{
              padding: "12px 24px",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.05)",
              color: "#fff",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255,255,255,0.1)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(255,255,255,0.05)";
            }}
          >
            <SilverIcon as={LogOut} size={18} />
            <span>Sign Out</span>
          </button>
        </SettingsSection>

        {/* DELETE ACCOUNT */}
        <SettingsSection
          title="Delete Account"
          description="If you no longer wish to use PullUp, you can permanently delete your account."
        >
          <button
            type="button"
            style={{
              padding: "12px 24px",
              borderRadius: "12px",
              border: "none",
              background: "rgba(239, 68, 68, 0.2)",
              color: "#ef4444",
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(239, 68, 68, 0.3)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(239, 68, 68, 0.2)";
            }}
          >
            <SilverIcon as={AlertTriangle} size={18} style={{ color: "#f59e0b" }} />
            <span>Delete My Account</span>
          </button>
        </SettingsSection>
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: "13px",
  fontWeight: 600,
  marginBottom: "8px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  opacity: 0.9,
  display: "flex",
  alignItems: "center",
};

const hintStyle = {
  marginTop: "8px",
  fontSize: "12px",
  opacity: 0.5,
  lineHeight: 1.4,
};

function SettingsSection({ title, description, children }) {
  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
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
      {children}
    </div>
  );
}

export function SecurityItem({ icon, title, description, buttonText }) {
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
          background: "rgba(192, 192, 192, 0.2)",
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
