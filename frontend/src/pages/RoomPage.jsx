// frontend/src/pages/RoomPage.jsx
//
// THE ROOM — the global home of PullUp.
//
// North star ("The Room IS PullUp", 2026-05-31): the person is the atom, events
// are content that pours touchpoints into each person's timeline. So this is the
// GLOBAL relationship home — every person across every event, one identity each,
// one unified cross-channel + cross-event thread.
//
// It opens with SIGNALS, not a dashboard (the IG trick): living nudges that
// come find the host and point at an action. Below, the people — ranked by
// who-needs-you. An event-LENS lets the host focus the whole Room on one event
// without leaving home. Tapping anyone opens their thread in a side panel.
//
// The anti-extraction line is built in: suggested replies are the host's real
// voice made easier (a draft he approves) — never care manufactured on his
// behalf. Composer = draft, never auto-send.

import { useState, useMemo, useEffect, useRef, useLayoutEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Check, Link2, Paperclip, X, Search } from "lucide-react";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import { useToast } from "../components/Toast";
import { colors } from "../theme/colors.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { EventHostsSection } from "../components/EventHostsSection.jsx";
import { VipInviteSection } from "../components/VipInviteSection.jsx";
import ProfileSetup from "../components/room/ProfileSetup.jsx";
import LookingBack from "../components/room/LookingBack.jsx";
import { HOST as HOST_FIXTURE, EVENTS as EVENTS_FIXTURE, SIGNALS as SIGNALS_FIXTURE, PEOPLE as PEOPLE_FIXTURE } from "../components/room/roomGlobalFixtures.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const CHANNELS = {
  whatsapp: { label: "WhatsApp", color: "#25D366", soft: "#e7f9ee", glyph: "WA" },
  instagram: { label: "Instagram", color: "#d6249f", soft: "#fdeef7", glyph: "IG" },
  email: { label: "Email", color: "#6b6b6b", soft: "#f0f0ee", glyph: "@" },
};

function ChannelChip({ channel, windowOpen, windowNote }) {
  const c = CHANNELS[channel] || CHANNELS.email;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, color: c.color, background: c.soft, padding: "3px 9px", borderRadius: "999px", whiteSpace: "nowrap" }}>
      <span style={{ fontSize: "9px", fontWeight: 800, letterSpacing: "0.03em" }}>{c.glyph}</span>
      {c.label}
      {windowOpen === true && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: c.color, boxShadow: `0 0 0 3px ${c.soft}` }} title={windowNote || "open"} />
      )}
    </span>
  );
}

function HeatDot({ warmth }) {
  // Make warmth actually legible: filled core scales, ring stays subtle.
  const fill = warmth >= 0.8 ? colors.accent : warmth >= 0.55 ? "#f472b6" : warmth >= 0.35 ? "#f9a8d4" : "#d4d4d8";
  return <span title="how close they are to you" style={{ width: 8, height: 8, borderRadius: "50%", background: fill, flexShrink: 0, display: "inline-block" }} />;
}

function Avatar({ initials, color, size = 44 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 700, letterSpacing: "0.02em", flexShrink: 0, fontFamily: SF }}>
      {initials}
    </div>
  );
}

// ─── Notifications — ambient FACTS, collapsed into a bell ───────────
// The distinction (Felix, 2026-06-01): a notification is a fact that already
// resolved ("Eric signed up") — passive, click → context. An ACTIONABLE is a
// fact + an opening worth responding to — that lives in "Who needs you" below,
// not here. So this is just glanceable awareness: a bell with a count that
// expands a recent-activity feed. It stays GLOBAL — never scoped by the event
// filter (you always want to know what's happening everywhere).
function NotificationBell({ signals, onOpenPerson, onLensEvent }) {
  const [open, setOpen] = useState(false);
  const n = signals.length;
  return (
    <div style={{ marginBottom: open ? "20px" : "26px" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: "8px", background: "transparent", border: "none", cursor: "pointer", fontFamily: SF, padding: 0 }}
      >
        <PullupEyes variant="small" style={{ width: "24px", height: "20px", display: "block" }} />
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle }}>
          Since you were last here
        </span>
        {n > 0 && (
          <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#fff", background: colors.textSubtle, borderRadius: "999px", padding: "1px 7px", minWidth: 16, textAlign: "center" }}>{n}</span>
        )}
        <span style={{ fontSize: "12px", color: colors.textSubtle, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}>⌄</span>
      </button>
      {open && (
        <div style={{ marginTop: "12px" }}>
          <Signals signals={signals} onOpenPerson={onOpenPerson} onLensEvent={onLensEvent} bare />
        </div>
      )}
    </div>
  );
}

// ─── Signals — living nudges that come to the door ──────────────────
function Signals({ signals, onOpenPerson, onLensEvent, bare = false }) {
  const tint = {
    urgent: { dot: colors.accent, bg: colors.accentSoft },
    warm: { dot: colors.secondary, bg: colors.secondarySoft },
    plain: { dot: colors.textSubtle, bg: colors.surfaceMuted },
  };
  return (
    <div style={{ marginBottom: bare ? 0 : "26px" }}>
      {!bare && (
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <PullupEyes variant="small" style={{ width: "26px", height: "22px", display: "block" }} />
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle }}>
            Since you were last here
          </span>
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {signals.map((s) => {
          const t = tint[s.kind] || tint.plain;
          const go = () => (s.personId ? onOpenPerson(s.personId) : s.eventId ? onLensEvent(s.eventId) : null);
          return (
            <button
              key={s.id}
              onClick={go}
              style={{
                display: "flex", alignItems: "flex-start", gap: "11px", width: "100%", textAlign: "left",
                background: t.bg, border: `1px solid ${colors.borderFaint}`, borderRadius: "14px",
                padding: "13px 15px", cursor: "pointer", fontFamily: SF,
                transition: "border-color 0.15s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.border; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderFaint; }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: t.dot, marginTop: "6px", flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: "14px", lineHeight: 1.5, color: colors.text }}>{s.text}</span>
              <span style={{ fontSize: "11.5px", color: colors.textSubtle, flexShrink: 0, marginTop: "2px" }}>{s.time}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Person card ────────────────────────────────────────────────────
function PersonCard({ person, active, onClick, events }) {
  const [hover, setHover] = useState(false);
  const lm = person.lastMessage;
  // Cross-event belonging shown as small event ticks — the relationship's
  // history at a glance, the thing that only exists globally.
  const evChips = (person.events || []).map((id) => events.find((e) => e.id === id)).filter(Boolean);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", gap: "14px", width: "100%", textAlign: "left", padding: "16px",
        borderRadius: "16px",
        border: `1px solid ${active ? colors.accentBorder : colors.border}`,
        background: active ? colors.accentSoft : hover ? colors.surfaceMuted : colors.surface,
        cursor: "pointer", transition: "background 0.15s ease, border-color 0.15s ease",
        fontFamily: SF, marginBottom: "10px",
      }}
    >
      <Avatar initials={person.initials} color={person.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
          <HeatDot warmth={person.warmth} />
          <span style={{ fontSize: "14.5px", fontWeight: 650, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {person.name}
          </span>
          {person.suggestion && (
            <span style={{ fontSize: "10px", fontWeight: 600, color: colors.secondary, background: colors.secondarySoft, padding: "2px 7px", borderRadius: "999px" }}>
              could invite
            </span>
          )}
          <span style={{ marginLeft: "auto", flexShrink: 0 }}>
            <ChannelChip channel={person.channel} windowOpen={person.windowOpen} windowNote={person.windowNote} />
          </span>
        </div>

        <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.45, marginBottom: lm || person.needsYou || evChips.length ? "8px" : 0 }}>
          {person.relationship}
        </div>

        {lm && (
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", fontSize: "12.5px", color: colors.textSubtle, marginBottom: evChips.length ? "8px" : 0 }}>
            <span style={{ color: lm.from === "them" ? colors.text : colors.textSubtle, fontWeight: lm.from === "them" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lm.from === "you" ? "You: " : ""}{lm.text}
            </span>
            <span style={{ marginLeft: "auto", flexShrink: 0, color: colors.textFaded }}>{lm.time}</span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {/* History: which events this relationship has touched */}
          {evChips.map((e) => (
            <span key={e.id} style={{ fontSize: "10.5px", color: colors.textSubtle, background: colors.surfaceMuted, border: `1px solid ${colors.borderFaint}`, padding: "2px 8px", borderRadius: "999px", whiteSpace: "nowrap" }}>
              {e.title.replace("Sunset Rooftop · ", "")}
            </span>
          ))}
          {/* The one suggested move */}
          {person.needsYou && person.move && (
            <span style={{ marginLeft: evChips.length ? "auto" : 0, display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: colors.accent, background: colors.surface, border: `1px solid ${colors.accentBorder}`, padding: "5px 11px", borderRadius: "999px" }}>
              → {person.move}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Side panel: one person's unified, cross-event thread ───────────
// A real, sandboxed render of the email as the recipient sees it — same HTML
// the backend ships. Driven from the composer so the design choice isn't blind.
function EmailPreviewModal({ html, loading, label, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: SF }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 560, maxHeight: "86vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 12px 48px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>
            Email preview <span style={{ fontSize: 11, fontWeight: 600, color: colors.textSubtle }}>· {label || "Plain note"}</span>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: colors.surfaceMuted, color: colors.textMuted, fontSize: 15, cursor: "pointer" }}>×</button>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: colors.textSubtle, fontSize: 13 }}>Rendering…</div>
        ) : (
          <iframe title="Email preview" srcDoc={html} style={{ border: "none", width: "100%", height: "62vh", background: "#fff" }} />
        )}
      </div>
    </div>
  );
}

function ThreadPanel({ person, onClose, igAccounts = [] }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState("");
  const [rail, setRail] = useState(person.channel);
  const [sending, setSending] = useState(false);
  const [sentMsgs, setSentMsgs] = useState([]); // messages sent this session, shown instantly
  const [attachments, setAttachments] = useState([]); // [{url,name,isImage}]
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  // Which IG account replies send from — only matters when the host connected
  // more than one (personal + business). Defaults to their chosen default.
  const defaultIg = igAccounts.find((a) => a.isDefault) || igAccounts[0] || null;
  const [igFrom, setIgFrom] = useState(defaultIg?.id || null);

  const lastInboundChannel = useMemo(() => {
    const inbound = [...person.thread].reverse().find((m) => m.from === "them");
    return inbound?.channel || person.channel;
  }, [person]);

  const reachable = person.reachable || [person.channel];
  const c = CHANNELS[rail] || CHANNELS.email;
  const crossing = rail !== lastInboundChannel;
  // What the thread shows: their real history + anything sent this session.
  const thread = useMemo(() => [...person.thread, ...sentMsgs], [person.thread, sentMsgs]);

  useEffect(() => { setDraft(""); setRail(person.channel); setIgFrom(defaultIg?.id || null); setSentMsgs([]); setAttachments([]); }, [person.id, person.channel, defaultIg?.id]);

  async function onAttach(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} is over 10MB`, "error"); continue; }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const res = await authenticatedFetch("/host/room/attachment", { method: "POST", body: JSON.stringify({ dataUrl, filename: file.name }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) setAttachments((a) => [...a, { url: data.url, name: data.name, isImage: data.isImage }]);
        else showToast("Couldn't attach that file", "error");
      } catch { showToast("Couldn't attach that file", "error"); }
    }
    setUploading(false);
  }

  async function handleSend() {
    const text = draft.trim();
    if ((!text && !attachments.length) || sending) return;
    if (rail === "instagram") {
      showToast("Instagram sending is coming — switch to Email or WhatsApp to send now", "error");
      return;
    }
    setSending(true);
    try {
      const res = await authenticatedFetch("/host/room/message", {
        method: "POST",
        body: JSON.stringify({ personId: person.id, channel: rail, text, attachments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast(data.error === "no_email" ? "No email on file for them yet" : "Couldn't send — try again", "error");
      } else {
        const used = data.channel || rail;
        const note = attachments.length ? `${text ? text + " " : ""}📎 ${attachments.length}` : text;
        setSentMsgs((m) => [...m, { from: "you", text: note, time: "just now", channel: used }]);
        setDraft("");
        setAttachments([]);
        // Honest when WhatsApp wasn't possible and we used the email floor.
        showToast(rail === "whatsapp" && used === "email" ? "Sent as email — not reachable on WhatsApp right now" : "Sent", "success");
      }
    } catch {
      showToast("Couldn't send — try again", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: SF }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 18px 16px", borderBottom: `1px solid ${colors.border}` }}>
        <Avatar initials={person.initials} color={person.color} size={40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text }}>{person.name}</div>
          <div style={{ fontSize: "12px", color: colors.textSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.handle}</div>
        </div>
        <ChannelChip channel={person.channel} windowOpen={person.windowOpen} windowNote={person.windowNote} />
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: colors.surfaceMuted, color: colors.textMuted, fontSize: "16px", cursor: "pointer", flexShrink: 0 }}>×</button>
      </div>

      <div style={{ padding: "14px 18px", background: colors.surfaceMuted, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: "12.5px", color: colors.textMuted, lineHeight: 1.5, marginBottom: "8px" }}>{person.relationship}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {person.signals.map((s, i) => (
            <span key={i} style={{ fontSize: "11px", color: colors.textMuted, background: colors.surface, border: `1px solid ${colors.border}`, padding: "3px 9px", borderRadius: "999px" }}>{s}</span>
          ))}
        </div>
      </div>

      {/* Unified timeline — across channels AND across events */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {thread.map((m, i) => {
          const prev = thread[i - 1];
          const mch = m.channel || person.channel;
          const pch = prev ? prev.channel || person.channel : null;
          const switched = prev && mch !== pch;
          const ch = CHANNELS[mch] || CHANNELS.email;
          const divider = switched ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 4px" }}>
              <div style={{ flex: 1, height: 1, background: colors.border }} />
              <span style={{ fontSize: "10.5px", fontWeight: 600, color: ch.color, display: "inline-flex", alignItems: "center", gap: "4px" }}>
                <span style={{ fontSize: "10px" }}>{ch.glyph}</span> moved to {ch.label}
              </span>
              <div style={{ flex: 1, height: 1, background: colors.border }} />
            </div>
          ) : null;

          if (m.from === "system") {
            return (
              <div key={i}>
                {divider}
                <div style={{ textAlign: "center", fontSize: "11.5px", color: colors.textSubtle, padding: "2px 0" }}>
                  {m.text} · <span style={{ color: colors.textFaded }}>{m.time}</span>
                </div>
              </div>
            );
          }
          const mine = m.from === "you";
          return (
            <div key={i}>
              {divider}
              <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: mine ? colors.accent : colors.surfaceMuted, color: mine ? "#fff" : colors.text, fontSize: "13.5px", lineHeight: 1.45 }}>
                  {m.text}
                </div>
                <span style={{ fontSize: "10.5px", color: colors.textFaded, marginTop: "3px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ color: ch.color, fontWeight: 600 }}>{ch.glyph}</span>{m.time}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{ borderTop: `1px solid ${colors.border}`, padding: "12px 14px" }}>
        {person.needsYou && person.move && !draft && (
          <button onClick={() => setDraft(suggestedDraft(person))} style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "10px", fontSize: "12.5px", color: colors.accent, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, borderRadius: "12px", padding: "10px 12px", cursor: "pointer", lineHeight: 1.4 }}>
            <span style={{ fontWeight: 700 }}>Suggested:</span> {suggestedDraft(person)}
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "9px" }}>
          <span style={{ fontSize: "11px", color: colors.textSubtle, marginRight: "2px" }}>Send on</span>
          {reachable.map((r) => {
            const rc = CHANNELS[r] || CHANNELS.email;
            const isAuto = r === person.channel;
            const on = r === rail;
            return (
              <button key={r} onClick={() => setRail(r)} title={isAuto ? "PullUp's pick" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, color: on ? "#fff" : rc.color, background: on ? rc.color : rc.soft, border: `1px solid ${on ? rc.color : "transparent"}`, padding: "4px 10px", borderRadius: "999px", cursor: "pointer" }}>
                <span style={{ fontSize: "9px", fontWeight: 800 }}>{rc.glyph}</span>{rc.label}
                {isAuto && !on && <span style={{ fontSize: "9px", opacity: 0.8 }}>· pick</span>}
              </button>
            );
          })}
        </div>

        {/* No style picker in 1:1 — a personal message stays plain and human.
            Brand/style lives in the bulk composer, the campaign-ish moment. */}

        {/* Reply-from picker — only when on Instagram with 2+ connected accounts. */}
        {rail === "instagram" && igAccounts.length >= 2 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "9px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "11px", color: colors.textSubtle, marginRight: "2px" }}>From</span>
            {igAccounts.map((a) => {
              const on = a.id === igFrom;
              return (
                <button key={a.id} onClick={() => setIgFrom(a.id)} style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, color: on ? "#fff" : CHANNELS.instagram.color, background: on ? CHANNELS.instagram.color : CHANNELS.instagram.soft, border: `1px solid ${on ? CHANNELS.instagram.color : "transparent"}`, padding: "4px 10px", borderRadius: "999px", cursor: "pointer" }}>
                  {a.label ? `${a.label} · ` : ""}@{a.username || "account"}
                </button>
              );
            })}
          </div>
        )}

        {crossing && (
          <div style={{ fontSize: "11px", color: colors.secondary, background: colors.secondarySoft, border: `1px solid ${colors.secondaryBorder}`, borderRadius: "10px", padding: "8px 11px", marginBottom: "9px", lineHeight: 1.45 }}>
            They last wrote on <strong>{(CHANNELS[lastInboundChannel] || CHANNELS.email).label}</strong>. PullUp will open with:{" "}
            <em style={{ color: colors.text }}>"Replying here on {c.label} to your {(CHANNELS[lastInboundChannel] || CHANNELS.email).label.toLowerCase()} —"</em>
          </div>
        )}

        {/* Attachment chips */}
        {(attachments.length > 0 || uploading) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "9px" }}>
            {attachments.map((a, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "4px 6px 4px 8px", fontSize: "11.5px", color: colors.text, maxWidth: "180px" }}>
                {a.isImage ? <img src={a.url} alt="" style={{ width: 22, height: 22, borderRadius: "5px", objectFit: "cover" }} /> : <Paperclip size={12} style={{ color: colors.textSubtle }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <button onClick={() => setAttachments((arr) => arr.filter((_, k) => k !== i))} style={{ display: "flex", border: "none", background: "transparent", color: colors.textSubtle, cursor: "pointer", padding: 0 }}><X size={13} /></button>
              </span>
            ))}
            {uploading && <span style={{ fontSize: "11.5px", color: colors.textSubtle, alignSelf: "center" }}>Uploading…</span>}
          </div>
        )}

        <input ref={fileRef} type="file" multiple onChange={onAttach} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <button onClick={() => fileRef.current?.click()} title="Attach a file or image" disabled={rail === "instagram"} style={{ width: 38, height: 38, flexShrink: 0, borderRadius: "10px", border: `1px solid ${colors.border}`, background: colors.surface, color: rail !== "instagram" ? colors.textMuted : colors.textFaded, cursor: rail !== "instagram" ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}><Paperclip size={16} /></button>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={rail === "whatsapp" && person.windowOpen === false ? "Window closed — sends as a WhatsApp template" : `Message ${person.name.split(" ")[0]} on ${c.label}…`} rows={2} style={{ flex: 1, resize: "none", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13.5px", fontFamily: SF, color: colors.text, outline: "none" }} />
          <button onClick={handleSend} disabled={(!draft.trim() && !attachments.length) || sending} style={{ padding: "10px 16px", borderRadius: "999px", border: "none", background: (draft.trim() || attachments.length) && !sending ? colors.accent : colors.surfaceMuted, color: (draft.trim() || attachments.length) && !sending ? "#fff" : colors.textFaded, fontWeight: 700, fontSize: "13px", cursor: (draft.trim() || attachments.length) && !sending ? "pointer" : "default", flexShrink: 0, height: "fit-content" }}>{sending ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Bulk panel — same chat surface, one message to many ───────────
// Opens in the same right slot as a single conversation, but instead of one
// thread you see the people you picked, each with the channel PullUp will send
// them on, and one composer. It writes like a normal message — it just goes
// out individually to everyone (logistics one-to-many; the anti-extraction
// line still holds because it's the host's own words, previewed, not faked
// intimacy generated per person).
function BulkPanel({ people, events = [], lensEvent = null, onClose, onClear }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [template, setTemplate] = useState("plain"); // plain | branded | event
  const [eventId, setEventId] = useState(lensEvent?.id || events[0]?.id || null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const move = people[0]?.move;
  const templateLabel = template === "event" ? "Event email" : template === "branded" ? "Branded" : "Plain note";
  // Pre-fill from the shared suggested move (the brain's opener), host edits.
  useEffect(() => { setDraft(move ? suggestedDraft(people[0]) : ""); setTemplate("plain"); setEventId(lensEvent?.id || events[0]?.id || null); setPreview(null); }, [people, move]);

  async function openPreview() {
    setPreview({ html: "", loading: true });
    try {
      const res = await authenticatedFetch("/host/room/message/preview", { method: "POST", body: JSON.stringify({ text: draft, attachments, template, eventId }) });
      const data = await res.json().catch(() => ({}));
      if (data.html) setPreview({ html: data.html, loading: false });
      else { setPreview(null); showToast("Couldn't build preview", "error"); }
    } catch { setPreview(null); showToast("Couldn't build preview", "error"); }
  }

  // Honest channel split. WhatsApp-reachable people get WhatsApp (native text);
  // everyone else gets email (where the design applies); neither = surfaced.
  const sendOn = (p) => ((p.reachable || []).includes("whatsapp") ? "whatsapp" : "email");
  const byChannel = {};
  people.forEach((p) => { const ch = sendOn(p); byChannel[ch] = (byChannel[ch] || 0) + 1; });
  const waCount = people.filter((p) => (p.reachable || []).includes("whatsapp")).length;
  const emCount = people.filter((p) => !(p.reachable || []).includes("whatsapp") && (p.reachable || []).includes("email")).length;
  const noneCount = people.length - waCount - emCount;

  async function onAttach(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) { showToast(`${file.name} is over 10MB`, "error"); continue; }
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        });
        const res = await authenticatedFetch("/host/room/attachment", { method: "POST", body: JSON.stringify({ dataUrl, filename: file.name }) });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.url) setAttachments((a) => [...a, { url: data.url, name: data.name, isImage: data.isImage }]);
        else showToast("Couldn't attach that file", "error");
      } catch { showToast("Couldn't attach that file", "error"); }
    }
    setUploading(false);
  }

  async function handleBulkSend() {
    const text = draft.trim();
    if ((!text && !attachments.length) || sending) return;
    setSending(true);
    try {
      const res = await authenticatedFetch("/host/room/message/bulk", {
        method: "POST",
        body: JSON.stringify({ personIds: people.map((p) => p.id), channel: "whatsapp", text, attachments, template, eventId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showToast("Couldn't send — try again", "error");
      } else {
        const parts = [`Sent to ${data.sent}`];
        if (data.byChannel?.whatsapp) parts.push(`${data.byChannel.whatsapp} on WhatsApp`);
        if (data.noEmail) parts.push(`${data.noEmail} have no email yet`);
        showToast(parts.join(" · "), data.sent ? "success" : "error");
        if (data.sent) onClose?.();
      }
    } catch {
      showToast("Couldn't send — try again", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: SF }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 18px 16px", borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <PullupEyes variant="small" style={{ width: "22px", height: "18px", display: "block" }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text }}>Message {people.length} people</div>
          <div style={{ fontSize: "12px", color: colors.textSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {Object.entries(byChannel).map(([ch, n], i) => (
              <span key={ch}>{i > 0 ? " · " : ""}{n} on {(CHANNELS[ch] || CHANNELS.email).label}</span>
            ))}
          </div>
        </div>
        <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: colors.surfaceMuted, color: colors.textMuted, fontSize: "16px", cursor: "pointer", flexShrink: 0 }}>×</button>
      </div>

      {/* Shared move, if they all share one */}
      {move && (
        <div style={{ padding: "12px 18px", background: colors.surfaceMuted, borderBottom: `1px solid ${colors.border}`, fontSize: "12.5px", color: colors.textMuted }}>
          Same move for everyone: <span style={{ color: colors.text, fontWeight: 600 }}>{move}</span>
        </div>
      )}

      {/* The recipients — each a row with their send channel, like a to-list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "10px 8px" }}>
        {people.map((p) => {
          const c = CHANNELS[sendOn(p)] || CHANNELS.email;
          return (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "9px 10px", borderRadius: "10px" }}>
              <Avatar initials={p.initials} color={p.color} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "13.5px", fontWeight: 600, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: "11.5px", color: colors.textSubtle, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.handle}</div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, color: c.color, background: c.soft, padding: "3px 9px", borderRadius: "999px", flexShrink: 0 }}>
                <span style={{ fontSize: "9px", fontWeight: 800 }}>{c.glyph}</span>{c.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Composer — looks like a normal send; goes to all individually */}
      <div style={{ borderTop: `1px solid ${colors.border}`, padding: "12px 14px" }}>
        {/* Email design — pick a template, preview it (old-CRM style). Applies
            to the email cohort; WhatsApp folks get your message as native text. */}
        <div style={{ marginBottom: "9px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: colors.textSubtle }}>Email design</span>
            <button type="button" onClick={openPreview} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: colors.accent, background: "transparent", border: "none", cursor: "pointer", padding: 0 }}>
              Preview <span style={{ fontSize: 12 }}>⤢</span>
            </button>
          </div>
          <select value={template} onChange={(e) => setTemplate(e.target.value)} style={{ width: "100%", fontSize: 13, fontFamily: SF, color: colors.text, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "9px 11px", cursor: "pointer" }}>
            <option value="plain">Plain note — hand-typed, no styling</option>
            <option value="event">Event email — cover, title, date &amp; button</option>
          </select>
          {template === "event" && (
            events.length ? (
              <select value={eventId || ""} onChange={(e) => setEventId(e.target.value)} style={{ width: "100%", marginTop: 6, fontSize: 13, fontFamily: SF, color: colors.text, background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "9px 11px", cursor: "pointer" }}>
                {events.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
              </select>
            ) : (
              <div style={{ fontSize: 11, color: colors.textSubtle, marginTop: 6 }}>No events to base this on yet.</div>
            )
          )}
        </div>

        {/* Honest channel split — where this actually lands. */}
        <div style={{ fontSize: "11px", color: colors.textMuted, background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 11px", marginBottom: "9px", lineHeight: 1.5 }}>
          Sends to <strong>{emCount}</strong> on email{template !== "plain" ? " (styled)" : ""}
          {waCount ? <> · <strong>{waCount}</strong> on WhatsApp</> : null}
          {noneCount ? <> · <strong>{noneCount}</strong> can’t be reached yet</> : null}.
          {waCount > 0 && template !== "plain" ? (
            <div style={{ marginTop: 4, color: colors.textSubtle }}>WhatsApp folks get your message as text, not the design.</div>
          ) : null}
        </div>
        {/* Attachment chips */}
        {(attachments.length > 0 || uploading) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "9px" }}>
            {attachments.map((a, i) => (
              <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "7px", background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "4px 6px 4px 8px", fontSize: "11.5px", color: colors.text, maxWidth: "180px" }}>
                {a.isImage ? <img src={a.url} alt="" style={{ width: 22, height: 22, borderRadius: "5px", objectFit: "cover" }} /> : <Paperclip size={12} style={{ color: colors.textSubtle }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                <button onClick={() => setAttachments((arr) => arr.filter((_, k) => k !== i))} style={{ display: "flex", border: "none", background: "transparent", color: colors.textSubtle, cursor: "pointer", padding: 0 }}><X size={13} /></button>
              </span>
            ))}
            {uploading && <span style={{ fontSize: "11.5px", color: colors.textSubtle, alignSelf: "center" }}>Uploading…</span>}
          </div>
        )}
        <input ref={fileRef} type="file" multiple onChange={onAttach} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <button onClick={() => fileRef.current?.click()} title="Attach a file or image" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: "10px", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Paperclip size={16} /></button>
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Write to all ${people.length}…`} rows={3} style={{ flex: 1, resize: "none", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13.5px", fontFamily: SF, color: colors.text, outline: "none" }} />
          <button onClick={handleBulkSend} disabled={(!draft.trim() && !attachments.length) || sending} style={{ padding: "10px 16px", borderRadius: "999px", border: "none", background: (draft.trim() || attachments.length) && !sending ? colors.accent : colors.surfaceMuted, color: (draft.trim() || attachments.length) && !sending ? "#fff" : colors.textFaded, fontWeight: 700, fontSize: "13px", cursor: (draft.trim() || attachments.length) && !sending ? "pointer" : "default", flexShrink: 0, height: "fit-content", whiteSpace: "nowrap" }}>
            {sending ? "Sending…" : `Send to ${people.length}`}
          </button>
        </div>
        <button onClick={onClear} style={{ marginTop: "8px", fontSize: "11.5px", color: colors.textSubtle, background: "transparent", border: "none", cursor: "pointer", fontFamily: SF, padding: 0 }}>
          Clear selection
        </button>
      </div>
      {preview && <EmailPreviewModal html={preview.html} loading={preview.loading} label={templateLabel} onClose={() => setPreview(null)} />}
    </div>
  );
}

// The brain's editable opener. For the seeded demo people we have bespoke
// lines; for real people we draft from the suggested move (the host edits it —
// the anti-extraction line: PullUp makes the host's own voice easier, it never
// sends manufactured warmth on its own).
function suggestedDraft(person) {
  const first = (person.name || "there").split(" ")[0];
  const bespoke = {
    p_sara: "Metro's easiest — Medborgarplatsen, 4 min walk. Street parking's a pain on Saturdays. Can't wait to see you both!",
    p_priya: `${first}! So good to see you back — it's been a minute. Saved you a good spot 🙌`,
    p_adam: "Noah's in — bring him! Always good to have you, Adam.",
    p_emma: `${first} — two spots just opened. You're in if you still want it!`,
    p_tobias: `Welcome ${first}! So glad you found us. Anything you want to know before Saturday?`,
    p_lina: `Hey ${first}! Saw you peeking — Vol. 4's shaping up beautifully, would love to have you back. Want me to hold you a spot?`,
    p_nadia: `Same energy, even better view this time. Here's the link — ${first}, would love to have you: pullup.se/e/sunset-vol-4`,
    p_marcus: `Hey ${first}! Doing another rooftop night Saturday — your kind of crowd. Want the details?`,
  };
  if (bespoke[person.id]) return bespoke[person.id];
  // Real person: draft from the move, in the host's hands to edit.
  const m = (person.move || "").toLowerCase();
  if (m.includes("offer")) return `Hey ${first} — a spot just opened up. Want it? 🙌`;
  if (m.includes("reconnect") || m.includes("quiet")) return `Hey ${first}! It's been a minute — would love to have you at the next one.`;
  if (m.includes("come")) return `Hey ${first} — looking forward to having you! Anything you need from me before then?`;
  return `Hey ${first} —`;
}

// ─── Actionable presentations — same data, different UX (learning) ───
//
// CAROUSEL: the Room collapses to ONE big action at a time. A bold hero —
// the person's colour as the canvas, the move as a headline, the brain's
// editable suggested prompt, a single clear CTA — then swipe to the next.
// "Deal with this. Next." The truest expression of PullUp-as-brain handing
// the host one decision at a time.
function ActionCarousel({ people, onOpen }) {
  const acts = people.filter((p) => p.needsYou);
  const [i, setI] = useState(0);
  if (!acts.length) return null;
  const idx = Math.min(i, acts.length - 1);
  const p = acts[idx];
  const draft = suggestedDraft(p);
  const c = CHANNELS[p.channel] || CHANNELS.email;
  const next = () => setI((idx + 1) % acts.length);
  const prev = () => setI((idx - 1 + acts.length) % acts.length);

  return (
    <div>
      {/* One big action — the whole Room, focused */}
      <div
        style={{
          position: "relative",
          borderRadius: "26px",
          overflow: "hidden",
          fontFamily: SF,
          background: `linear-gradient(160deg, ${p.color} 0%, ${p.color}cc 42%, #0a0a0a 130%)`,
          color: "#fff",
          minHeight: "440px",
          display: "flex",
          flexDirection: "column",
          padding: "30px",
          boxShadow: "0 24px 60px rgba(10,10,10,0.18)",
        }}
      >
        {/* top: who + channel */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", fontWeight: 700, flexShrink: 0 }}>
            {p.initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "20px", fontWeight: 750, letterSpacing: "-0.01em" }}>{p.name}</div>
            <div style={{ fontSize: "13px", opacity: 0.85 }}>{p.handle}</div>
          </div>
          <span style={{ fontSize: "11px", fontWeight: 700, background: "rgba(255,255,255,0.2)", padding: "5px 11px", borderRadius: "999px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: "9px", fontWeight: 800 }}>{c.glyph}</span>{c.label}
            {p.windowOpen === true && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff" }} />}
          </span>
        </div>

        {/* middle: the read + the move as headline */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 0" }}>
          <div style={{ fontSize: "13.5px", opacity: 0.9, lineHeight: 1.5, marginBottom: "14px", maxWidth: "90%" }}>{p.relationship}</div>
          <div style={{ fontSize: "30px", fontWeight: 780, letterSpacing: "-0.02em", lineHeight: 1.1 }}>{p.move}</div>
        </div>

        {/* the brain's editable prompt */}
        <div style={{ fontSize: "13.5px", lineHeight: 1.5, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.28)", borderRadius: "16px", padding: "13px 15px", marginBottom: "16px", backdropFilter: "blur(4px)" }}>
          <span style={{ fontWeight: 700, opacity: 0.85 }}>Suggested · </span>{draft}
        </div>

        {/* one clear CTA + skip */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => onOpen(p.id)} style={{ flex: 1, padding: "14px", borderRadius: "999px", border: "none", background: "#fff", color: "#0a0a0a", fontWeight: 750, fontSize: "14px", cursor: "pointer", fontFamily: SF }}>
            Open &amp; send on {c.label}
          </button>
          <button onClick={next} style={{ padding: "14px 20px", borderRadius: "999px", border: "1px solid rgba(255,255,255,0.4)", background: "transparent", color: "#fff", fontWeight: 600, fontSize: "14px", cursor: "pointer", fontFamily: SF }}>Skip</button>
        </div>
      </div>

      {/* progress dots */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", marginTop: "16px" }}>
        <button onClick={prev} style={{ border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: "20px" }}>‹</button>
        <div style={{ display: "flex", gap: "6px" }}>
          {acts.map((_, k) => (
            <span key={k} style={{ width: k === idx ? 18 : 6, height: 6, borderRadius: "999px", background: k === idx ? colors.accent : colors.border, transition: "width 0.2s ease" }} />
          ))}
        </div>
        <button onClick={next} style={{ border: "none", background: "transparent", color: colors.textMuted, cursor: "pointer", fontSize: "20px" }}>›</button>
      </div>
    </div>
  );
}

// LIST (text only): the leanest feed — no avatars, just the action. Fast scan.
function ActionList({ people, onOpen, withImage }) {
  const acts = people.filter((p) => p.needsYou);
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {acts.map((p) => {
        const c = CHANNELS[p.channel] || CHANNELS.email;
        return (
          <button key={p.id} onClick={() => onOpen(p.id)} style={{ display: "flex", alignItems: "center", gap: withImage ? "12px" : "10px", width: "100%", textAlign: "left", padding: "13px 8px", border: "none", borderBottom: `1px solid ${colors.borderFaint}`, background: "transparent", cursor: "pointer", fontFamily: SF }}>
            {withImage
              ? <Avatar initials={p.initials} color={p.color} size={36} />
              : <span style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "14px", fontWeight: 650, color: colors.text }}>{p.name}</span>
                <span style={{ fontSize: "11px", color: c.color, fontWeight: 700 }}>{c.glyph}</span>
              </div>
              <div style={{ fontSize: "12.5px", color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.move}</div>
            </div>
            <span style={{ fontSize: "13px", fontWeight: 600, color: colors.accent, flexShrink: 0 }}>→</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Action inbox — the prioritized "who needs you" triage ──────────
// Urgent (a window's open and someone's actually waiting) floats to the top
// with notification weight; the rest is a calm "worth a nudge" list — clearly a
// log you CAN answer, not a fire. When several people need the same move, PullUp
// recommends doing it in one go, and any rows can be multi-selected for an
// ad-hoc bulk draft. Per the veto, bulk is always a DRAFT the host previews —
// never an auto-send.
function InboxRow({ p, urgent, active, selected, onToggle, onOpen }) {
  const c = CHANNELS[p.channel] || CHANNELS.email;
  // `active` = this person is the one currently open in the left chat panel.
  // Highlight it so the row stays visibly tied to the conversation on screen.
  const bg = active ? colors.accentSoft : selected ? colors.accentSoft : "transparent";
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: "10px", borderBottom: `1px solid ${colors.borderFaint}`, background: bg, borderLeft: `3px solid ${active ? colors.accent : urgent ? colors.accent : "transparent"}`, paddingLeft: (active || urgent) ? "9px" : "12px", transition: "background 0.12s ease" }}>
      {/* select circle — a sibling of the open-button so buttons never nest */}
      <button onClick={onToggle} aria-label={selected ? "Deselect" : "Select"} style={{ alignSelf: "center", width: 18, height: 18, borderRadius: "50%", border: `1.5px solid ${selected ? colors.accent : colors.border}`, background: selected ? colors.accent : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 0, fontFamily: SF }}>
        {selected && <span style={{ color: "#fff", fontSize: "11px", lineHeight: 1 }}>✓</span>}
      </button>
      <button onClick={onOpen} style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "11px", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "13px 0", fontFamily: SF }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "center", gap: "7px" }}>
            <span style={{ fontSize: "14px", fontWeight: 650, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
            <span style={{ fontSize: "10.5px", fontWeight: 800, color: c.color }}>{c.glyph}</span>
            {urgent && (
              <span style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: colors.accent, background: colors.accentSoft, padding: "1px 6px", borderRadius: "999px" }}>
                {p.windowOpen ? "waiting" : "now"}
              </span>
            )}
          </span>
          <span style={{ display: "block", fontSize: "12.5px", color: colors.textMuted, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.move}</span>
        </span>
        <span style={{ fontSize: "15px", fontWeight: 600, color: colors.accent, flexShrink: 0 }}>→</span>
      </button>
    </div>
  );
}

function InboxSection({ label, count, accent, children }) {
  return (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: accent ? colors.accent : colors.textSubtle }}>{label}</span>
        <span style={{ fontSize: "10.5px", fontWeight: 800, color: accent ? "#fff" : colors.textMuted, background: accent ? colors.accent : colors.surfaceMuted, minWidth: 18, textAlign: "center", padding: "1px 6px", borderRadius: "999px" }}>{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

function BulkRecCard({ group, channel, onSelect, onDraftAll }) {
  const c = CHANNELS[channel] || CHANNELS.email;
  const n = group.length;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", marginBottom: "12px", borderRadius: "14px", border: `1px solid ${colors.accentBorder}`, background: colors.accentSoft }}>
      <PullupEyes variant="small" style={{ width: "24px", height: "20px", display: "block", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13.5px", fontWeight: 650, color: colors.text }}>{n} people, same move</div>
        <div style={{ fontSize: "12.5px", color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>“{group[0].move}” — handle all {n} on {c.label} at once.</div>
      </div>
      <button onClick={onSelect} style={{ fontSize: "12px", fontWeight: 600, color: colors.textMuted, background: "transparent", border: "none", cursor: "pointer", flexShrink: 0, fontFamily: SF }}>Select</button>
      <button onClick={onDraftAll} style={{ fontSize: "12.5px", fontWeight: 700, color: "#fff", background: colors.accent, border: "none", borderRadius: "999px", padding: "7px 14px", cursor: "pointer", flexShrink: 0, fontFamily: SF }}>Draft to all {n}</button>
    </div>
  );
}

function BulkBar({ n, onClear, onDraftAll }) {
  return (
    <div style={{ position: "sticky", bottom: "12px", display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px 10px 18px", marginTop: "14px", borderRadius: "999px", background: colors.text, color: "#fff", boxShadow: "0 8px 30px rgba(10,10,10,0.18)" }}>
      <span style={{ fontSize: "13px", fontWeight: 600 }}>{n} selected</span>
      <button onClick={onClear} style={{ fontSize: "12.5px", color: "rgba(255,255,255,0.7)", background: "transparent", border: "none", cursor: "pointer", fontFamily: SF }}>Clear</button>
      <button onClick={onDraftAll} style={{ marginLeft: "auto", fontSize: "12.5px", fontWeight: 700, color: colors.text, background: "#fff", border: "none", borderRadius: "999px", padding: "7px 16px", cursor: "pointer", fontFamily: SF }}>Draft to all →</button>
    </div>
  );
}

function ActionInbox({ people, onOpen, onBulk, activeId }) {
  const [sel, setSel] = useState(() => new Set());
  const acts = people.filter((p) => p.needsYou);
  const toggle = (id) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const clear = () => setSel(new Set());

  // Urgent = a channel window is open and they're waiting on a reply. Everyone
  // else is a calm, answer-when-you-can nudge.
  const urgent = acts.filter((p) => p.windowOpen === true);
  const rest = acts.filter((p) => p.windowOpen !== true);

  // Recommend a bulk move when ≥2 people need the same thing.
  const byMove = {};
  acts.forEach((p) => { (byMove[p.move] = byMove[p.move] || []).push(p); });
  const recs = Object.values(byMove).filter((g) => g.length >= 2).sort((a, b) => b.length - a.length);

  // Open the bulk compose panel (right slot) with the chosen people.
  const draftAll = (ids) => {
    const chosen = acts.filter((p) => ids.includes(p.id));
    if (!chosen.length) return;
    onBulk?.(chosen);
    clear();
  };

  const allSelected = acts.length > 0 && acts.every((p) => sel.has(p.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(acts.map((p) => p.id)));

  if (!acts.length) {
    return <div style={{ padding: "20px 4px", color: colors.textSubtle, fontSize: "13.5px", fontFamily: SF }}>You're all caught up — nobody's waiting on you right now.</div>;
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: "8px" }}>
        <button onClick={toggleAll} style={{ fontSize: "11.5px", fontWeight: 600, color: colors.accent, background: "transparent", border: "none", cursor: "pointer", fontFamily: SF, padding: 0 }}>
          {allSelected ? "Clear selection" : `Select all ${acts.length}`}
        </button>
      </div>
      {recs.map((g, i) => (
        <BulkRecCard key={i} group={g} channel={g[0].channel} onSelect={() => setSel(new Set(g.map((p) => p.id)))} onDraftAll={() => draftAll(g.map((p) => p.id))} />
      ))}
      {urgent.length > 0 && (
        <InboxSection label="Needs you now" count={urgent.length} accent>
          {urgent.map((p) => (
            <InboxRow key={p.id} p={p} urgent active={p.id === activeId} selected={sel.has(p.id)} onToggle={() => toggle(p.id)} onOpen={() => onOpen(p.id)} />
          ))}
        </InboxSection>
      )}
      {rest.length > 0 && (
        <InboxSection label="Who needs you" count={rest.length}>
          {rest.map((p) => (
            <InboxRow key={p.id} p={p} active={p.id === activeId} selected={sel.has(p.id)} onToggle={() => toggle(p.id)} onOpen={() => onOpen(p.id)} />
          ))}
        </InboxSection>
      )}
      {sel.size > 0 && <BulkBar n={sel.size} onClear={clear} onDraftAll={() => draftAll([...sel])} />}
    </div>
  );
}

// ─── Profile masthead — the host IS the page ────────────────────────
// The social-dashboard framing (Felix, 2026-06-01): The Room is the creator's
// profile. Your face anchors it, "The Room" stays the title, and the stat line
// is your follower-count slot — "N in your world" plus a notification badge on
// the people who need you. Everything below (events, who-needs-you) reads as
// yours because of the face up here.
function MastheadAvatar({ host, loading }) {
  const size = 60;
  if (loading) {
    return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, background: colors.surfaceMuted, animation: SHIMMER, backgroundImage: `linear-gradient(90deg, ${colors.surfaceMuted} 25%, ${colors.borderFaint} 37%, ${colors.surfaceMuted} 63%)`, backgroundSize: "400% 100%" }} />;
  }
  if (host.avatar) {
    return <img src={host.avatar} alt={host.name || "You"} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, border: `1px solid ${colors.border}` }} onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />;
  }
  const name = (host.name || "").trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    const inits = (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
    return <div style={{ width: size, height: size, borderRadius: "50%", background: colors.text, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 700, flexShrink: 0, fontFamily: SF }}>{inits}</div>;
  }
  // No name, no photo — the brand mark, never a blank circle.
  return <div style={{ width: size, height: size, borderRadius: "50%", background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><PullupEyes variant="small" style={{ width: "30px", height: "24px", display: "block" }} /></div>;
}

function ProfileMasthead({ host, loading, lensEvent, needsCount }) {
  const h = host || {};
  const identity = [(h.handle || "").trim(), (h.role || "").trim()].filter(Boolean).join("  ·  ");
  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "22px", fontFamily: SF }}>
      <MastheadAvatar host={h} loading={loading} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: "26px", fontWeight: 750, color: colors.text, margin: "0 0 4px", letterSpacing: "-0.02em" }}>
          The Room
        </h1>
        {/* The stat line — your follower-count slot. "Need you" wears a badge. */}
        <div style={{ fontSize: "13.5px", color: colors.textMuted, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {loading ? <Bar w="180px" h={13} />
            : lensEvent ? <span>Focused on <span style={{ color: colors.text, fontWeight: 600 }}>{lensEvent.title}</span></span>
            : <span><span style={{ color: colors.text, fontWeight: 700 }}>{h.peopleCount ?? 0}</span> people in your world</span>}
          {!loading && needsCount > 0 && (
            <>
              <span style={{ color: colors.textFaded }}>·</span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
                <span style={{ minWidth: 19, height: 19, padding: "0 5px", borderRadius: "999px", background: colors.accent, color: "#fff", fontSize: "11px", fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 3px ${colors.accentSoft}`, lineHeight: 1 }}>{needsCount}</span>
                <span style={{ color: colors.accent, fontWeight: 600 }}>need you</span>
              </span>
            </>
          )}
        </div>
        {/* Identity — handle + role, so it's unmistakably YOUR room. */}
        {loading ? (
          <Bar w="140px" h={11} style={{ marginTop: "7px" }} />
        ) : identity ? (
          <div style={{ fontSize: "12.5px", color: colors.textSubtle, marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{identity}</div>
        ) : null}
      </div>
    </div>
  );
}

// ─── The global Room ────────────────────────────────────────────────
export default function RoomPage() {
  const navigate = useNavigate();
  const { clearEventNav } = useEventNav();
  const [selectedId, setSelectedId] = useState(null);
  const [lensEventId, setLensEventId] = useState(null); // event-lens over the global Room
  const [viewMode, setViewMode] = useState("carousel"); // 'carousel' | 'list' | 'dashboard' — same actionables, 3 UX to learn from
  const [bulkPeople, setBulkPeople] = useState(null); // when set, the right slot shows the bulk-compose panel
  const [query, setQuery] = useState(""); // people search across the whole world

  // Live Room from the spine (/host/room). Falls back to fixtures only if the
  // fetch fails, so the prototype never goes blank while iterating.
  const [room, setRoom] = useState(null);
  const [loadError, setLoadError] = useState(false);
  useEffect(() => {
    clearEventNav?.();
    let alive = true;
    authenticatedFetch("/host/room")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("room fetch failed"))))
      .then((data) => { if (alive) setRoom(data); })
      .catch(() => { if (alive) setLoadError(true); });
    return () => { alive = false; };
  }, [clearEventNav]);

  // Three states, no mock-data flash:
  //   loading  → render skeletons (never fixtures)
  //   loaded   → real data
  //   error    → fixtures as a last-resort so the page isn't blank
  const loading = !room && !loadError;
  const HOST = room?.host || (loadError ? HOST_FIXTURE : { peopleCount: 0 });
  const EVENTS = room?.events || (loadError ? EVENTS_FIXTURE : []);
  const SIGNALS = room?.signals || (loadError ? SIGNALS_FIXTURE : []);
  const MOMENTS = room?.moments || [];
  const PEOPLE = room?.people || (loadError ? PEOPLE_FIXTURE : []);

  const lensEvent = EVENTS.find((e) => e.id === lensEventId) || null;

  // Apply the event lens, then rank: who-needs-you first, then warmth.
  const ranked = useMemo(() => {
    let list = PEOPLE;
    if (lensEventId) {
      // Focus the global Room on one event: people connected to it, OR
      // suggestions that match it (the "could invite" crowd).
      list = PEOPLE.filter((p) => (p.events || []).includes(lensEventId) || p.suggestion);
    }
    return [...list].sort((a, b) => {
      if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
      return b.warmth - a.warmth;
    });
  }, [lensEventId, PEOPLE]);

  const visibleSignals = useMemo(() => {
    if (!lensEventId) return SIGNALS;
    return SIGNALS.filter((s) => s.eventId === lensEventId || (s.personId && ranked.some((p) => p.id === s.personId)));
  }, [lensEventId, ranked, SIGNALS]);

  const selected = PEOPLE.find((p) => p.id === selectedId) || null;
  const needsCount = ranked.filter((p) => p.needsYou).length;

  // People search — find anyone in the whole world by name / handle / how you
  // know them. Independent of the event lens; warmest first.
  const q = query.trim().toLowerCase();
  const searchResults = useMemo(() => {
    if (!q) return null;
    return PEOPLE.filter((p) =>
      (p.name || "").toLowerCase().includes(q) ||
      (p.handle || "").toLowerCase().includes(q) ||
      (p.relationship || "").toLowerCase().includes(q),
    ).sort((a, b) => (b.warmth || 0) - (a.warmth || 0));
  }, [q, PEOPLE]);

  return (
    <div style={{ display: "flex", height: "100vh", paddingTop: "58px", boxSizing: "border-box" }}>
      <style>{`@keyframes roomShimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } } @keyframes roomPanelDrop { 0% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 1; transform: translateY(0); } }`}</style>

      <div style={{ flex: "1 1 0", overflowY: "auto", minWidth: 0 }}>
        <div style={{ maxWidth: "740px", margin: "0 auto", padding: "28px 20px 60px" }}>
          {/* The profile masthead — your face anchors the Room. */}
          <ProfileMasthead host={HOST} loading={loading} lensEvent={lensEvent} needsCount={needsCount} />

          {/* Make-it-yours — fills the gaps (photo, bio, Instagram, brief) and
              patches the masthead live as they're completed. Self-hides when
              done or dismissed. */}
          <ProfileSetup onHostPatch={(patch) => setRoom((r) => (r ? { ...r, host: { ...r.host, ...patch } } : r))} />

          {/* Looking back — the legacy layer. The world they built, read back to
              them. Warmth, not actions; only shows when there's a real moment. */}
          {!loading && (
            <LookingBack
              moments={MOMENTS}
              onOpenPerson={(id) => { setBulkPeople(null); setSelectedId(id); }}
              onCreate={() => navigate("/create")}
            />
          )}

          {/* The events banner — your content, up top. While loading, skeleton
              posters stand in (no mock-data flash). */}
          {loading ? (
            <EventsBannerSkeleton />
          ) : (
            <EventsBanner
              events={EVENTS}
              people={PEOPLE}
              lensEventId={lensEventId}
              onOpenEvent={(id) => navigate(`/app/events/${id}/manage`)}
              onSubpage={(id, sub) => navigate(`/app/events/${id}/${sub}`)}
              onCreate={() => navigate("/create")}
              onFocus={(id) => setLensEventId((cur) => (cur === id ? null : id))}
              onMessageAll={(eventId) => {
                const evp = PEOPLE.filter((p) => (p.events || []).includes(eventId));
                if (!evp.length) return;
                setSelectedId(null);
                setBulkPeople(evp);
              }}
              onDeleted={(id) => setRoom((r) => (r ? { ...r, events: r.events.filter((e) => e.id !== id) } : r))}
            />
          )}

          {/* Notifications now live in the top-bar bell (ambient facts), not in
              the Room body. The Room is actionables-only. */}

          {/* The filter bar — the ONE clear signal of "you are now working on
              this event." Replaces the vague 'Focus here'. Only the actionables
              below are scoped. */}
          {!loading && lensEvent && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", padding: "10px 14px", borderRadius: "12px", background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, fontFamily: SF }}>
              <span style={{ fontSize: "13px", color: colors.text }}>
                Showing who needs you for <strong>{lensEvent.title}</strong>
                <span style={{ color: colors.textMuted }}> · {needsCount} {needsCount === 1 ? "person" : "people"}</span>
              </span>
              <button onClick={() => setLensEventId(null)} style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: 600, color: colors.accent, background: "#fff", border: `1px solid ${colors.accentBorder}`, borderRadius: "999px", padding: "5px 12px", cursor: "pointer", fontFamily: SF }}>
                ✕ Show everyone
              </button>
            </div>
          )}

          {/* Search the whole world. When there's a query, the body becomes
              results (everyone, not just actionables); empty → normal Room. */}
          {!loading && (
            <div style={{ position: "relative", marginBottom: "16px" }}>
              <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: colors.textSubtle, pointerEvents: "none" }}>
                <Search size={16} />
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your people…"
                style={{ width: "100%", boxSizing: "border-box", padding: "11px 38px 11px 40px", borderRadius: "12px", border: `1px solid ${colors.border}`, background: colors.surface, fontSize: "14px", fontFamily: SF, color: colors.text, outline: "none" }}
              />
              {query && (
                <button onClick={() => setQuery("")} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", width: 24, height: 24, borderRadius: "50%", border: "none", background: colors.surfaceMuted, color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <X size={13} />
                </button>
              )}
            </div>
          )}

          {/* The Room body is ALWAYS the actionables — opening someone just
              slides the chat in on the right, it never replaces this list. The
              open person is highlighted in place. */}
          {loading ? (
            <ActionsSkeleton />
          ) : searchResults ? (
            searchResults.length ? (
              <div>
                <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle, marginBottom: "10px" }}>
                  {searchResults.length} {searchResults.length === 1 ? "person" : "people"}
                </div>
                {searchResults.map((p) => (
                  <PersonCard key={p.id} person={p} events={EVENTS} active={p.id === selectedId} onClick={() => { setBulkPeople(null); setSelectedId(p.id); }} />
                ))}
              </div>
            ) : (
              <div style={{ padding: "20px 4px", color: colors.textSubtle, fontSize: "13.5px", fontFamily: SF }}>No one in your world matches “{query}”.</div>
            )
          ) : (
            <ActionInbox
              people={ranked}
              onOpen={(id) => { setBulkPeople(null); setSelectedId(id); }}
              onBulk={(chosen) => { setSelectedId(null); setBulkPeople(chosen); }}
              activeId={selectedId}
            />
          )}
        </div>
      </div>

      {/* Right slot — FLOATS over the empty right space (fixed to the edge)
          instead of being a flex sibling, so opening it doesn't shrink the body
          and shove the centered content leftward. One panel at a time: a single
          conversation, or the bulk compose view. */}
      {(selected || bulkPeople) && (
        <div style={{ position: "fixed", top: "58px", right: 0, bottom: 0, width: "420px", borderLeft: `1px solid ${colors.border}`, background: colors.surface, boxShadow: "-12px 0 40px rgba(10,10,10,0.08)", zIndex: 30 }}>
          {bulkPeople ? (
            <BulkPanel people={bulkPeople} events={EVENTS} lensEvent={lensEvent} onClose={() => setBulkPeople(null)} onClear={() => setBulkPeople(null)} />
          ) : (
            <ThreadPanel person={selected} onClose={() => setSelectedId(null)} igAccounts={HOST.igAccounts || []} />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Skeletons — shown while the real Room loads, so no mock-data flash ──
const SHIMMER = "roomShimmer 1.2s ease-in-out infinite";
function Bar({ w = "100%", h = 12, r = 6, style = {} }) {
  return <div style={{ width: w, height: h, borderRadius: r, background: `linear-gradient(90deg, ${colors.surfaceMuted} 25%, ${colors.borderFaint} 37%, ${colors.surfaceMuted} 63%)`, backgroundSize: "400% 100%", animation: SHIMMER, ...style }} />;
}

function EventsBannerSkeleton() {
  return (
    <div style={{ marginBottom: "26px" }}>
      <Bar w="90px" h={11} style={{ marginBottom: "12px" }} />
      <div style={{ display: "flex", gap: "12px", overflow: "hidden" }}>
        {/* create tile placeholder */}
        <div style={{ width: 150, flexShrink: 0, height: 170, borderRadius: "16px", background: colors.surfaceMuted, animation: SHIMMER, backgroundImage: `linear-gradient(90deg, ${colors.surfaceMuted} 25%, ${colors.borderFaint} 37%, ${colors.surfaceMuted} 63%)`, backgroundSize: "400% 100%" }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 172, flexShrink: 0, borderRadius: "16px", border: `1px solid ${colors.border}`, overflow: "hidden", background: colors.surface }}>
            <div style={{ height: 92, background: colors.surfaceMuted, animation: SHIMMER, backgroundImage: `linear-gradient(90deg, ${colors.surfaceMuted} 25%, ${colors.borderFaint} 37%, ${colors.surfaceMuted} 63%)`, backgroundSize: "400% 100%" }} />
            <div style={{ padding: "11px 12px" }}>
              <Bar w="80%" h={12} style={{ marginBottom: "8px" }} />
              <Bar w="50%" h={10} style={{ marginBottom: "8px" }} />
              <Bar w="100%" h={4} r={999} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionsSkeleton() {
  return (
    <div>
      <Bar w="120px" h={11} style={{ marginBottom: "18px" }} />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ display: "flex", gap: "14px", padding: "16px", borderRadius: "16px", border: `1px solid ${colors.border}`, background: colors.surface, marginBottom: "10px" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0, background: colors.surfaceMuted, animation: SHIMMER, backgroundImage: `linear-gradient(90deg, ${colors.surfaceMuted} 25%, ${colors.borderFaint} 37%, ${colors.surfaceMuted} 63%)`, backgroundSize: "400% 100%" }} />
          <div style={{ flex: 1, paddingTop: "3px" }}>
            <Bar w="40%" h={13} style={{ marginBottom: "9px" }} />
            <Bar w="85%" h={11} style={{ marginBottom: "7px" }} />
            <Bar w="30%" h={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Events banner — your content, held at the top ──────────────────
//
// Events are content (north star): you make them, then drop down into the
// actionables below. So they live as a compact poster strip up top. Each
// poster opens the event page; its actions stay FOLDED until you want them
// (the banner shouldn't shout). A create tile is always the last card.
function EventsBanner({ events, people = [], lensEventId, onOpenEvent, onSubpage, onCreate, onFocus, onMessageAll, onDeleted }) {
  const [showDrafts, setShowDrafts] = useState(false);
  // One unified panel opens below the strip when you tap a card. It holds the
  // SAME action bar for every event (Manage · Team · VIP · Share · delete) so
  // nothing behaves inconsistently — only "Manage" navigates; the rest swap
  // content inline. { eventId, tab } | null.
  const [panel, setPanel] = useState(null);
  const panelEvent = panel ? events.find((e) => e.id === panel.eventId) : null;
  const openPanel = (id) => setPanel((cur) => (cur && cur.eventId === id ? null : { eventId: id, tab: null }));

  // Connector: a beak under the strip that points at the OPEN card, so the
  // panel reads as having dropped out of that specific event — not a detached
  // box. We measure the selected card's centre relative to the banner and keep
  // it in sync as the strip scrolls or the window resizes.
  const stripRef = useRef(null);
  const rootRef = useRef(null);
  const cardRefs = useRef({});
  const [arrowLeft, setArrowLeft] = useState(null);
  useLayoutEffect(() => {
    if (!panel) { setArrowLeft(null); return; }
    const measure = () => {
      const card = cardRefs.current[panel.eventId];
      const root = rootRef.current;
      if (!card || !root) return;
      const cr = card.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      const center = cr.left + cr.width / 2 - rr.left;
      setArrowLeft(Math.max(30, Math.min(rr.width - 30, center)));
    };
    measure();
    const strip = stripRef.current;
    window.addEventListener("resize", measure);
    strip?.addEventListener("scroll", measure, { passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      strip?.removeEventListener("scroll", measure);
    };
  }, [panel]);

  const drafts = events.filter((e) => e.status === "draft");
  const published = events.filter((e) => e.status !== "draft");
  const shown = showDrafts ? [...drafts, ...published] : published;

  return (
    <div ref={rootRef} style={{ marginBottom: "26px", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle }}>
          Your events
        </span>
        {drafts.length > 0 && (
          <button onClick={() => setShowDrafts((v) => !v)} style={{ fontSize: "11px", fontWeight: 600, color: showDrafts ? colors.accent : colors.textSubtle, background: "transparent", border: "none", cursor: "pointer", fontFamily: SF, padding: 0 }}>
            {showDrafts ? "Hide drafts" : `Drafts (${drafts.length})`}
          </button>
        )}
        {lensEventId && (
          <button onClick={() => onFocus(lensEventId)} style={{ marginLeft: "auto", fontSize: "11px", fontWeight: 600, color: colors.accent, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, borderRadius: "999px", padding: "3px 10px", cursor: "pointer", fontFamily: SF }}>
            Clear focus
          </button>
        )}
      </div>
      <div ref={stripRef} style={{ display: "flex", gap: "12px", overflowX: "auto", alignItems: "flex-start", paddingBottom: "6px", scrollbarWidth: "thin" }}>
        {/* Create event leads — the primary, always-available action. */}
        <CreateTile onClick={onCreate} />
        {shown.map((e) => (
          <EventPosterCard
            key={e.id}
            event={e}
            focused={lensEventId === e.id}
            selected={panel?.eventId === e.id}
            onSelect={() => openPanel(e.id)}
            innerRef={(el) => { if (el) cardRefs.current[e.id] = el; else delete cardRefs.current[e.id]; }}
          />
        ))}
        {!shown.length && (
          <div style={{ display: "flex", alignItems: "center", color: colors.textSubtle, fontSize: "13px", fontFamily: SF, padding: "0 8px" }}>
            No published events yet — make your first one.
          </div>
        )}
      </div>

      {/* Unified event panel — one consistent action bar for every event. */}
      {panel && panelEvent && (
        <EventActionPanel
          event={panelEvent}
          arrowLeft={arrowLeft}
          tab={panel.tab}
          onTab={(tab) => setPanel((cur) => ({ ...cur, tab: cur.tab === tab ? null : tab }))}
          onClose={() => setPanel(null)}
          focused={lensEventId === panelEvent.id}
          guestCount={people.filter((p) => (p.events || []).includes(panelEvent.id)).length}
          onManage={() => onOpenEvent(panelEvent.id)}
          onFocus={() => onFocus(panelEvent.id)}
          onMessageAll={() => onMessageAll?.(panelEvent.id)}
          onDeleted={() => { setPanel(null); onDeleted?.(panelEvent.id); }}
        />
      )}
    </div>
  );
}

// The one panel — same bar for every event. Manage navigates; Team / VIP /
// Share swap content inline here; Focus drops the event as a lens; delete
// confirms inline. This is what removes the "some jump, some pop" confusion.
function EventActionPanel({ event, arrowLeft, tab, onTab, onClose, focused, guestCount = 0, onManage, onFocus, onMessageAll, onDeleted }) {
  const { showToast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [copied, setCopied] = useState(null);
  const isPast = event.status === "past";
  // Banner identity — mirrors the poster card so the panel wears the event.
  const live = event.status === "live";
  const isDraft = event.status === "draft";
  const banner = event.poster || gradientFor(event.id);
  const pillBg = isDraft ? "rgba(180,83,9,0.9)" : live ? "rgba(22,163,74,0.9)" : "rgba(0,0,0,0.5)";
  const pillLabel = isDraft ? "Draft" : live ? "Live" : "Past";

  const shareChannels = [
    { key: "instagram", label: "Instagram" }, { key: "tiktok", label: "TikTok" },
    { key: "facebook", label: "Facebook" }, { key: "twitter", label: "X" },
    { key: "linkedin", label: "LinkedIn" }, { key: "direct", label: "Direct link" },
  ];
  function copyLink(source) {
    const base = `${window.location.origin}/e/${event.slug}`;
    let url = base;
    if (source !== "direct" && event.slug) {
      const u = new URL(base);
      u.searchParams.set("utm_source", source);
      u.searchParams.set("utm_medium", "social");
      u.searchParams.set("utm_campaign", event.slug);
      url = u.toString();
    }
    navigator.clipboard.writeText(url);
    setCopied(source);
    showToast("Link copied!");
    setTimeout(() => setCopied(null), 2000);
  }
  async function doDelete() {
    setDeleting(true);
    try {
      const res = await authenticatedFetch(`/host/events/${event.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.message || "Could not delete event", "error"); setDeleting(false); return; }
      showToast("Event deleted", "success");
      onDeleted?.();
    } catch { showToast("Could not delete event", "error"); setDeleting(false); }
  }

  // The bar — mirrors the old dashboard: Manage (filled, the one nav) then the
  // inline tabs, a focus toggle, and delete at the end.
  const Tab = ({ id, label, jump }) => (
    <button
      onClick={() => onTab(id)}
      style={{
        display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600,
        fontFamily: SF, padding: "7px 14px", borderRadius: "999px", cursor: "pointer",
        border: `1px solid ${tab === id ? colors.text : colors.border}`,
        background: tab === id ? colors.text : colors.surface,
        color: tab === id ? "#fff" : colors.textMuted, whiteSpace: "nowrap",
      }}
    >
      {label}{jump ? " ↗" : ""}
    </button>
  );

  return (
    <div style={{ position: "relative", marginTop: "12px", fontFamily: SF }}>
      {/* The beak — points up at the open card, so the panel reads as having
          dropped out of THAT event, not floated in detached. */}
      {arrowLeft != null && (
        <>
          <span style={{ position: "absolute", top: -8, left: arrowLeft, transform: "translateX(-50%)", width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: `9px solid ${colors.accent}`, zIndex: 2 }} />
        </>
      )}

      <div style={{ border: `1px solid ${colors.accentBorder}`, borderTop: `3px solid ${colors.accent}`, borderRadius: "16px", background: colors.surface, overflow: "hidden", boxShadow: "0 14px 40px rgba(10,10,10,0.13)", animation: "roomPanelDrop 0.18s ease-out" }}>
        {/* Cover banner — the panel wears the event's poster so it's unmistakably
            THIS event, expanded. */}
        <div style={{ position: "relative", height: 78, background: banner, overflow: "hidden" }}>
          {event.coverImage && (
            <img src={event.coverImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
          )}
          <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.12) 42%, rgba(0,0,0,0.74) 100%)" }} />
          <div style={{ position: "absolute", top: 10, left: 13, display: "flex", alignItems: "center", gap: "9px" }}>
            <span style={{ fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: pillBg, padding: "3px 8px", borderRadius: "999px", backdropFilter: "blur(2px)" }}>{pillLabel}</span>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.95)", textShadow: "0 1px 6px rgba(0,0,0,0.5)" }}>{event.when}</span>
          </div>
          <button onClick={onClose} style={{ position: "absolute", top: 9, right: 10, width: 26, height: 26, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.4)", color: "#fff", fontSize: "15px", cursor: "pointer", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
          <div style={{ position: "absolute", left: 14, right: 14, bottom: 9, fontSize: "15.5px", fontWeight: 750, color: "#fff", letterSpacing: "-0.01em", textShadow: "0 1px 8px rgba(0,0,0,0.55)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
        </div>

        {/* Body — the action bar + any inline tab content. */}
        <div style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: tab ? "16px" : 0 }}>
        <button onClick={onManage} style={{ fontSize: "12.5px", fontWeight: 700, fontFamily: SF, padding: "7px 16px", borderRadius: "999px", border: "none", background: colors.accent, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>
          Manage ↗
        </button>
        {guestCount > 0 && (
          <button onClick={onMessageAll} title={`Email everyone tied to ${event.title}`} style={{ fontSize: "12.5px", fontWeight: 600, fontFamily: SF, padding: "7px 14px", borderRadius: "999px", cursor: "pointer", border: `1px solid ${colors.accentBorder}`, background: colors.accentSoft, color: colors.accent, whiteSpace: "nowrap" }}>
            Message all {guestCount}
          </button>
        )}
        <div style={{ width: 1, height: 20, background: colors.border, margin: "0 2px" }} />
        <Tab id="team" label="Team" />
        {!isPast && <Tab id="vip" label="VIP" />}
        <Tab id="share" label="Share & Track" />
        <button onClick={onFocus} title="Show only the people who need you for this event" style={{ fontSize: "12.5px", fontWeight: 600, fontFamily: SF, padding: "7px 14px", borderRadius: "999px", cursor: "pointer", border: `1px solid ${focused ? colors.accent : colors.border}`, background: focused ? colors.accent : colors.surface, color: focused ? "#fff" : colors.textMuted, whiteSpace: "nowrap" }}>
          {focused ? "✓ Filtering below" : "Filter people below"}
        </button>
        <div style={{ width: 1, height: 20, background: colors.border, margin: "0 2px" }} />
        <button onClick={() => setConfirmDelete(true)} title="Delete event" style={{ width: 32, height: 32, borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.danger, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Trash2 size={14} />
        </button>
      </div>

      {/* Inline content for the selected tab */}
      {tab === "team" && (
        <EventHostsSection eventId={event.id} canManageHosts compact />
      )}
      {tab === "vip" && (
        <VipInviteSection event={event} showToast={showToast} compact />
      )}
      {tab === "share" && (
        <div>
          <div style={{ fontSize: "11.5px", color: colors.textFaded, marginBottom: "10px" }}>
            Add these to your stories, bios, and posts — then check Insights to see which channels drive traffic.
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {shareChannels.map((ch) => (
              <button key={ch.key} onClick={() => copyLink(ch.key)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "8px", border: `1px solid ${copied === ch.key ? colors.successRgba : colors.border}`, background: copied === ch.key ? colors.successRgba : colors.surface, cursor: "pointer", fontSize: "12px", fontWeight: 500, color: copied === ch.key ? colors.success : colors.textMuted, fontFamily: SF }}>
                {copied === ch.key ? <Check size={14} style={{ color: colors.success }} /> : <Link2 size={14} />}
                {copied === ch.key ? "Copied!" : ch.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div style={{ marginTop: tab ? "14px" : "14px", padding: "14px 16px", borderRadius: "12px", border: `1px solid ${colors.danger}`, background: colors.dangerRgba }}>
          <div style={{ fontSize: "13px", fontWeight: 600, color: colors.text, marginBottom: "10px" }}>
            Delete "{event.title}"? This can't be undone.
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button disabled={deleting} onClick={doDelete} style={{ padding: "8px 16px", borderRadius: "999px", border: "none", background: colors.danger, color: "#fff", fontWeight: 700, fontSize: "12.5px", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1, fontFamily: SF }}>
              {deleting ? "Deleting…" : "Delete event"}
            </button>
            <button onClick={() => setConfirmDelete(false)} style={{ padding: "8px 16px", borderRadius: "999px", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, fontWeight: 600, fontSize: "12.5px", cursor: "pointer", fontFamily: SF }}>
              Cancel
            </button>
          </div>
        </div>
      )}
        </div>{/* /body */}
      </div>{/* /card */}
    </div>
  );
}

// Deterministic gradient fallback for events with no cover image, so a blank
// poster never shows. Keyed off the event id.
const POSTER_GRADIENTS = [
  "linear-gradient(150deg, #ff8a4c 0%, #ec178f 62%, #7b2ff7 120%)",
  "linear-gradient(150deg, #fbbf24 0%, #f97316 60%, #b91c1c 120%)",
  "linear-gradient(150deg, #f9a8d4 0%, #c084fc 70%, #6366f1 120%)",
  "linear-gradient(150deg, #5eead4 0%, #38bdf8 60%, #6366f1 120%)",
  "linear-gradient(150deg, #a3e635 0%, #14b8a6 60%, #0ea5e9 120%)",
];
function gradientFor(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return POSTER_GRADIENTS[h % POSTER_GRADIENTS.length];
}

// A poster card. The WHOLE card is one button — tapping it selects the event
// and opens the unified action panel below the strip. No per-card folding
// actions anymore (that's what caused the inconsistent behaviour).
function EventPosterCard({ event, focused, selected, onSelect, innerRef }) {
  const live = event.status === "live";
  const isDraft = event.status === "draft";
  const pct = event.capacity ? Math.min(1, event.comingCount / event.capacity) : 0;
  const short = event.title.replace("Sunset Rooftop · ", "");
  const fallback = event.poster || gradientFor(event.id);
  const pillBg = isDraft ? "rgba(180,83,9,0.85)" : live ? "rgba(22,163,74,0.85)" : "rgba(0,0,0,0.45)";
  const pillLabel = isDraft ? "Draft" : live ? "Live" : "Past";
  const ring = selected ? colors.accent : focused ? colors.accentBorder : colors.border;
  return (
    <button
      ref={innerRef}
      onClick={onSelect}
      style={{
        width: 172, flexShrink: 0, borderRadius: "16px", border: `1px solid ${ring}`,
        background: colors.surface, overflow: "hidden", textAlign: "left", padding: 0,
        cursor: "pointer", fontFamily: SF,
        // Selected lifts toward you and glows accent — it's clearly the card the
        // panel below belongs to.
        transform: selected ? "translateY(-2px)" : "none",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        boxShadow: selected ? `0 0 0 2px ${colors.accent}, 0 12px 28px rgba(236,23,143,0.22)` : focused ? `0 0 0 1px ${colors.accentBorder}` : "none",
      }}
    >
      <div style={{ height: 92, background: fallback, position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: "9px 11px" }}>
        {event.coverImage && (
          <img src={event.coverImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
        <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.22) 0%, transparent 45%, rgba(0,0,0,0.40) 100%)" }} />
        <span style={{ position: "relative", alignSelf: "flex-start", fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#fff", background: pillBg, padding: "3px 8px", borderRadius: "999px", backdropFilter: "blur(2px)" }}>
          {pillLabel}
        </span>
        <span style={{ position: "relative", fontSize: "11px", fontWeight: 600, color: "rgba(255,255,255,0.95)", textShadow: "0 1px 6px rgba(0,0,0,0.45)" }}>{event.when}</span>
      </div>
      <div style={{ padding: "11px 12px 12px" }}>
        <div style={{ fontSize: "13.5px", fontWeight: 700, color: colors.text, lineHeight: 1.25, marginBottom: "6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{short}</div>
        {isDraft ? (
          <div style={{ fontSize: "11.5px", fontWeight: 600, color: colors.accent }}>Finish &amp; publish →</div>
        ) : (
          <>
            <div style={{ fontSize: "11.5px", color: colors.textSubtle, marginBottom: "5px" }}>
              {event.comingCount}{event.capacity ? ` / ${event.capacity}` : ""} {live ? "coming" : "came"}
            </div>
            <div style={{ height: 4, borderRadius: "999px", background: colors.surfaceMuted, overflow: "hidden" }}>
              <div style={{ width: `${Math.round(pct * 100)}%`, height: "100%", background: live ? colors.accent : colors.textFaded, borderRadius: "999px" }} />
            </div>
          </>
        )}
      </div>
    </button>
  );
}

// The clear primary action — leads the strip, filled accent so it reads as
// "start here," not a faint placeholder.
function CreateTile({ onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 150, flexShrink: 0, minHeight: 92 + 78, borderRadius: "16px",
        border: "none",
        background: colors.accent,
        color: "#fff",
        cursor: "pointer", fontFamily: SF, display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "10px",
        transition: "transform 0.15s ease, box-shadow 0.15s ease",
        transform: hover ? "translateY(-2px)" : "none",
        boxShadow: hover ? "0 10px 26px rgba(236,23,143,0.34)" : colors.accentShadow,
      }}
    >
      <span style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: 300, lineHeight: 1 }}>+</span>
      <span style={{ fontSize: "13px", fontWeight: 700 }}>Create event</span>
    </button>
  );
}
