// frontend/src/components/SettingsWhatsappSection.jsx
//
// Host's WhatsApp settings — phone-verify status + the message signature
// prepended to every WA broadcast/reminder. Lives in the light dashboard
// zone.
//
// The signature is the line that lets guests feel which host is talking
// even though the sender on their phone says "PullUp". Without it,
// every broadcast feels like a system message. With it, Adam's photo-walk
// invites read like Adam, not like a platform.

import { useState } from "react";
import { Check, Phone, ShieldCheck } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import { colors } from "../theme/colors.js";
import { API_BASE } from "../lib/env.js";

const HINT_TEMPLATES = [
  "Hey, it's Adam from Photowalks Stockholm —",
  "It's me, Maya — Sundowner Sessions —",
  "Tonight from PullUp HQ —",
];

export function SettingsWhatsappSection({ user, setUser, onSave, showToast }) {
  const [signature, setSignature] = useState(
    user?.whatsapp_signature || "",
  );
  const [enabled, setEnabled] = useState(
    user?.whatsapp_enabled === undefined ? true : !!user.whatsapp_enabled,
  );
  const [saving, setSaving] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyPending, setVerifyPending] = useState(null);

  const phoneE164 = user?.phone_e164 || null;
  const phoneVerified = !!user?.phone_verified_at;

  const dirty =
    signature !== (user?.whatsapp_signature || "") ||
    enabled !== (user?.whatsapp_enabled === undefined ? true : !!user.whatsapp_enabled);

  const handleSave = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      const ok = await onSave({
        whatsapp_signature: signature,
        whatsapp_enabled: enabled,
      });
      if (ok) {
        setUser((prev) =>
          prev
            ? { ...prev, whatsapp_signature: signature, whatsapp_enabled: enabled }
            : prev,
        );
        showToast?.("WhatsApp settings saved", "success");
      }
    } catch (err) {
      showToast?.(err?.message || "Could not save", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSendVerify = async () => {
    if (verifying || !phoneE164) return;
    setVerifying(true);
    setVerifyPending(null);
    try {
      const res = await fetch(`${API_BASE}/verify/phone/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phoneE164,
          intent: "verify_phone",
          payload: { source: "settings_whatsapp" },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) {
        setVerifyPending({ e164: json.e164, sandbox_link: json.sandbox_link });
        showToast?.("Verification link sent via WhatsApp", "success");
      } else {
        showToast?.(json?.error || "Could not send verification", "error");
      }
    } catch (err) {
      showToast?.(err?.message || "Network error", "error");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div>
      {/* Section header — mirrors the SettingsSection in HomeSettingsTab. */}
      <div style={{ marginBottom: "16px" }}>
        <h2
          style={{
            fontSize: "18px",
            fontWeight: 600,
            marginBottom: "4px",
            color: colors.text,
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <FaWhatsapp size={20} color={colors.secondary} />
          WhatsApp
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          Reach your guests where they already live. PullUp sends RSVP confirms,
          reminders, and your broadcasts as WhatsApp messages — they land in
          the same thread as their friends, not their spam folder.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {/* Phone status row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "14px 16px",
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
          }}
        >
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              background: phoneVerified ? colors.successRgba : colors.surfaceMuted,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {phoneVerified ? (
              <ShieldCheck size={20} color={colors.success} />
            ) : (
              <Phone size={20} color={colors.textMuted} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: colors.text,
                marginBottom: "2px",
              }}
            >
              {phoneE164 || "No phone on file"}
            </div>
            <div style={{ fontSize: "12px", color: colors.textMuted }}>
              {phoneVerified
                ? "Verified — sends will appear from PullUp"
                : phoneE164
                ? "Not verified yet — tap the link we WhatsApp you to confirm"
                : "Add your phone in your profile to enable WhatsApp"}
            </div>
          </div>
          {phoneE164 && !phoneVerified && (
            <button
              type="button"
              onClick={handleSendVerify}
              disabled={verifying}
              style={{
                flexShrink: 0,
                padding: "8px 14px",
                borderRadius: 999,
                border: `1px solid ${colors.accentBorder}`,
                background: colors.accentSoft,
                color: colors.accent,
                fontSize: "13px",
                fontWeight: 600,
                cursor: verifying ? "wait" : "pointer",
              }}
            >
              {verifying ? "Sending…" : "Send link"}
            </button>
          )}
          {phoneVerified && (
            <div
              style={{
                flexShrink: 0,
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "6px 10px",
                borderRadius: 999,
                background: colors.successRgba,
                color: colors.success,
                fontSize: "12px",
                fontWeight: 600,
              }}
            >
              <Check size={13} /> Verified
            </div>
          )}
        </div>

        {/* Just-sent verify hint */}
        {verifyPending && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: `1px solid ${colors.secondaryBorder}`,
              background: colors.secondarySoft,
              fontSize: 12,
              color: colors.textMuted,
              lineHeight: 1.5,
            }}
          >
            We just WhatsApp'd a one-tap link to{" "}
            <strong style={{ color: colors.text }}>{verifyPending.e164}</strong>.
            Open WhatsApp and tap it — your phone flips to verified instantly.
            {verifyPending.sandbox_link && (
              <>
                {" "}
                <a
                  href={verifyPending.sandbox_link}
                  style={{
                    color: colors.secondary,
                    textDecoration: "underline",
                  }}
                >
                  Sandbox link
                </a>
              </>
            )}
          </div>
        )}

        {/* Channel-enabled toggle */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "14px",
            padding: "14px 16px",
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
            cursor: phoneVerified ? "pointer" : "not-allowed",
            opacity: phoneVerified ? 1 : 0.55,
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            disabled={!phoneVerified}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{
              width: "18px",
              height: "18px",
              accentColor: colors.accent,
              flexShrink: 0,
              cursor: phoneVerified ? "pointer" : "not-allowed",
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: "14px",
                fontWeight: 600,
                color: colors.text,
                marginBottom: "2px",
              }}
            >
              Send my broadcasts via WhatsApp
            </div>
            <div style={{ fontSize: "12px", color: colors.textMuted }}>
              When on, broadcasts go via WhatsApp to guests who've opted in,
              falling back to email otherwise. When off, everything goes via
              email regardless of guest opt-in.
            </div>
          </div>
        </label>

        {/* Signature input */}
        <div
          style={{
            padding: "14px 16px",
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: "12px",
          }}
        >
          <label
            htmlFor="wa-signature"
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: colors.text,
              marginBottom: "4px",
            }}
          >
            Your WhatsApp signature
          </label>
          <div
            style={{
              fontSize: "12px",
              color: colors.textMuted,
              marginBottom: "10px",
              lineHeight: 1.5,
            }}
          >
            Prepended to every broadcast so guests feel which host is talking
            — even though the sender shows as "PullUp."
          </div>
          <input
            id="wa-signature"
            type="text"
            value={signature}
            onChange={(e) => setSignature(e.target.value.slice(0, 80))}
            placeholder={HINT_TEMPLATES[0]}
            maxLength={80}
            style={{
              width: "100%",
              padding: "11px 12px",
              borderRadius: 10,
              border: `1px solid ${colors.border}`,
              background: colors.background,
              color: colors.text,
              fontSize: "14px",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div
            style={{
              fontSize: 11,
              color: colors.textSubtle,
              marginTop: "6px",
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <span>Example: {HINT_TEMPLATES[1]}</span>
            <span>{signature.length}/80</span>
          </div>
        </div>

        {/* Save button — only when dirty */}
        {dirty && (
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 22px",
                borderRadius: 999,
                border: "none",
                background: colors.accent,
                color: "#fff",
                fontSize: "13px",
                fontWeight: 700,
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
                boxShadow: colors.accentShadow,
              }}
            >
              {saving ? "Saving…" : "Save WhatsApp settings"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsWhatsappSection;
