import { useState, useEffect, useRef } from "react";
import { User, Tag, MapPin, PenLine, Sparkles, Camera, Instagram, Music2, Youtube, Linkedin, Twitter, Globe, Check, X } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch } from "../lib/api.js";
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

// One social link row — icon + a clean handle/url input.
function SocialField({ icon: Icon, label, value, onChange, placeholder }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: colors.surfaceMuted, color: colors.textMuted }}>
        <Icon size={17} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSubtle, marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
        <TextField value={value} onChange={onChange} placeholder={placeholder} />
      </div>
    </div>
  );
}

const cardStyle = {
  padding: 18,
  background: colors.surface,
  borderRadius: 14,
  border: `1px solid ${colors.border}`,
  boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

export function SettingsProfileSection({ user, setUser, onSave, showToast }) {
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [hoverPhoto, setHoverPhoto] = useState(false);
  const [ig, setIg] = useState(null); // {connected, account} | null
  const fileRef = useRef(null);

  const links = user?.brandingLinks || {};

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/instagram/connection")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setIg(d); })
      .catch(() => { if (alive) setIg(null); });
    return () => { alive = false; };
  }, []);

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

  async function connectInstagram() {
    try {
      const res = await authenticatedFetch("/instagram/connect-url");
      if (!res.ok) { showToast?.("Instagram connect isn't available yet", "error"); return; }
      const { url } = await res.json();
      if (url) window.location.href = url;
      else showToast?.("Instagram connect isn't available yet", "error");
    } catch {
      showToast?.("Couldn't start Instagram connect", "error");
    }
  }

  async function refreshIg() {
    const d = await authenticatedFetch("/instagram/connection").then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setIg(d);
  }
  async function setDefaultIg(id) {
    await authenticatedFetch(`/instagram/connections/${id}/default`, { method: "POST" }).catch(() => {});
    setIg((prev) => (prev ? { ...prev, accounts: (prev.accounts || []).map((a) => ({ ...a, isDefault: a.id === id })) } : prev));
    showToast?.("Replies will send from this account", "success");
  }
  function saveIgLabel(id, label) {
    const v = (label || "").trim();
    authenticatedFetch(`/instagram/connections/${id}`, { method: "PATCH", body: JSON.stringify({ label: v }) }).catch(() => {});
    setIg((prev) => (prev ? { ...prev, accounts: (prev.accounts || []).map((a) => (a.id === id ? { ...a, label: v } : a)) } : prev));
  }
  async function disconnectIg(id) {
    if (!window.confirm("Disconnect this Instagram account?")) return;
    await authenticatedFetch(`/instagram/connections/${id}`, { method: "DELETE" }).catch(() => {});
    refreshIg();
    showToast?.("Disconnected", "success");
  }

  // Avatar inner — photo, else initials, else the eyes mark.
  const name = (user?.name || "").trim();
  const initials = name
    ? (name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("") || name.slice(0, 2)).toUpperCase()
    : null;

  const igAccounts = ig?.accounts || [];

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
        {/* Photo + name, side by side like a profile header */}
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onMouseEnter={() => setHoverPhoto(true)}
            onMouseLeave={() => setHoverPhoto(false)}
            title="Change photo"
            style={{ position: "relative", width: 84, height: 84, borderRadius: "50%", flexShrink: 0, border: "none", padding: 0, cursor: "pointer", overflow: "hidden", background: user?.profilePicture ? "transparent" : colors.text }}
          >
            {user?.profilePicture ? (
              <img src={user.profilePicture} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : initials ? (
              <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 28, fontWeight: 700 }}>{initials}</span>
            ) : (
              <span style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", background: colors.accentSoft }}>
                <PullupEyes variant="small" style={{ width: 40, height: 32, display: "block" }} />
              </span>
            )}
            <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.45)", color: "#fff", opacity: hoverPhoto || uploadingPhoto ? 1 : 0, transition: "opacity 0.15s ease" }}>
              <Camera size={20} />
            </span>
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 4 }}>
              {uploadingPhoto ? "Uploading…" : "Profile photo"}
            </div>
            <div style={{ fontSize: 12.5, color: colors.textSubtle, lineHeight: 1.45 }}>
              This is the face on your Room. A clear headshot or logo works best.
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingPhoto} style={{ marginTop: 8, padding: "6px 14px", borderRadius: 999, border: `1px solid ${colors.borderStrong}`, background: colors.surface, color: colors.text, fontSize: 12.5, fontWeight: 600, cursor: uploadingPhoto ? "default" : "pointer" }}>
              {user?.profilePicture ? "Change photo" : "Upload photo"}
            </button>
          </div>
        </div>

        <label style={{ display: "block" }}>
          <div style={labelStyle}><User size={12} style={{ color: colors.textSubtle }} /> Display name</div>
          <TextField value={user?.name} onChange={(v) => patch({ name: v })} placeholder="Your name" />
        </label>

        <label style={{ display: "block" }}>
          <div style={labelStyle}><PenLine size={12} style={{ color: colors.textSubtle }} /> Bio</div>
          <TextArea value={user?.bio} onChange={(v) => patch({ bio: v })} rows={2} maxLength={160} placeholder="One line on who you are — e.g. I throw rooftop listening nights in Stockholm." />
          <div style={{ fontSize: 11, color: colors.textSubtle, marginTop: 4, textAlign: "right" }}>{(user?.bio || "").length}/160</div>
        </label>

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
      <div style={{ marginTop: 24, marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: colors.text }}>Where people find you</h3>
        <p style={{ fontSize: 13, color: colors.textMuted }}>The links that show up on your event pages — the rooms next door to PullUp.</p>
      </div>
      <div style={cardStyle}>
        <SocialField icon={Instagram} label="Instagram" value={links.instagram} onChange={(v) => patchLink("instagram", v)} placeholder="@yourhandle" />
        <SocialField icon={Music2} label="TikTok" value={links.tiktok} onChange={(v) => patchLink("tiktok", v)} placeholder="@yourhandle" />
        <SocialField icon={Twitter} label="X" value={links.x} onChange={(v) => patchLink("x", v)} placeholder="@yourhandle" />
        <SocialField icon={Youtube} label="YouTube" value={links.youtube} onChange={(v) => patchLink("youtube", v)} placeholder="Channel URL" />
        <SocialField icon={Linkedin} label="LinkedIn" value={links.linkedin} onChange={(v) => patchLink("linkedin", v)} placeholder="Profile URL" />
        <SocialField icon={Globe} label="Website" value={links.website} onChange={(v) => patchLink("website", v)} placeholder="yoursite.com" />
      </div>

      {/* CONNECTED — Instagram accounts (personal + business, pick reply-from) */}
      <div style={{ marginTop: 24, marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: colors.text }}>Connected accounts</h3>
        <p style={{ fontSize: 13, color: colors.textMuted }}>Connect Instagram to reach guests in their DMs from your Room. Add a personal and a business account, and choose which one your replies send from.</p>
      </div>
      <div style={{ ...cardStyle, padding: 0, gap: 0 }}>
        {ig == null ? (
          <div style={{ padding: 16, fontSize: 13, color: colors.textSubtle }}>Checking…</div>
        ) : igAccounts.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: 16 }}>
            <span style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: colors.surfaceMuted, color: colors.textMuted }}><Instagram size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>Instagram</div>
              <div style={{ fontSize: 12.5, color: colors.textMuted }}>Not connected yet</div>
            </div>
            <button type="button" onClick={connectInstagram} style={{ padding: "10px 20px", borderRadius: 999, border: "none", background: colors.accent, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Connect</button>
          </div>
        ) : (
          <>
            {igAccounts.map((a, i) => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderTop: i ? `1px solid ${colors.borderFaint}` : "none" }}>
                <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: colors.accentSoft, color: colors.accent }}><Instagram size={18} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 650, color: colors.text }}>@{a.ig_username || "account"}</span>
                    {a.isDefault && <span style={{ fontSize: 10, fontWeight: 700, color: colors.accent, background: colors.accentSoft, padding: "2px 7px", borderRadius: 999 }}>Replies send from here</span>}
                  </div>
                  <input
                    defaultValue={a.label || ""}
                    placeholder="Label — e.g. Personal or Business"
                    onBlur={(e) => saveIgLabel(a.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                    style={{ marginTop: 5, width: "100%", maxWidth: 260, boxSizing: "border-box", border: `1px solid ${colors.border}`, borderRadius: 8, padding: "5px 9px", fontSize: 12.5, color: colors.text, outline: "none" }}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                  {!a.isDefault && (
                    <button type="button" onClick={() => setDefaultIg(a.id)} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${colors.borderStrong}`, background: colors.surface, color: colors.text, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>Reply from this</button>
                  )}
                  <button type="button" onClick={() => disconnectIg(a.id)} title="Disconnect" style={{ width: 30, height: 30, borderRadius: "50%", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><X size={14} /></button>
                </div>
              </div>
            ))}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${colors.borderFaint}` }}>
              <button type="button" onClick={connectInstagram} style={{ padding: "8px 14px", borderRadius: 999, border: `1px dashed ${colors.borderStrong}`, background: colors.surface, color: colors.text, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>+ Connect another account</button>
            </div>
          </>
        )}
      </div>

      {/* WHAT YOU HOST — the coach brief */}
      <div style={{ marginTop: 24, marginBottom: 14 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 2, color: colors.text }}>What you host</h3>
        <p style={{ fontSize: 13, color: colors.textMuted }}>A few lines on your world. Your PullUp coach uses this to tune every suggestion to you.</p>
      </div>
      <div style={cardStyle}>
        <label style={{ display: "block" }}>
          <div style={labelStyle}><Sparkles size={12} style={{ color: colors.textSubtle }} /> Your brief</div>
          <TextArea value={user?.hostBrief} onChange={(v) => patch({ hostBrief: v })} rows={4} placeholder="What kinds of events, who they're for, and where you want to take this." />
        </label>
      </div>

      {/* One save bar for everything text-based (photo + IG connect save themselves) */}
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
