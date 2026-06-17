// Notifications — an opt-in, email-only DAILY DIGEST. Default OFF.
//
// The host flips on a once-a-day summary and picks which kinds of activity it
// covers. We only ever send one email a day, and only when there's something to
// report (the backend job no-ops on an empty day). Slim by design: email is the
// only channel, daily is the only cadence — the choice that matters is *what*.
//
// Contract (backend built in parallel):
//   GET  /host/notifications        → { enabled, frequency, channel, email, categories{}, lastSentAt }
//   PUT  /host/notifications        → same shape (upsert)
//   POST /host/notifications/test   → emails a preview to the host now

import { useEffect, useRef, useState } from "react";
import { Bell, Mail, Send } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const CATEGORIES = [
  { key: "rsvps", label: "New RSVPs", desc: "When someone signs up to an event" },
  { key: "messages", label: "New messages", desc: "When a guest replies or DMs you" },
  { key: "waitlist", label: "Waitlist joins", desc: "When someone joins a waitlist" },
  { key: "community", label: "Community joins", desc: "When someone joins your community" },
  { key: "pullups", label: "Pull-ups", desc: "When people show up at your events" },
];

const DEFAULT_CATEGORIES = { rsvps: true, messages: true, waitlist: true, community: true, pullups: true };

export function SettingsNotificationsSection({ showToast, onEnabledChange }) {
  const [prefs, setPrefs] = useState(null); // null = loading
  const [saved, setSaved] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const saveTimer = useRef(null);
  const savedTimer = useRef(null);

  useEffect(() => {
    let cancelled = false;
    authenticatedFetch("/host/notifications")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const next = data || { enabled: false, frequency: "daily", channel: "email", email: "", categories: DEFAULT_CATEGORIES, lastSentAt: null };
        next.categories = { ...DEFAULT_CATEGORIES, ...(next.categories || {}) };
        setPrefs(next);
        onEnabledChange?.(!!next.enabled);
      })
      .catch(() => { if (!cancelled) setPrefs({ enabled: false, frequency: "daily", channel: "email", email: "", categories: DEFAULT_CATEGORIES, lastSentAt: null }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  // Persist (debounced) whenever the host changes something. Optimistic UI;
  // the backend upserts. A subtle "Saved" flag confirms it.
  function persist(next) {
    setPrefs(next);
    onEnabledChange?.(!!next.enabled);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const res = await authenticatedFetch("/host/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: next.enabled, frequency: next.frequency, categories: next.categories }),
        });
        if (!res.ok) throw new Error("save failed");
        const data = await res.json().catch(() => null);
        if (data) { data.categories = { ...DEFAULT_CATEGORIES, ...(data.categories || {}) }; setPrefs(data); }
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 1800);
      } catch {
        showToast?.("Couldn't save your notification settings. Try again.", "error");
      }
    }, 500);
  }

  const toggleMaster = () => persist({ ...prefs, enabled: !prefs.enabled });
  const toggleCategory = (key) =>
    persist({ ...prefs, categories: { ...prefs.categories, [key]: !prefs.categories[key] } });

  async function sendTest() {
    if (sendingTest) return;
    setSendingTest(true);
    try {
      const res = await authenticatedFetch("/host/notifications/test", { method: "POST" });
      if (!res.ok) throw new Error("test failed");
      const data = await res.json().catch(() => ({}));
      showToast?.(`Preview sent${data?.sentTo ? ` to ${data.sentTo}` : ""}. Check your inbox.`, "success");
    } catch {
      showToast?.("Couldn't send the preview just now. Try again in a moment.", "error");
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div>
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "18px", fontWeight: 600, marginBottom: "4px", color: colors.text, display: "flex", alignItems: "center", gap: 8 }}>
          Notifications
          {saved && <span style={{ fontSize: 11, fontWeight: 600, color: colors.success }}>Saved</span>}
        </h2>
        <p style={{ fontSize: "14px", color: colors.textMuted }}>
          A once-a-day email summary of what happened in your world — sent only when there's something to tell you.
        </p>
      </div>

      <div
        style={{
          padding: "4px 20px",
          background: colors.surface,
          borderRadius: "14px",
          border: `1px solid ${prefs?.enabled ? colors.accentBorder : colors.borderFaint}`,
          transition: "border-color 0.2s",
        }}
      >
        {/* Master row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 0" }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 11, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: prefs?.enabled ? colors.accentSoft : colors.surfaceMuted,
              color: prefs?.enabled ? colors.accent : colors.textSubtle,
              transition: "all 0.2s",
            }}
          >
            <Bell size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 650, color: colors.text }}>Daily email summary</div>
            <div style={{ fontSize: 13, color: colors.textMuted }}>
              {prefs?.enabled
                ? "On — we'll email you once a day when there's news."
                : "Off — you're not getting any notifications right now."}
            </div>
          </div>
          <Switch on={!!prefs?.enabled} disabled={!prefs} onClick={toggleMaster} />
        </div>

        {/* Expanded detail */}
        {prefs?.enabled && (
          <div style={{ borderTop: `1px solid ${colors.borderFaint}`, paddingTop: 16, paddingBottom: 18 }}>
            {/* Destination */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
              <Mail size={14} style={{ color: colors.textSubtle }} />
              <span>
                Delivered by email{prefs.email ? <> to <span style={{ color: colors.text, fontWeight: 600 }}>{prefs.email}</span></> : ""}
              </span>
            </div>

            {/* Categories */}
            <div style={{ fontSize: 11, fontWeight: 600, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Include in my summary
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {CATEGORIES.map((c) => {
                const on = !!prefs.categories?.[c.key];
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => toggleCategory(c.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, width: "100%",
                      padding: "10px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                      background: "transparent", textAlign: "left", font: "inherit",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = colors.surfaceMuted)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <Check on={on} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 14, fontWeight: 600, color: colors.text }}>{c.label}</span>
                      <span style={{ display: "block", fontSize: 12.5, color: colors.textSubtle }}>{c.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Preview */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
              <button
                type="button"
                onClick={sendTest}
                disabled={sendingTest}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 7,
                  padding: "9px 16px", borderRadius: 999, cursor: sendingTest ? "default" : "pointer",
                  border: `1px solid ${colors.borderStrong}`, background: colors.surface,
                  color: colors.text, fontSize: 13, fontWeight: 600, opacity: sendingTest ? 0.6 : 1,
                }}
              >
                <Send size={14} />
                {sendingTest ? "Sending…" : "Send me a preview"}
              </button>
              <span style={{ fontSize: 12, color: colors.textSubtle }}>See exactly what lands in your inbox.</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// A compact iOS-style switch.
function Switch({ on, onClick, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      style={{
        position: "relative", width: 46, height: 28, borderRadius: 999, border: "none",
        flexShrink: 0, cursor: disabled ? "default" : "pointer", padding: 0,
        background: on ? colors.accent : colors.borderStrong,
        transition: "background 0.2s", opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: "absolute", top: 3, left: on ? 21 : 3, width: 22, height: 22,
          borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

// A compact checkbox tick.
function Check({ on }) {
  return (
    <span
      style={{
        width: 20, height: 20, borderRadius: 6, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: on ? colors.accent : "transparent",
        border: `1.5px solid ${on ? colors.accent : colors.borderStrong}`,
        transition: "all 0.15s",
      }}
    >
      {on && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2l2.3 2.3L9.5 3.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}
