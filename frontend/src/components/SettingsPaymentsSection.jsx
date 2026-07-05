// Payments — Stripe Connect status + connect/resume/disconnect.
//
// Extracted verbatim from the old HomeSettingsTab "Integrations" block so the
// two-pane Settings shell can render it as a first-class section. Reports its
// connection status up (onStatus) so the nav rail can show a status dot.

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { colors } from "../theme/colors.js";

export function SettingsPaymentsSection({ showToast, onStatus }) {
  const [connected, setConnected] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [detailsSubmitted, setDetailsSubmitted] = useState(false);
  const [chargesEnabled, setChargesEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    loadStatus();
    checkCallback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bubble status to the rail whenever it changes (drives the nav dot).
  useEffect(() => {
    onStatus?.({ connected, chargesEnabled, detailsSubmitted });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, chargesEnabled, detailsSubmitted]);

  async function loadStatus() {
    try {
      setLoading(true);
      const response = await authenticatedFetch("/host/stripe/connect/status");
      if (!response.ok) throw new Error("Failed to load Stripe status");
      const data = await response.json();
      setConnected(data.connected);
      setAccountEmail(data.accountDetails?.email || "");
      setBusinessName(data.accountDetails?.businessName || "");
      setDetailsSubmitted(data.accountDetails?.details_submitted || false);
      setChargesEnabled(data.accountDetails?.charges_enabled || false);
    } catch (error) {
      console.error("Failed to load Stripe status:", error);
      setConnected(false);
      setAccountEmail("");
      setBusinessName("");
      setDetailsSubmitted(false);
      setChargesEnabled(false);
    } finally {
      setLoading(false);
    }
  }

  function checkCallback() {
    const params = new URLSearchParams(window.location.search);
    const stripeConnect = params.get("stripe_connect");
    const accountId = params.get("account_id");
    const errorMessage = params.get("message");

    if (stripeConnect === "success" && accountId) {
      showToast?.("Stripe connected successfully!", "success");
      loadStatus();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (stripeConnect === "refresh") {
      showToast?.("Stripe onboarding incomplete. Click Connect to resume.", "error");
      loadStatus();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (stripeConnect === "error" && errorMessage) {
      showToast?.(`Stripe connection failed: ${decodeURIComponent(errorMessage)}`, "error");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }

  async function handleConnect() {
    if (connected && !detailsSubmitted) {
      try {
        setConnecting(true);
        const response = await authenticatedFetch("/host/stripe/connect/initiate", { method: "POST" });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to resume onboarding");
        }
        const data = await response.json();
        if (data.alreadyComplete) {
          showToast?.("Stripe is already connected!", "success");
          loadStatus();
          setConnecting(false);
          return;
        }
        window.location.href = data.authorizationUrl;
      } catch (error) {
        console.error("Failed to resume Stripe onboarding:", error);
        showToast?.(error.message || "Failed to resume Stripe setup", "error");
        setConnecting(false);
      }
      return;
    }

    if (connected) {
      try {
        setConnecting(true);
        const response = await authenticatedFetch("/host/stripe/connect/disconnect", { method: "POST" });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to disconnect");
        }
        setConnected(false);
        setAccountEmail("");
        setDetailsSubmitted(false);
        setChargesEnabled(false);
        showToast?.("Stripe disconnected", "success");
      } catch (error) {
        console.error("Failed to disconnect Stripe:", error);
        showToast?.(error.message || "Failed to disconnect Stripe account", "error");
      } finally {
        setConnecting(false);
      }
    } else {
      try {
        setConnecting(true);
        const response = await authenticatedFetch("/host/stripe/connect/initiate", { method: "POST" });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to initiate connection");
        }
        const data = await response.json();
        if (data.alreadyComplete) {
          showToast?.("Stripe is already connected!", "success");
          loadStatus();
          setConnecting(false);
          return;
        }
        window.location.href = data.authorizationUrl;
      } catch (error) {
        console.error("Failed to initiate Stripe Connect:", error);
        showToast?.(error.message || "Failed to connect Stripe account", "error");
        setConnecting(false);
      }
    }
  }

  const cardBorder = connected && chargesEnabled
    ? `1px solid rgba(22,163,74,0.18)`
    : connected && !detailsSubmitted
    ? `1px solid rgba(180,83,9,0.18)`
    : `1px solid ${colors.border}`;

  const iconBg = connected && chargesEnabled
    ? colors.successRgba
    : connected && !detailsSubmitted
    ? colors.warningRgba
    : colors.surfaceMuted;

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>
          Ticket sales
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          Connect Stripe to sell tickets and process refunds — this is where YOUR ticket money lands. (PullUp's own subscription lives under Billing.)
        </p>
      </div>

      <div
        style={{
          padding: "20px",
          background: colors.surface,
          borderRadius: "14px",
          border: cardBorder,
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
              background: iconBg,
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
              {connected && chargesEnabled && (
                <span style={pill(colors.successRgba, colors.success)}>Connected</span>
              )}
              {connected && !detailsSubmitted && (
                <span style={pill(colors.warningRgba, colors.warning)}>Setup incomplete</span>
              )}
              {connected && detailsSubmitted && !chargesEnabled && (
                <span style={pill(colors.warningRgba, colors.warning)}>Pending verification</span>
              )}
            </div>
            <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.5 }}>
              Accept payments for paid events, process refunds, and manage payouts.
            </div>
            {connected && (businessName || accountEmail) && (
              <div style={{ fontSize: "12px", color: colors.textSubtle, marginTop: "6px" }}>
                {businessName && <span style={{ fontWeight: 500 }}>{businessName}</span>}
                {businessName && accountEmail && " · "}
                {accountEmail}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={loading || connecting}
          style={{
            padding: "10px 20px",
            borderRadius: "999px",
            border: connected && detailsSubmitted ? `1px solid ${colors.borderStrong}` : "none",
            background:
              loading || connecting
                ? colors.surfaceMuted
                : connected && detailsSubmitted
                ? "transparent"
                : colors.accent,
            color: connected && detailsSubmitted ? colors.text : "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: loading || connecting ? "not-allowed" : "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.3s ease",
            opacity: loading || connecting ? 0.6 : 1,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            if (connected && detailsSubmitted && !loading && !connecting) {
              e.currentTarget.style.background = colors.dangerRgba;
              e.currentTarget.style.borderColor = `rgba(220,38,38,0.3)`;
              e.currentTarget.style.color = colors.danger;
            }
          }}
          onMouseLeave={(e) => {
            if (connected && detailsSubmitted && !loading && !connecting) {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = colors.borderStrong;
              e.currentTarget.style.color = colors.text;
            }
          }}
        >
          {loading
            ? "Loading..."
            : connecting
            ? "Connecting..."
            : connected && !detailsSubmitted
            ? "Complete Setup"
            : connected
            ? "Disconnect"
            : "Connect Stripe"}
        </button>
      </div>
    </div>
  );
}

function pill(bg, color) {
  return {
    fontSize: "11px",
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: "999px",
    background: bg,
    color,
  };
}
