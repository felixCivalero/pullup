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
import { colors } from "../theme/colors.js";
import { SettingsProfileSection } from "./SettingsProfileSection.jsx";
import { SettingsBrandSection } from "./SettingsBrandSection.jsx";
import { SettingsWhatsappSection } from "./SettingsWhatsappSection.jsx";
import { SettingsMcpIntegration } from "./SettingsMcpIntegration.jsx";

export function SettingsTab({ user, setUser, onSave, showToast }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  // Stripe state
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  async function handleDeletionRequest() {
    if (deletingAccount || deletionRequested) return;
    const ok = window.confirm(
      "Request deletion of your account and personal data?\n\nWe'll erase everything within 30 days and email you to confirm. Payment records required by law are kept for 7 years.",
    );
    if (!ok) return;
    setDeletingAccount(true);
    try {
      const res = await authenticatedFetch("/me/deletion-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to submit request");
      setDeletionRequested(true);
      showToast?.("Deletion request received — we'll erase your account within 30 days.", "success");
    } catch (err) {
      console.error("[settings] deletion request failed:", err);
      showToast?.("Couldn't submit your request. Email hello@pullup.se and we'll handle it.", "error");
    } finally {
      setDeletingAccount(false);
    }
  }

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

  // Stripe status badge color
  const stripeStatusBorder = stripeConnected && stripeChargesEnabled
    ? `1px solid rgba(22,163,74,0.18)`
    : stripeConnected && !stripeDetailsSubmitted
    ? `1px solid rgba(180,83,9,0.18)`
    : `1px solid ${colors.border}`;

  const stripeIconBg = stripeConnected && stripeChargesEnabled
    ? colors.successRgba
    : stripeConnected && !stripeDetailsSubmitted
    ? colors.warningRgba
    : colors.surfaceMuted;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "48px" }}>
      <style>{`
        .settings-input {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 16px;
          border-radius: 12px;
          border: 1px solid ${colors.border};
          background: ${colors.surface};
          color: ${colors.text};
          font-size: 15px;
          outline: none;
          transition: border-color 0.2s;
        }
        .settings-input:focus {
          border-color: ${colors.borderStrong};
        }
        .settings-input::placeholder {
          color: ${colors.textSubtle};
        }
      `}</style>

      {/* PROFILE */}
      <SettingsProfileSection
        user={user}
        setUser={setUser}
        onSave={onSave}
        showToast={showToast}
      />

      {/* BRAND — five-token host identity that travels with every
          guest-facing surface (event page, email confirms, WhatsApp
          cover overlay). Lives above WhatsApp because the WhatsApp
          signature is *part of* the brand voice. */}
      <SettingsBrandSection
        user={user}
        setUser={setUser}
        onSave={onSave}
        showToast={showToast}
      />

      {/* WHATSAPP — phone-verify + host signature + channel toggle. */}
      <SettingsWhatsappSection
        user={user}
        setUser={setUser}
        onSave={onSave}
        showToast={showToast}
      />

      {/* PULLUP MCP */}
      <SettingsSection
        title="PullUp MCP"
        description="Manage your events conversationally from any AI assistant that speaks MCP — Claude, ChatGPT, Cursor, and more."
      >
        <SettingsMcpIntegration showToast={showToast} />
      </SettingsSection>

      {/* INTEGRATIONS */}
      <SettingsSection
        title="Integrations"
        description="Connect external services to power your events."
      >
        <div
          style={{
            padding: "20px",
            background: colors.background,
            borderRadius: "12px",
            border: stripeStatusBorder,
            boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
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
                background: stripeIconBg,
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
                  color: colors.text,
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
                      background: colors.successRgba,
                      color: colors.success,
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
                      background: colors.warningRgba,
                      color: colors.warning,
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
                      background: colors.warningRgba,
                      color: colors.warning,
                    }}
                  >
                    Pending verification
                  </span>
                )}
              </div>
              <div
                style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.5 }}
              >
                Accept payments for paid events, process refunds, and manage
                payouts.
              </div>
              {stripeConnected && (stripeBusinessName || stripeAccountEmail) && (
                <div
                  style={{
                    fontSize: "12px",
                    color: colors.textSubtle,
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
              borderRadius: "999px",
              border: stripeConnected && stripeDetailsSubmitted
                ? `1px solid ${colors.borderStrong}`
                : "none",
              background:
                stripeLoading || stripeConnecting
                  ? colors.surfaceMuted
                  : stripeConnected && stripeDetailsSubmitted
                  ? "transparent"
                  : colors.accent,
              color: stripeConnected && stripeDetailsSubmitted
                ? colors.text
                : "#fff",
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
                e.currentTarget.style.background = colors.dangerRgba;
                e.currentTarget.style.borderColor = `rgba(220,38,38,0.3)`;
                e.currentTarget.style.color = colors.danger;
              }
            }}
            onMouseLeave={(e) => {
              if (stripeConnected && stripeDetailsSubmitted && !stripeLoading && !stripeConnecting) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = colors.borderStrong;
                e.currentTarget.style.color = colors.text;
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
          borderTop: `1px solid ${colors.border}`,
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
              borderRadius: "999px",
              border: `1px solid ${colors.borderStrong}`,
              background: colors.surface,
              color: colors.text,
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = colors.surfaceMuted;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = colors.surface;
            }}
          >
            <SilverIcon as={LogOut} size={18} />
            <span>Sign Out</span>
          </button>
        </SettingsSection>

        {/* DELETE ACCOUNT */}
        <SettingsSection
          title="Delete Account"
          description="Request permanent deletion of your account and personal data. We'll erase everything within 30 days and email you to confirm. Payment records required by law are kept for 7 years."
        >
          <button
            type="button"
            onClick={handleDeletionRequest}
            disabled={deletingAccount || deletionRequested}
            style={{
              padding: "12px 24px",
              borderRadius: "999px",
              border: "none",
              background: deletionRequested ? colors.surfaceMuted : colors.dangerRgba,
              color: deletionRequested ? colors.textSubtle : colors.danger,
              fontWeight: 600,
              fontSize: "14px",
              cursor: deletingAccount || deletionRequested ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.3s ease",
            }}
            onMouseEnter={(e) => {
              if (!deletingAccount && !deletionRequested) e.currentTarget.style.background = "rgba(220,38,38,0.15)";
            }}
            onMouseLeave={(e) => {
              if (!deletingAccount && !deletionRequested) e.currentTarget.style.background = colors.dangerRgba;
            }}
          >
            <AlertTriangle size={18} style={{ color: colors.warning }} />
            <span>{deletionRequested ? "Deletion requested" : deletingAccount ? "Submitting…" : "Request account deletion"}</span>
          </button>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({ title, description, children }) {
  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "4px",
            color: colors.text,
          }}
        >
          {title}
        </h2>
        <p
          style={{
            fontSize: "14px",
            color: colors.textMuted,
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
        background: colors.surface,
        borderRadius: "12px",
        border: `1px solid ${colors.border}`,
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
              color: colors.text,
            }}
          >
            {title}
          </div>
          <div style={{ fontSize: "13px", color: colors.textMuted }}>{description}</div>
        </div>
      </div>
      <button
        type="button"
        style={{
          padding: "8px 16px",
          borderRadius: "999px",
          border: `1px solid ${colors.border}`,
          background: colors.surface,
          color: colors.text,
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
