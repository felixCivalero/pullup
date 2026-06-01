// frontend/src/components/room/ProfileSetup.jsx
//
// "MAKE YOUR ROOM YOURS" — the profile-completeness mechanic.
//
// The Room is the host's creator profile (the social-dashboard framing). A
// profile that's all defaults reads as nobody's room. So this card nudges the
// host to fill the few things that make it unmistakably theirs — a face, a
// line about who they are, their Instagram, and what they host — and quietly
// captures that data inline (the right moment to ask is here, in their home,
// not a settings page they never open).
//
// It's a METRIC, not a nag: a completeness ring, done items checked off, the
// card disappears at 100%, and a quiet dismiss if they're not in the mood.
// Saving anything patches the masthead live (your new photo shows instantly).

import { useState, useEffect, useRef } from "react";
import { Camera, Instagram, PenLine, Sparkles, Check } from "lucide-react";
import { colors } from "../../theme/colors.js";
import { authenticatedFetch } from "../../lib/api.js";
import { uploadProfileImage } from "../../lib/imageUtils.js";
import { useToast } from "../Toast";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const DISMISS_KEY = "pullup_room_profile_setup_dismissed";

// A small progress ring with the % in the middle — the "metric".
function Ring({ pct, size = 50, stroke = 4 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.borderFaint} strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colors.accent} strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.45s ease" }}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize="12.5" fontWeight="800" fill={colors.text} fontFamily={SF}>{pct}%</text>
    </svg>
  );
}

export default function ProfileSetup({ onHostPatch }) {
  const { showToast } = useToast();
  const [profile, setProfile] = useState(null);
  const [igConnected, setIgConnected] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === "1"; } catch { return false; }
  });
  const [openItem, setOpenItem] = useState(null);
  const [draftBio, setDraftBio] = useState("");
  const [draftBrief, setDraftBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      authenticatedFetch("/host/profile").then((r) => (r.ok ? r.json() : null)),
      authenticatedFetch("/instagram/connection").then((r) => (r.ok ? r.json() : null)),
    ]).then(([p, ig]) => {
      if (!alive) return;
      const prof = p.status === "fulfilled" ? p.value : null;
      const igv = ig.status === "fulfilled" ? ig.value : null;
      setProfile(prof || {});
      setDraftBio((prof?.bio || "").trim());
      setDraftBrief((prof?.hostBrief || "").trim());
      setIgConnected(!!igv?.connected);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, []);

  // ── actions ──────────────────────────────────────────────────────
  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      await uploadProfileImage(file);
      // Re-fetch so we get the resolved (signed/public) URL, not a raw path.
      const fresh = await authenticatedFetch("/host/profile").then((r) => (r.ok ? r.json() : null));
      if (fresh) {
        setProfile(fresh);
        onHostPatch?.({ avatar: fresh.profilePicture || null });
      }
      showToast("Photo added", "success");
    } catch (err) {
      showToast(err?.message || "Couldn't upload that image", "error");
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(patch) {
    setBusy(true);
    try {
      const res = await authenticatedFetch("/host/profile", { method: "PUT", body: JSON.stringify(patch) });
      if (!res.ok) throw new Error("save failed");
      const updated = await res.json().catch(() => null);
      setProfile((p) => ({ ...(p || {}), ...patch, ...(updated || {}) }));
      return true;
    } catch {
      showToast("Couldn't save that — try again", "error");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveAbout() {
    const bio = draftBio.trim();
    if (!bio) return;
    if (await saveProfile({ bio })) {
      onHostPatch?.({ role: bio });
      setOpenItem(null);
      showToast("Saved", "success");
    }
  }

  async function saveBrief() {
    const hostBrief = draftBrief.trim();
    if (!hostBrief) return;
    if (await saveProfile({ hostBrief })) {
      setOpenItem(null);
      showToast("Got it — your coach is tuned", "success");
    }
  }

  async function connectInstagram() {
    try {
      const res = await authenticatedFetch("/instagram/connect-url");
      if (!res.ok) { showToast("Instagram connect isn't available yet", "error"); return; }
      const { url } = await res.json();
      if (url) window.location.href = url;
      else showToast("Instagram connect isn't available yet", "error");
    } catch {
      showToast("Couldn't start Instagram connect", "error");
    }
  }

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setDismissed(true);
  }

  // ── completeness ─────────────────────────────────────────────────
  const has = {
    photo: !!profile?.profilePicture,
    about: !!(profile?.bio || "").trim(),
    instagram: igConnected,
    brief: !!(profile?.hostBrief || "").trim(),
  };
  const ITEMS = [
    { key: "photo", icon: Camera, label: "Add a profile photo", desc: "Your face anchors the Room.", run: () => fileRef.current?.click() },
    { key: "about", icon: PenLine, label: "Describe yourself", desc: "One line on who you are.", inline: true },
    { key: "instagram", icon: Instagram, label: "Connect Instagram", desc: "Reach your people where they already are.", run: connectInstagram },
    { key: "brief", icon: Sparkles, label: "Tell PullUp what you host", desc: "So your coach knows your world.", inline: true },
  ];
  const done = ITEMS.filter((i) => has[i.key]).length;
  const pct = Math.round((done / ITEMS.length) * 100);

  // Don't flash before we know; hide when dismissed or fully complete.
  if (!loaded || dismissed || done === ITEMS.length) return null;

  return (
    <div style={{ marginBottom: "26px", border: `1px solid ${colors.accentBorder}`, borderRadius: "18px", background: colors.accentSoft, overflow: "hidden", fontFamily: SF }}>
      <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: "none" }} />

      {/* Header — the metric */}
      <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px 18px 14px" }}>
        <Ring pct={pct} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "15px", fontWeight: 750, color: colors.text, letterSpacing: "-0.01em" }}>Make your Room yours</div>
          <div style={{ fontSize: "12.5px", color: colors.textMuted, marginTop: "2px" }}>
            {done} of {ITEMS.length} done · so your people know who's pulling them up
          </div>
        </div>
        <button onClick={dismiss} title="Maybe later" style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.05)", color: colors.textSubtle, fontSize: "15px", cursor: "pointer", flexShrink: 0, lineHeight: 1 }}>×</button>
      </div>

      {/* Items */}
      <div style={{ background: colors.surface, borderTop: `1px solid ${colors.borderFaint}` }}>
        {ITEMS.map((item) => {
          const complete = has[item.key];
          const Icon = item.icon;
          const open = openItem === item.key;
          return (
            <div key={item.key} style={{ borderBottom: `1px solid ${colors.borderFaint}` }}>
              <button
                onClick={() => {
                  if (complete) return;
                  if (item.inline) setOpenItem(open ? null : item.key);
                  else item.run?.();
                }}
                disabled={complete || busy}
                style={{
                  display: "flex", alignItems: "center", gap: "13px", width: "100%", textAlign: "left",
                  padding: "13px 18px", border: "none", background: open ? colors.surfaceMuted : "transparent",
                  cursor: complete ? "default" : "pointer", fontFamily: SF,
                }}
              >
                <span style={{ width: 34, height: 34, borderRadius: "10px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: complete ? colors.successRgba || "#e7f7ee" : colors.accentSoft, color: complete ? (colors.success || "#16a34a") : colors.accent }}>
                  {complete ? <Check size={17} /> : <Icon size={17} />}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "14px", fontWeight: 650, color: complete ? colors.textSubtle : colors.text, textDecoration: complete ? "none" : "none" }}>{item.label}</span>
                  <span style={{ display: "block", fontSize: "12px", color: colors.textSubtle, marginTop: "1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {complete ? "Done" : item.desc}
                  </span>
                </span>
                {!complete && (
                  <span style={{ fontSize: "15px", fontWeight: 600, color: colors.accent, flexShrink: 0 }}>{item.inline ? (open ? "−" : "+") : "→"}</span>
                )}
              </button>

              {/* Inline editors */}
              {open && item.key === "about" && (
                <div style={{ padding: "0 18px 16px 65px" }}>
                  <textarea
                    value={draftBio} onChange={(e) => setDraftBio(e.target.value)} rows={2}
                    placeholder="e.g. I throw rooftop listening nights in Stockholm for a tight music crowd."
                    style={{ width: "100%", boxSizing: "border-box", resize: "none", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13.5px", fontFamily: SF, color: colors.text, outline: "none" }}
                  />
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button disabled={busy || !draftBio.trim()} onClick={saveAbout} style={{ padding: "8px 16px", borderRadius: "999px", border: "none", background: draftBio.trim() ? colors.accent : colors.surfaceMuted, color: draftBio.trim() ? "#fff" : colors.textFaded, fontWeight: 700, fontSize: "12.5px", cursor: draftBio.trim() ? "pointer" : "default", fontFamily: SF }}>Save</button>
                    <button onClick={() => setOpenItem(null)} style={{ padding: "8px 14px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, fontWeight: 600, fontSize: "12.5px", cursor: "pointer", fontFamily: SF }}>Cancel</button>
                  </div>
                </div>
              )}
              {open && item.key === "brief" && (
                <div style={{ padding: "0 18px 16px 65px" }}>
                  <textarea
                    value={draftBrief} onChange={(e) => setDraftBrief(e.target.value)} rows={3}
                    placeholder="What kinds of events, who they're for, and where you want to take this."
                    style={{ width: "100%", boxSizing: "border-box", resize: "none", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13.5px", fontFamily: SF, color: colors.text, outline: "none" }}
                  />
                  <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                    <button disabled={busy || !draftBrief.trim()} onClick={saveBrief} style={{ padding: "8px 16px", borderRadius: "999px", border: "none", background: draftBrief.trim() ? colors.accent : colors.surfaceMuted, color: draftBrief.trim() ? "#fff" : colors.textFaded, fontWeight: 700, fontSize: "12.5px", cursor: draftBrief.trim() ? "pointer" : "default", fontFamily: SF }}>Save</button>
                    <button onClick={() => setOpenItem(null)} style={{ padding: "8px 14px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, fontWeight: 600, fontSize: "12.5px", cursor: "pointer", fontFamily: SF }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
