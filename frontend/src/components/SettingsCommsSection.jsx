// frontend/src/components/SettingsCommsSection.jsx
//
// The host's Comms control center. Two things live here:
//   1) Automatic messages — every transactional message PullUp sends for the
//      host (RSVP confirms, reminders, …). The host can't rewrite the wording
//      (it stays consistent so guests trust it's really from their host), but
//      they style it with their brand + signature and add a personal note
//      where it fits. Email preview is the real rendered document.
//   2) Automated DMs (Instagram) — comment-a-keyword → auto-DM the event link.
//
// Lives in the light dashboard zone; mirrors SettingsWhatsappSection /
// SettingsProfileSection card + heading conventions exactly.

import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { MessageSquare, Instagram, ChevronDown, ChevronRight } from "lucide-react";
import { colors } from "../theme/colors.js";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "./Toast";

const cardStyle = {
  padding: 18,
  background: colors.surface,
  borderRadius: 14,
  border: `1px solid ${colors.border}`,
  boxShadow: "0 8px 30px rgba(10,10,10,0.06)",
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

const labelStyle = {
  fontSize: "11px",
  fontWeight: 700,
  color: colors.textSubtle,
  marginBottom: "6px",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

function focusBorder(e) {
  e.target.style.borderColor = colors.accentBorder;
}
function blurBorder(e) {
  e.target.style.borderColor = colors.borderStrong;
}

const pillButton = (active) => ({
  padding: "10px 22px",
  borderRadius: 999,
  border: "none",
  background: colors.accent,
  color: "#fff",
  fontSize: "13px",
  fontWeight: 700,
  cursor: active ? "wait" : "pointer",
  opacity: active ? 0.7 : 1,
  boxShadow: colors.accentShadow,
});

// ── A small channel chip — "Email" or "WhatsApp" (+ pending state). ──
// WhatsApp only actually ships once Meta approves the template; until then the
// chip says "pending approval" so the host never thinks it's going out yet.
function ChannelChip({ channel, live }) {
  const isWa = channel === "whatsapp";
  const pending = isWa && !live;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: isWa ? colors.surfaceMuted : colors.secondarySoft,
        color: isWa ? colors.textMuted : colors.secondary,
        border: `1px solid ${isWa ? colors.border : colors.secondaryBorder}`,
      }}
    >
      {isWa ? "WhatsApp" : "Email"}
      {pending && (
        <span style={{ fontSize: 10, opacity: 0.85 }}>· pending approval</span>
      )}
    </span>
  );
}

// ── One automatic-message card. ──
function MessageCard({ msg, note, onNote, onTest, testing }) {
  const [open, setOpen] = useState(false);
  const wa = msg.whatsapp || {};
  const channels = msg.channels || ["email"];

  return (
    <div
      style={{
        padding: 16,
        background: "#ffffff",
        border: `1px solid ${colors.border}`,
        borderRadius: 12,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text, marginBottom: 2 }}>
            {msg.label}
          </div>
          <div style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 1.5 }}>
            {msg.description}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {channels.map((c) => (
          <ChannelChip key={c} channel={c} live={c === "whatsapp" ? wa.live : true} />
        ))}
      </div>

      {wa.available && !wa.live && (
        <div style={{ fontSize: 11.5, color: colors.textSubtle, lineHeight: 1.5 }}>
          Goes out by email for now — WhatsApp switches on automatically once Meta approves the template.
        </div>
      )}

      {msg.note && (
        <div style={{ fontSize: 12, color: colors.textSubtle, lineHeight: 1.5 }}>{msg.note}</div>
      )}

      {/* Preview expander */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "none",
          border: "none",
          padding: 0,
          color: colors.secondary,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {open ? "Hide preview" : "Preview"}
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {msg.email?.html ? (
            <div>
              {msg.email.subject && (
                <div style={{ fontSize: 12, color: colors.textSubtle, marginBottom: 6 }}>
                  Subject: <span style={{ color: colors.text, fontWeight: 600 }}>{msg.email.subject}</span>
                </div>
              )}
              <iframe
                title={`${msg.key}-email-preview`}
                srcDoc={msg.email.html}
                sandbox=""
                style={{
                  width: "100%",
                  height: 520,
                  border: `1px solid ${colors.border}`,
                  borderRadius: 10,
                  background: "#fff",
                }}
              />
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: colors.textSubtle }}>No email preview for this message.</div>
          )}

          {wa.available && wa.text && (
            <div>
              <div style={{ ...labelStyle, marginBottom: 6 }}>WhatsApp</div>
              <div
                style={{
                  background: "#e7f9ee",
                  border: `1px solid ${colors.successRgba}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                  fontSize: 13.5,
                  color: colors.text,
                  lineHeight: 1.5,
                  whiteSpace: "pre-wrap",
                }}
              >
                {wa.text}
              </div>
              <div style={{ fontSize: 11.5, color: colors.textSubtle, marginTop: 6, lineHeight: 1.5 }}>
                WhatsApp wording is set by Meta — your signature personalizes it.
                {!wa.live && " This template is still pending Meta approval, so it's delivered by email until then."}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Personal note */}
      {msg.editableNote && (
        <div>
          <div style={labelStyle}>Your note (added to this email)</div>
          <textarea
            value={note || ""}
            onChange={(e) => onNote(e.target.value.slice(0, 280))}
            rows={2}
            maxLength={280}
            placeholder="A line in your voice — e.g. Can't wait to see you there."
            style={{ ...inputStyle, resize: "none", lineHeight: 1.5, fontFamily: "inherit" }}
            onFocus={focusBorder}
            onBlur={blurBorder}
          />
          <div style={{ fontSize: 11, color: colors.textSubtle, marginTop: 4, textAlign: "right" }}>
            {(note || "").length}/280
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => onTest(msg.key)}
          disabled={testing}
          style={{
            padding: "7px 14px",
            borderRadius: 999,
            border: `1px solid ${colors.borderStrong}`,
            background: colors.surface,
            color: colors.text,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: testing ? "wait" : "pointer",
          }}
        >
          {testing ? "Sending…" : "Send test to me"}
        </button>
      </div>
    </div>
  );
}

export function SettingsCommsSection({ user }) {
  const { showToast } = useToast();

  // ── 1) Automatic messages ──
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [msgsError, setMsgsError] = useState(false);
  const [signature, setSignature] = useState("");
  const [messages, setMessages] = useState([]);
  const [notes, setNotes] = useState({}); // { [key]: note }
  const [savingMsgs, setSavingMsgs] = useState(false);
  const [testingKey, setTestingKey] = useState(null);

  const loadComms = useCallback(async () => {
    setLoadingMsgs(true);
    setMsgsError(false);
    try {
      const res = await authenticatedFetch("/host/comms");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setSignature(data.signature || "");
      const msgs = Array.isArray(data.messages) ? data.messages : [];
      setMessages(msgs);
      // Seed each editable note from any per-message stored value.
      const initialNotes = {};
      for (const m of msgs) {
        if (m.editableNote) initialNotes[m.key] = typeof m.savedNote === "string" ? m.savedNote : "";
      }
      setNotes(initialNotes);
    } catch {
      setMsgsError(true);
    } finally {
      setLoadingMsgs(false);
    }
  }, []);

  useEffect(() => {
    loadComms();
  }, [loadComms]);

  async function handleTest(key) {
    setTestingKey(key);
    try {
      const res = await authenticatedFetch("/host/comms/test", {
        method: "POST",
        body: JSON.stringify({ messageKey: key }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) showToast(`Sent to ${data.sentTo || "you"}`, "success");
      else showToast(data.error || "Couldn't send test", "error");
    } catch {
      showToast("Couldn't send test", "error");
    } finally {
      setTestingKey(null);
    }
  }

  async function handleSaveMsgs() {
    setSavingMsgs(true);
    try {
      const overrides = {};
      for (const m of messages) {
        const note = (notes[m.key] || "").trim();
        if (note) overrides[m.key] = { note };
      }
      const res = await authenticatedFetch("/host/comms", {
        method: "PUT",
        body: JSON.stringify({ signature, overrides }),
      });
      if (!res.ok) throw new Error("Failed");
      showToast("Saved", "success");
    } catch {
      showToast("Couldn't save", "error");
    } finally {
      setSavingMsgs(false);
    }
  }

  // ── 2) Automated DMs (Instagram) ──
  // The comment→DM editor moved to its own first-class page (/auto-dm), where
  // triggers are per-event and expire when the event ends. We keep only a
  // pointer here so hosts who look in Settings still find it.

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
      {/* ════ AUTOMATIC MESSAGES ════ */}
      <div>
        <div style={{ marginBottom: 16 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 4,
              color: colors.text,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <MessageSquare size={20} color={colors.accent} />
            Automatic messages
          </h2>
          <p style={{ fontSize: 14, color: colors.textMuted, lineHeight: 1.5 }}>
            Every message PullUp sends for you. Style them with your brand + signature; add a
            personal note where it fits. Wording stays consistent so your guests always know it's
            really from you.
          </p>
        </div>

        {loadingMsgs ? (
          <div style={{ fontSize: 13.5, color: colors.textSubtle }}>Loading…</div>
        ) : msgsError ? (
          <div style={{ fontSize: 13.5, color: colors.textMuted }}>
            Couldn't load your messages.{" "}
            <button
              type="button"
              onClick={loadComms}
              style={{ background: "none", border: "none", padding: 0, color: colors.accent, fontWeight: 600, cursor: "pointer" }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Signature */}
            <div>
              <div style={labelStyle}>Your signature</div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginBottom: 8, lineHeight: 1.5 }}>
                Your voice on every message — so guests feel which host is talking.
              </div>
              <input
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value.slice(0, 80))}
                maxLength={80}
                placeholder="Hey, it's Adam from Photowalks Stockholm —"
                style={inputStyle}
                onFocus={focusBorder}
                onBlur={blurBorder}
              />
            </div>

            {messages.map((m) => (
              <MessageCard
                key={m.key}
                msg={m}
                note={notes[m.key]}
                onNote={(v) => setNotes((prev) => ({ ...prev, [m.key]: v }))}
                onTest={handleTest}
                testing={testingKey === m.key}
              />
            ))}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={handleSaveMsgs} disabled={savingMsgs} style={pillButton(savingMsgs)}>
                {savingMsgs ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ════ AUTOMATED DMs (INSTAGRAM) ════ */}
      <div>
        <div style={{ marginBottom: 12 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 600,
              marginBottom: 4,
              color: colors.text,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Instagram size={20} color={colors.instagram} />
            Automated DMs
          </h2>
          <p style={{ fontSize: 14, color: colors.textMuted, lineHeight: 1.5 }}>
            Comment→DM triggers now live on their own page — per event, and
            they retire automatically when the event ends.
          </p>
        </div>
        <Link
          to="/auto-dm"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "11px 18px",
            borderRadius: 999,
            textDecoration: "none",
            background: colors.gradientInstagram,
            color: "#fff",
            fontSize: 13.5,
            fontWeight: 700,
            boxShadow: "0 6px 18px rgba(214,36,159,0.28)",
          }}
        >
          <Instagram size={16} /> Open Auto-DM
        </Link>
      </div>
    </div>
  );
}

export default SettingsCommsSection;
