// frontend/src/components/SettingsWhatsappSection.jsx
//
// Host's WhatsApp number — added and verified right here with a one-tap link.
// The phone lives in Settings (not the profile, not per-event): we only keep a
// number if it's WhatsApp-synced. There's no global "send via WhatsApp" toggle
// and no outbound-message editing — channel routing and message content are
// decided per event/community/product page.

import { useState } from "react";
import { Check, Phone, ShieldCheck } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa6";
import { colors } from "../theme/colors.js";
import { API_BASE } from "../lib/env.js";

export function SettingsWhatsappSection({ user, showToast }) {
  const [phoneInput, setPhoneInput] = useState(user?.phone_e164 || "");
  const [editPhone, setEditPhone] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyPending, setVerifyPending] = useState(null);

  const phoneE164 = user?.phone_e164 || null;
  const phoneVerified = !!user?.phone_verified_at;

  const handleSendVerify = async () => {
    const phone = (phoneInput || "").trim();
    if (verifying || !phone) return;
    setVerifying(true);
    setVerifyPending(null);
    try {
      const res = await fetch(`${API_BASE}/verify/phone/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          intent: "verify_phone",
          payload: { source: "settings_whatsapp" },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) {
        setVerifyPending({ e164: json.e164, sandbox_link: json.sandbox_link });
        setEditPhone(false);
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
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text, display: "flex", alignItems: "center", gap: "10px" }}>
          <FaWhatsapp size={20} color={colors.secondary} />
          WhatsApp
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          Add the number PullUp sends as on WhatsApp — so RSVP confirms, reminders,
          and your messages land in the same thread as their friends, not their spam
          folder. We only keep it once it's verified.
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {phoneVerified && !editPhone ? (
          /* Verified — show the number + a quiet way to change it. */
          <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: colors.successRgba, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <ShieldCheck size={20} color={colors.success} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: colors.text, marginBottom: "2px" }}>{phoneE164}</div>
              <div style={{ fontSize: "12px", color: colors.textMuted }}>Verified — sends will appear from PullUp</div>
            </div>
            <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: "4px", padding: "6px 10px", borderRadius: 999, background: colors.successRgba, color: colors.success, fontSize: "12px", fontWeight: 600 }}>
              <Check size={13} /> Verified
            </span>
            <button type="button" onClick={() => { setEditPhone(true); setPhoneInput(phoneE164 || ""); }} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
              Change
            </button>
          </div>
        ) : (
          /* Enter + verify the WhatsApp number. */
          <div style={{ padding: "14px 16px", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: "12px" }}>
            <label htmlFor="wa-phone" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "14px", fontWeight: 600, color: colors.text, marginBottom: "4px" }}>
              <Phone size={15} color={colors.textMuted} /> Your WhatsApp number
            </label>
            <div style={{ fontSize: "12px", color: colors.textMuted, marginBottom: "10px", lineHeight: 1.5 }}>
              Enter it, then tap the one-tap link we WhatsApp you to verify.
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <input
                id="wa-phone"
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+254 7XX XXX XXX"
                style={{ flex: 1, minWidth: 180, padding: "11px 12px", borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: "14px", outline: "none", boxSizing: "border-box" }}
              />
              <button
                type="button"
                onClick={handleSendVerify}
                disabled={verifying || !phoneInput.trim()}
                style={{ flexShrink: 0, padding: "11px 18px", borderRadius: 999, border: "none", background: colors.accent, color: "#fff", fontSize: "13px", fontWeight: 700, cursor: verifying || !phoneInput.trim() ? "not-allowed" : "pointer", opacity: verifying || !phoneInput.trim() ? 0.5 : 1 }}
              >
                {verifying ? "Sending…" : "Send verification"}
              </button>
            </div>
            {phoneVerified && editPhone && (
              <button type="button" onClick={() => { setEditPhone(false); setPhoneInput(phoneE164 || ""); }} style={{ marginTop: 10, background: "none", border: "none", color: colors.textMuted, fontSize: "12px", fontWeight: 600, cursor: "pointer", padding: 0 }}>
                Cancel
              </button>
            )}
          </div>
        )}

        {/* Just-sent verify hint */}
        {verifyPending && (
          <div style={{ padding: "10px 14px", borderRadius: 12, border: `1px solid ${colors.secondaryBorder}`, background: colors.secondarySoft, fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
            We just WhatsApp'd a one-tap link to{" "}
            <strong style={{ color: colors.text }}>{verifyPending.e164}</strong>.
            Open WhatsApp and tap it — your number flips to verified instantly.
            {verifyPending.sandbox_link && (
              <>
                {" "}
                <a href={verifyPending.sandbox_link} style={{ color: colors.secondary, textDecoration: "underline" }}>
                  Sandbox link
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsWhatsappSection;
