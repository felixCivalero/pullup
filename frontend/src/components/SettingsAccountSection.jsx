// Account — sign out (this device / all devices) + request account deletion.
// Extracted from the old HomeSettingsTab footer into a first-class section.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, AlertTriangle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { SilverIcon } from "./ui/SilverIcon.jsx";
import { colors } from "../theme/colors.js";

export function SettingsAccountSection({ showToast }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [deletionRequested, setDeletionRequested] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const handleSignOut = async (scope = "local") => {
    try {
      await signOut({ scope });
      navigate("/");
    } catch (error) {
      console.error("Sign out error:", error);
      showToast?.("Failed to sign out", "error");
    }
  };

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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
      {/* SIGN OUT */}
      <div>
        <div style={{ marginBottom: "16px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>
            Sign out
          </h2>
          <p style={{ fontSize: "14px", color: colors.textMuted }}>
            Sign out of this device. Your other devices stay signed in, and you can sign back in any time.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "14px" }}>
          <button
            type="button"
            onClick={() => handleSignOut("local")}
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
            onMouseEnter={(e) => { e.currentTarget.style.background = colors.surfaceMuted; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = colors.surface; }}
          >
            <SilverIcon as={LogOut} size={18} />
            <span>Sign out</span>
          </button>
          <button
            type="button"
            onClick={() => handleSignOut("global")}
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              color: colors.textMuted,
              fontWeight: 500,
              fontSize: "13px",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            Log out of all devices
          </button>
        </div>
      </div>

      {/* DELETE ACCOUNT */}
      <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: "32px" }}>
        <div style={{ marginBottom: "16px" }}>
          <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text }}>
            Delete account
          </h2>
          <p style={{ fontSize: "14px", color: colors.textMuted }}>
            Request permanent deletion of your account and personal data. We'll erase everything within 30 days and
            email you to confirm. Payment records required by law are kept for 7 years.
          </p>
        </div>
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
      </div>
    </div>
  );
}
