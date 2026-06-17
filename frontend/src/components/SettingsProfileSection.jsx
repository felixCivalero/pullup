import { useState, useRef } from "react";
import { User, Tag, MapPin, PenLine, Sparkles, Camera, Instagram, Music2, Youtube, Linkedin, Twitter, Globe, X, Plus } from "lucide-react";
import { colors } from "../theme/colors.js";
import { uploadProfileImage } from "../lib/imageUtils.js";
import { PullupEyes } from "./PullupEyes.jsx";

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

function TextField({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
      onFocus={(e) => (e.target.style.borderColor = colors.accentBorder)}
      onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
    />
  );
}

function TextArea({ value, onChange, placeholder, rows = 3, maxLength }) {
  return (
    <textarea
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      style={{ ...inputStyle, resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
      onFocus={(e) => (e.target.style.borderColor = colors.accentBorder)}
      onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
    />
  );
}

const SOCIAL_DEFS = [
  { key: "instagram", label: "Instagram", icon: Instagram, placeholder: "@yourhandle" },
  { key: "tiktok", label: "TikTok", icon: Music2, placeholder: "@yourhandle" },
  { key: "x", label: "X", icon: Twitter, placeholder: "@yourhandle" },
  { key: "youtube", label: "YouTube", icon: Youtube, placeholder: "Channel URL" },
  { key: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "Profile URL" },
  { key: "website", label: "Website", icon: Globe, placeholder: "yoursite.com" },
];

// Socials as add-on-demand rows + a dropdown to add more — keeps the profile
// tight instead of always showing six mostly-empty fields. A row appears once
// it has a value or the host explicitly adds it.
function SocialLinks({ links, onChange }) {
  const [added, setAdded] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const shown = SOCIAL_DEFS.filter(
    (d) => (links?.[d.key] && String(links[d.key]).trim()) || added.includes(d.key),
  );
  const available = SOCIAL_DEFS.filter((d) => !shown.some((s) => s.key === d.key));

  function add(key) { setAdded((a) => (a.includes(key) ? a : [...a, key])); setMenuOpen(false); }
  function remove(key) { setAdded((a) => a.filter((k) => k !== key)); onChange(key, ""); }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {shown.map((d) => {
        const Icon = d.icon;
        return (
          <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: colors.surfaceMuted, color: colors.textMuted }}>
              <Icon size={16} />
            </div>
            <input
              value={links?.[d.key] || ""}
              onChange={(e) => onChange(d.key, e.target.value)}
              placeholder={`${d.label} — ${d.placeholder}`}
              style={inputStyle}
              onFocus={(e) => (e.target.style.borderColor = colors.accentBorder)}
              onBlur={(e) => (e.target.style.borderColor = colors.borderStrong)}
            />
            <button
              type="button"
              onClick={() => remove(d.key)}
              title={`Remove ${d.label}`}
              style={{ width: 30, height: 30, flexShrink: 0, borderRadius: "50%", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textSubtle, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}

      {available.length > 0 && (
        <div style={{ position: "relative", alignSelf: "flex-start" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 999, border: `1px dashed ${colors.borderStrong}`, background: colors.surface, color: colors.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
          >
            <Plus size={14} /> Add a link
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 11, minWidth: 184, background: colors.backgroundCard, border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: "0 12px 32px rgba(10,10,10,0.12)", padding: 6 }}>
                {available.map((d) => {
                  const Icon = d.icon;
                  return (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => add(d.key)}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", borderRadius: 8, border: "none", background: "transparent", color: colors.text, fontSize: 13.5, fontWeight: 500, cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceMuted)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <Icon size={15} style={{ color: colors.textSubtle }} /> {d.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const cardStyle = {
  padding: 18,
  background: colors.surface,
  borderRadius: 14,
  border: `1px solid ${colors.borderFaint}`,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export function SettingsProfileSection({ user, setUser, onSave, showToast }) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [hoverPhoto, setHoverPhoto] = useState(false);
  const fileRef = useRef(null);

  const links = user?.brandingLinks || {};

  function patch(updates) {
    setUser((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  }
  function patchLink(key, v) {
    patch({ brandingLinks: { ...links, [key]: v } });
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

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const updated = await uploadProfileImage(file);
      setUser((prev) => ({ ...prev, ...updated }));
      window.dispatchEvent(new Event("profileUpdated"));
      showToast?.("Photo updated", "success");
    } catch (err) {
      showToast?.(err?.message || "Couldn't upload that image", "error");
    } finally {
      setUploadingPhoto(false);
    }
  }

  // Avatar inner — photo, else initials, else the eyes mark.
  const name = (user?.name || "").trim();
  const initials = name
    ? (name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || name.slice(0, 2)).toUpperCase()
    : null;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: colors.text }}>
          Profile
        </h2>
        <p style={{ fontSize: 14, color: colors.textMuted }}>
          Your public identity — the face of your Room and the brand behind your events.
        </p>
      </div>

      <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />

      <div style={cardStyle}>
        {/* Avatar + display name on one row */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onMouseEnter={() => setHoverPhoto(true)}
              onMouseLeave={() => setHoverPhoto(false)}
              title="Change photo"
              style={{ position: "relative", width: 72, height: 72, borderRadius: "50%", border: "none", padding: 0, cursor: "pointer", overflow: "hidden", background: user?.profilePicture ? "transparent" : colors.text }}
            >
              {user?.profilePicture ? (
                <img src={user.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : initials ? (
                <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 24, fontWeight: 700 }}>{initials}</span>
              ) : (
                <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: colors.accentSoft }}>
                  <PullupEyes variant="small" style={{ width: 36, height: 28, display: "block" }} />
                </span>
              )}
              <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", color: "#fff", opacity: hoverPhoto || uploadingPhoto ? 1 : 0, transition: "opacity 0.15s ease" }}>
                <Camera size={18} />
              </span>
            </button>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingPhoto} style={{ background: "none", border: "none", padding: 0, color: colors.textMuted, fontSize: 11.5, fontWeight: 600, cursor: uploadingPhoto ? "default" : "pointer" }}>
              {uploadingPhoto ? "Uploading…" : user?.profilePicture ? "Change" : "Upload"}
            </button>
          </div>
          <label style={{ flex: 1, minWidth: 0 }}>
            <div style={labelStyle}><User size={12} style={{ color: colors.textSubtle }} /> Display name</div>
            <TextField value={user?.name} onChange={(v) => patch({ name: v })} placeholder="Your name" />
          </label>
        </div>

        {/* About you + What you host — side by side on desktop, stacked on mobile */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "block", flex: "1 1 260px" }}>
            <div style={labelStyle}><PenLine size={12} style={{ color: colors.textSubtle }} /> About you</div>
            <TextArea value={user?.bio} onChange={(v) => patch({ bio: v })} rows={2} maxLength={240} placeholder="A line or two on who you are — e.g. I throw rooftop listening nights in Stockholm." />
            <div style={{ fontSize: 11, color: colors.textSubtle, marginTop: 4, textAlign: "right" }}>{(user?.bio || "").length}/240</div>
          </label>
          <label style={{ display: "block", flex: "1 1 260px" }}>
            <div style={labelStyle}><Sparkles size={12} style={{ color: colors.textSubtle }} /> What you host</div>
            <TextArea value={user?.hostBrief} onChange={(v) => patch({ hostBrief: v })} rows={2} placeholder="What kinds of events, who they're for, where you want to take this. Tunes your PullUp coach." />
          </label>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={{ display: "block", flex: "1 1 200px" }}>
            <div style={labelStyle}><Tag size={12} style={{ color: colors.textSubtle }} /> Brand or studio</div>
            <TextField value={user?.brand} onChange={(v) => patch({ brand: v })} placeholder="Your brand or company" />
          </label>
          <label style={{ display: "block", flex: "1 1 200px" }}>
            <div style={labelStyle}><MapPin size={12} style={{ color: colors.textSubtle }} /> Location</div>
            <TextField value={user?.city} onChange={(v) => patch({ city: v })} placeholder="City" />
          </label>
        </div>
      </div>

      {/* WHERE PEOPLE FIND YOU — social links */}
      <div style={{ marginTop: 18, marginBottom: 12 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: colors.text }}>Where people find you</h3>
        <p style={{ fontSize: 13, color: colors.textMuted }}>Just links shown on your pages — your Instagram, site, and socials.</p>
      </div>
      <div style={cardStyle}>
        <SocialLinks links={links} onChange={patchLink} />
      </div>

      {/* One save bar for everything text-based (photo saves itself) */}
      {dirty && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16, position: "sticky", bottom: 12 }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "11px 26px",
              borderRadius: 999,
              border: "none",
              background: saving ? colors.accentHover : colors.accent,
              color: "#ffffff",
              fontWeight: 700,
              fontSize: 13,
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
              boxShadow: colors.accentShadow || "0 8px 24px rgba(236,23,143,0.3)",
            }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}
