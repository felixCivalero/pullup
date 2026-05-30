import { useState } from "react";
import { User, Tag } from "lucide-react";
import { colors } from "../theme/colors.js";

const labelStyle = {
  fontSize: "11px",
  fontWeight: 700,
  color: colors.textSubtle,
  marginBottom: "8px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 14px",
  borderRadius: "10px",
  border: `1px solid ${colors.borderStrong}`,
  background: "#ffffff",
  color: colors.text,
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.2s",
};

function TextField({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
      onFocus={(e) => (e.target.style.borderColor = colors.accentBorder)}
      onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
    />
  );
}

export function SettingsProfileSection({ user, setUser, onSave, showToast }) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function patch(updates) {
    setUser((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  }

  async function handleSave() {
    if (!dirty) return;
    setSaving(true);
    try {
      await onSave(user);
      setDirty(false);
      showToast?.("Profile saved", "success");
    } catch {
      showToast?.("Failed to save", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: colors.text }}>
          Profile
        </h2>
        <p style={{ fontSize: 14, color: colors.textMuted }}>
          The basics you set up during signup. Everything else (logo, socials, website) lives on the events you create.
        </p>
      </div>

      <div
        style={{
          padding: 16,
          background: colors.surface,
          borderRadius: 12,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <label style={{ display: "block" }}>
          <div style={labelStyle}>
            <User size={12} style={{ color: colors.textSubtle }} />
            Full name
          </div>
          <TextField
            value={user?.name}
            onChange={(v) => patch({ name: v })}
            placeholder="Your full name"
          />
        </label>
        <label style={{ display: "block" }}>
          <div style={labelStyle}>
            <Tag size={12} style={{ color: colors.textSubtle }} />
            Brand or studio name
          </div>
          <TextField
            value={user?.brand}
            onChange={(v) => patch({ brand: v })}
            placeholder="Your brand or company name"
          />
        </label>
      </div>

      {dirty && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "10px 24px",
              borderRadius: 999,
              border: "none",
              background: saving ? colors.accentHover : colors.accent,
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 13,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              boxShadow: colors.accentShadow,
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
