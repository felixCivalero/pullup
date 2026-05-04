import { useState } from "react";
import { User, Tag } from "lucide-react";
import { SilverIcon } from "./ui/SilverIcon.jsx";

const labelStyle = {
  fontSize: "11px",
  fontWeight: 700,
  color: "rgba(255,255,255,0.5)",
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
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(20, 16, 30, 0.6)",
  color: "#fff",
  fontSize: "14px",
  outline: "none",
  transition: "border-color 0.2s",
};

function Field({ icon, label, children }) {
  return (
    <label style={{ display: "block" }}>
      <div style={labelStyle}>
        {icon ? <SilverIcon as={icon} size={12} /> : null}
        {label}
      </div>
      {children}
    </label>
  );
}

function TextField({ value, onChange, placeholder }) {
  return (
    <input
      type="text"
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
      onFocus={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.25)")}
      onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.1)")}
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
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
          Profile
        </h2>
        <p style={{ fontSize: 14, opacity: 0.7 }}>
          The basics you set up during signup. Everything else (logo, socials, website) lives on the events you create.
        </p>
      </div>

      <div
        style={{
          padding: 16,
          background: "rgba(20, 16, 30, 0.6)",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Field icon={User} label="Full name">
          <TextField
            value={user?.name}
            onChange={(v) => patch({ name: v })}
            placeholder="Your full name"
          />
        </Field>
        <Field icon={Tag} label="Brand or studio name">
          <TextField
            value={user?.brand}
            onChange={(v) => patch({ brand: v })}
            placeholder="Your brand or company name"
          />
        </Field>
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
              background:
                "linear-gradient(135deg, #f0f0f0 0%, #c0c0c0 50%, #a8a8a8 100%)",
              color: "#111",
              fontWeight: 700,
              fontSize: 13,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.6 : 1,
              boxShadow: "0 4px 16px rgba(192, 192, 192, 0.3)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
