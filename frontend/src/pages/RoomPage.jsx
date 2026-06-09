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
import { Trash2, Check, Link2, Paperclip, X, Search, Instagram, Music2, Twitter, Youtube, Globe, Linkedin, DoorOpen, ChevronRight, Copy, Mail, Phone, Plus, Send } from "lucide-react";
import { useToast } from "../components/Toast";
import { colors } from "../theme/colors.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { EventHostsSection } from "../components/EventHostsSection.jsx";
import { VipInviteSection } from "../components/VipInviteSection.jsx";
import ProfileSetup from "../components/room/ProfileSetup.jsx";
import LookingBack from "../components/room/LookingBack.jsx";
import { InstallPrompt } from "../components/pwa/InstallPrompt.jsx";
import { useRoomRealtime } from "../lib/useRoomRealtime.js";
import MessageStatusTicks from "../components/room/MessageStatusTicks.jsx";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const newClientId = () => (globalThis.crypto?.randomUUID?.() || `c_${Date.now()}_${Math.random().toString(36).slice(2)}`);

// Phone breakpoint. Drives the two big interaction differences: on desktop the
// event panel opens on HOVER and the chat/bulk surfaces float at the right
// edge; on phone there's no hover (you decide right under the cards) and those
// surfaces rise from the bottom as a sheet instead.
function useIsMobile(maxWidth = 640) {
  const [mobile, setMobile] = useState(
    typeof window !== "undefined" ? window.matchMedia(`(max-width: ${maxWidth}px)`).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const on = (e) => setMobile(e.matches);
    on(mq); // sync once in case the breakpoint changed since first render
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [maxWidth]);
  return mobile;
}

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
              {e.title}
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
// Quick access — drop real PullUp things into your own sentence. Pick an event,
// then drop in a SPECIFIC detail ("19:00", a venue) — answering "what time?"
// inline reads far more personal than pasting a link. Or attach the whole event
// (card on email, link on WhatsApp/IG). Or share your profile / number. No AI
// pre-guessing — you pick the event, then the detail.
function fmtEventDate(iso) { try { return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch { return null; } }
function fmtEventTime(iso) { try { return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); } catch { return null; } }

function QuickAccess({ events = [], host = {}, rail = null, attachedEventId, setAttachedEventId, onInsert }) {
  const [open, setOpen] = useState(false);
  const [drill, setDrill] = useState(null); // event being detailed
  const attached = events.find((e) => e.id === attachedEventId);
  // Profile, shaped for the rail: a native @handle on Instagram, a full link on
  // email / WhatsApp (where a bare handle isn't tappable). Bulk (no rail) → link.
  const handleClean = host.handle ? String(host.handle).replace(/^@/, "") : null;
  const profileFull = host.instagramUrl || (handleClean ? `instagram.com/${handleClean}` : null);
  const profileInsert = rail === "instagram" && handleClean ? `@${handleClean}` : profileFull;
  const phone = host.phone || null;
  // The attached event renders per channel at send (card on email, link on
  // chat) — label it so the host knows which they're getting.
  const attachLabel = rail === "email" ? "Attach event card" : rail ? "Attach event link" : "Attach the event";

  function close() { setOpen(false); setDrill(null); }
  function insert(text) { if (text) onInsert(text); close(); }

  const rowStyle = { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "transparent", border: "none", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: colors.text, cursor: "pointer", fontFamily: SF };
  const labelStyle = { fontSize: 10.5, fontWeight: 700, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: ".04em", padding: "8px 10px 4px" };

  return (
    <div style={{ position: "relative", marginBottom: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button onClick={() => (open ? close() : setOpen(true))} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: open ? "#fff" : colors.textMuted, background: open ? colors.accent : colors.surfaceMuted, border: `1px solid ${open ? colors.accent : colors.border}`, borderRadius: 999, padding: "5px 11px", cursor: "pointer" }}>
          ⚡ Quick access
        </button>
        {attached && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, borderRadius: 10, padding: "5px 8px 5px 10px", fontSize: 12, fontWeight: 600, color: colors.accent, maxWidth: "100%" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📅 {attached.title}</span>
            <button onClick={() => setAttachedEventId(null)} style={{ display: "flex", border: "none", background: "transparent", color: colors.accent, cursor: "pointer", padding: 0 }}><X size={13} /></button>
          </span>
        )}
      </div>

      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 6px)", left: 0, width: 280, maxHeight: 320, overflowY: "auto", background: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 12, boxShadow: "0 8px 28px rgba(0,0,0,.14)", zIndex: 50, padding: 4 }}>
          {!drill ? (
            <>
              <div style={labelStyle}>Drop in an event detail</div>
              {events.length ? events.slice(0, 10).map((e) => (
                <button key={e.id} onClick={() => setDrill(e)} style={rowStyle}>
                  <span>📅</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                  <span style={{ fontSize: 11, color: colors.textSubtle }}>{e.when} ›</span>
                </button>
              )) : <div style={{ ...rowStyle, color: colors.textSubtle, cursor: "default" }}>No events yet</div>}
              {(profileFull || phone) && <div style={labelStyle}>Share</div>}
              {profileFull && <button onClick={() => insert(profileInsert)} style={rowStyle}><span>@</span> My profile</button>}
              {phone && <button onClick={() => insert(phone)} style={rowStyle}><span>☎</span> My number</button>}
            </>
          ) : (
            <>
              <button onClick={() => setDrill(null)} style={{ ...rowStyle, fontWeight: 700, color: colors.accent }}>‹ <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{drill.title}</span></button>
              {fmtEventDate(drill.startsAt) && <button onClick={() => insert(fmtEventDate(drill.startsAt))} style={rowStyle}><span>📅</span> Date <span style={{ marginLeft: "auto", color: colors.textSubtle }}>{fmtEventDate(drill.startsAt)}</span></button>}
              {fmtEventTime(drill.startsAt) && <button onClick={() => insert(fmtEventTime(drill.startsAt))} style={rowStyle}><span>🕖</span> Time <span style={{ marginLeft: "auto", color: colors.textSubtle }}>{fmtEventTime(drill.startsAt)}</span></button>}
              {drill.location && <button onClick={() => insert(drill.location)} style={rowStyle}><span>📍</span> <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Where</span> <span style={{ color: colors.textSubtle, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{drill.location}</span></button>}
              <button onClick={() => { setAttachedEventId(drill.id); close(); }} style={rowStyle}><span>🔗</span> {attachLabel} {attachedEventId === drill.id ? "✓" : ""}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ThreadPanel({ person, onClose, igAccounts = [], events = [], host = {} }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [rail, setRail] = useState(person.channel);
  const [sending, setSending] = useState(false);
  const [sentMsgs, setSentMsgs] = useState([]); // messages sent this session, shown instantly
  const [liveMsgs, setLiveMsgs] = useState([]); // realtime arrivals this session (inbound + other-device)
  const sentKeysRef = useRef(new Set()); // clientId/id of our own sends, to dedupe realtime echoes
  const [attachments, setAttachments] = useState([]); // [{url,name,isImage}]
  const [uploading, setUploading] = useState(false);
  const [eventId, setEventId] = useState(null); // optionally include an event
  const fileRef = useRef(null);
  const taRef = useRef(null); // textarea — for Quick-access caret insertion
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
  // What the thread shows: their real history + anything sent this session +
  // anything that arrived live (inbound replies, sends from another device).
  const thread = useMemo(() => {
    const base = person.thread || [];
    // Dedupe local (optimistic + realtime) copies against the server thread by id.
    const seen = new Set(base.map((m) => m.id).filter(Boolean));
    const extra = [...sentMsgs, ...liveMsgs].filter((m) => !(m.id && seen.has(m.id)));
    return [...base, ...extra];
  }, [person.thread, sentMsgs, liveMsgs]);

  useEffect(() => { setDraft(""); setRail(person.channel); setIgFrom(defaultIg?.id || null); setSentMsgs([]); setLiveMsgs([]); sentKeysRef.current = new Set(); setAttachments([]); setEventId(null); }, [person.id, person.channel, defaultIg?.id]);

  // ── Live: this person's inbound replies + delivery-status ticks stream in. ──
  useRoomRealtime({
    onMessage: ({ eventType, row }) => {
      if (row.personId !== person.id) return;
      if (eventType === "UPDATE") {
        setSentMsgs((s) => s.map((m) => (m.id === row.id ? { ...m, status: row.status } : m)));
        setLiveMsgs((s) => s.map((m) => (m.id === row.id ? { ...m, status: row.status } : m)));
        return;
      }
      if (row.from === "you") {
        // Our own send echoing back → reconcile, don't duplicate.
        if (row.clientId && sentKeysRef.current.has(row.clientId)) {
          setSentMsgs((s) => s.map((m) => (m.clientId === row.clientId ? { ...m, id: row.id, status: row.status || m.status } : m)));
          sentKeysRef.current.add(row.id);
          return;
        }
        if (sentKeysRef.current.has(row.id)) return;
      }
      // Inbound reply (or another-device outbound) for this person → show it live.
      setLiveMsgs((s) => (s.some((m) => m.id === row.id) ? s : [...s, { ...row, time: "just now" }]));
    },
  });

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

  // Drop a Quick-access value into the message at the caret (or append).
  function insertAtCaret(text) {
    const el = taRef.current;
    if (!el) { setDraft((d) => (d ? `${d} ${text}` : text)); return; }
    const s = el.selectionStart ?? draft.length;
    const e = el.selectionEnd ?? draft.length;
    const next = draft.slice(0, s) + text + draft.slice(e);
    setDraft(next);
    requestAnimationFrame(() => { try { el.focus(); const p = s + text.length; el.setSelectionRange(p, p); } catch {} });
  }

  // POST + reconcile, shared by first-send and retry. The optimistic bubble
  // (keyed by clientId) flips sending → sent (then delivered/read live) or failed.
  async function doSend({ clientId, ch, text, atts, evId }) {
    setSentMsgs((m) => m.map((x) => (x.clientId === clientId ? { ...x, status: "sending" } : x)));
    try {
      const res = await authenticatedFetch("/host/room/message", {
        method: "POST",
        body: JSON.stringify({ personId: person.id, channel: ch, text, attachments: atts, eventId: evId || undefined, clientId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSentMsgs((m) => m.map((x) => (x.clientId === clientId ? { ...x, status: "failed" } : x)));
        showToast(data.error === "no_email" ? "No email on file for them yet" : "Couldn't send — tap to retry", "error");
        return;
      }
      const used = data.channel || ch;
      if (data.messageId) sentKeysRef.current.add(data.messageId);
      setSentMsgs((m) => m.map((x) => (x.clientId === clientId ? { ...x, id: data.messageId || x.id, status: data.status || "sent", channel: used } : x)));
      if (ch === "whatsapp" && used === "email") showToast("Sent as email — not reachable on WhatsApp right now", "success");
    } catch {
      setSentMsgs((m) => m.map((x) => (x.clientId === clientId ? { ...x, status: "failed" } : x)));
      showToast("Couldn't send — tap to retry", "error");
    }
  }

  async function handleSend() {
    const text = draft.trim();
    if ((!text && !attachments.length && !eventId) || sending) return;
    if (rail === "instagram") {
      showToast("Instagram sending is coming — switch to Email or WhatsApp to send now", "error");
      return;
    }
    const ch = rail;
    const atts = attachments;
    const evId = eventId;
    const evTitle = evId ? (events.find((e) => e.id === evId)?.title) : null;
    const note = [text, atts.length ? `📎 ${atts.length}` : "", evTitle ? `📅 ${evTitle}` : ""].filter(Boolean).join(" ");
    const clientId = newClientId();
    sentKeysRef.current.add(clientId);
    // Bubble appears instantly; composer clears; the send runs behind it.
    setSentMsgs((m) => [...m, { clientId, from: "you", text: note, time: "just now", channel: ch, status: "sending", _send: { ch, text, atts, evId } }]);
    setDraft(""); setAttachments([]); setEventId(null);
    setSending(true);
    try { await doSend({ clientId, ch, text, atts, evId }); }
    finally { setSending(false); }
  }

  function retry(m) {
    if (!m?._send) return;
    doSend({ clientId: m.clientId, ...m._send });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: SF }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 18px 16px", borderBottom: `1px solid ${colors.border}` }}>
        <button onClick={() => navigate(`/r/${person.id}`)} title="Open their room" style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: SF }}>
          <Avatar initials={person.initials} color={person.color} size={40} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text }}>{person.name}</div>
            <div style={{ fontSize: "12px", color: colors.textSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.handle}</div>
          </div>
        </button>
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
              <div key={m.id || m.clientId || i}>
                {divider}
                <div style={{ textAlign: "center", fontSize: "11.5px", color: colors.textSubtle, padding: "2px 0" }}>
                  {m.text} · <span style={{ color: colors.textFaded }}>{m.time}</span>
                </div>
              </div>
            );
          }
          const mine = m.from === "you";
          const failed = m.status === "failed";
          return (
            <div key={m.id || m.clientId || i}>
              {divider}
              <div style={{ display: "flex", flexDirection: "column", alignItems: mine ? "flex-end" : "flex-start" }}>
                <div onClick={failed ? () => retry(m) : undefined} title={failed ? "Tap to retry" : undefined} style={{ maxWidth: "78%", padding: "9px 13px", borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: mine ? colors.accent : colors.surfaceMuted, color: mine ? "#fff" : colors.text, fontSize: "13.5px", lineHeight: 1.45, opacity: m.status === "sending" ? 0.72 : 1, cursor: failed ? "pointer" : "default", transition: "opacity 0.2s" }}>
                  {m.text}
                </div>
                <span style={{ fontSize: "10.5px", color: failed ? "#dc2626" : colors.textFaded, marginTop: "3px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ color: ch.color, fontWeight: 600 }}>{ch.glyph}</span>
                  {failed ? "Not delivered · tap to retry" : m.status === "sending" ? "Sending…" : m.time}
                  {mine && <MessageStatusTicks status={m.status} pink={colors.accent} faint={colors.textFaded} />}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{ borderTop: `1px solid ${colors.border}`, padding: "12px 14px" }}>
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

        {/* Quick access — drop in event details / your profile / number, or
            attach the event. Available on every channel; each thing is shaped
            for the rail it's going out on. */}
        <QuickAccess events={events} host={host} rail={rail} attachedEventId={eventId} setAttachedEventId={setEventId} onInsert={insertAtCaret} />

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
          <textarea ref={taRef} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={rail === "whatsapp" && person.windowOpen === false ? "Window closed — sends as a WhatsApp template" : `Message ${person.name.split(" ")[0]} on ${c.label}…`} rows={2} style={{ flex: 1, resize: "none", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13.5px", fontFamily: SF, color: colors.text, outline: "none" }} />
          <button onClick={handleSend} disabled={(!draft.trim() && !attachments.length && !eventId) || sending} style={{ padding: "10px 16px", borderRadius: "999px", border: "none", background: (draft.trim() || attachments.length || eventId) && !sending ? colors.accent : colors.surfaceMuted, color: (draft.trim() || attachments.length || eventId) && !sending ? "#fff" : colors.textFaded, fontWeight: 700, fontSize: "13px", cursor: (draft.trim() || attachments.length || eventId) && !sending ? "pointer" : "default", flexShrink: 0, height: "fit-content" }}>{sending ? "Sending…" : "Send"}</button>
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
function BulkPanel({ people, events = [], lensEvent = null, host = {}, onClose, onClear }) {
  const { showToast } = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [eventId, setEventId] = useState(lensEvent?.id || null); // optionally include an event
  const fileRef = useRef(null);
  const taRef = useRef(null); // textarea — for Quick-access caret insertion
  const move = people[0]?.move;
  // Start blank — the host writes in their own voice (no pre-filled suggestion).
  useEffect(() => { setDraft(""); setEventId(lensEvent?.id || null); }, [people, lensEvent?.id]);

  function insertAtCaret(text) {
    const el = taRef.current;
    if (!el) { setDraft((d) => (d ? `${d} ${text}` : text)); return; }
    const s = el.selectionStart ?? draft.length;
    const e = el.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, s) + text + draft.slice(e));
    requestAnimationFrame(() => { try { el.focus(); const p = s + text.length; el.setSelectionRange(p, p); } catch {} });
  }

  // Honest channel split. WhatsApp-reachable people get WhatsApp (native text);
  // everyone else gets email; anyone with neither is surfaced, not dropped.
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
    if ((!text && !attachments.length && !eventId) || sending) return;
    setSending(true);
    try {
      const res = await authenticatedFetch("/host/room/message/bulk", {
        method: "POST",
        body: JSON.stringify({ personIds: people.map((p) => p.id), channel: "whatsapp", text, attachments, eventId }),
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
        {/* Quick access — drop in event details / your profile / number, or
            attach the whole event. Same native composer as 1:1. */}
        <QuickAccess events={events} host={host} attachedEventId={eventId} setAttachedEventId={setEventId} onInsert={insertAtCaret} />

        {/* Honest channel split — where this actually lands. */}
        <div style={{ fontSize: "11px", color: colors.textMuted, background: colors.surfaceMuted, border: `1px solid ${colors.border}`, borderRadius: 10, padding: "8px 11px", marginBottom: "9px", lineHeight: 1.5 }}>
          Sends to <strong>{emCount}</strong> on email
          {waCount ? <> · <strong>{waCount}</strong> on WhatsApp</> : null}
          {noneCount ? <> · <strong>{noneCount}</strong> can’t be reached yet</> : null}.
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
          <textarea ref={taRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Write to all ${people.length}…`} rows={3} style={{ flex: 1, resize: "none", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13.5px", fontFamily: SF, color: colors.text, outline: "none" }} />
          <button onClick={handleBulkSend} disabled={(!draft.trim() && !attachments.length && !eventId) || sending} style={{ padding: "10px 16px", borderRadius: "999px", border: "none", background: (draft.trim() || attachments.length || eventId) && !sending ? colors.accent : colors.surfaceMuted, color: (draft.trim() || attachments.length || eventId) && !sending ? "#fff" : colors.textFaded, fontWeight: 700, fontSize: "13px", cursor: (draft.trim() || attachments.length || eventId) && !sending ? "pointer" : "default", flexShrink: 0, height: "fit-content", whiteSpace: "nowrap" }}>
            {sending ? "Sending…" : `Send to ${people.length}`}
          </button>
        </div>
        <button onClick={onClear} style={{ marginTop: "8px", fontSize: "11.5px", color: colors.textSubtle, background: "transparent", border: "none", cursor: "pointer", fontFamily: SF, padding: 0 }}>
          Clear selection
        </button>
      </div>
    </div>
  );
}

// The brain's editable opener. For the seeded demo people we have bespoke
// lines; for real people we draft from the suggested move (the host edits it —
// the anti-extraction line: PullUp makes the host's own voice easier, it never
// sends manufactured warmth on its own).
function suggestedDraft(person) {
  const first = (person.name || "there").split(" ")[0];
  // Draft from the move, in the host's hands to edit.
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

// The masthead reads as a PROFILE — the host's NAME up top, then the substance:
// people · events · pullups. Consistent whether the owner or an outsider is
// looking. The "who needs you" action lives below in the inbox, where you act.
// Channel → icon / accent. Mirrors Settings → social links so the masthead
// reads the same channels the host added a handle to.
const SOCIAL_ICON = { instagram: Instagram, tiktok: Music2, x: Twitter, youtube: Youtube, linkedin: Linkedin, website: Globe };
const SOCIAL_COLOR = { instagram: "#d6249f", tiktok: "#0a0a0a", x: "#0a0a0a", youtube: "#ff0000", linkedin: "#0a66c2", website: "#6b6b6b" };

function ProfileMasthead({ host, loading, onStat }) {
  const h = host || {};
  const name = (h.name || "").trim() || "Your room";
  const roleText = (h.role || "").trim();
  // The channels the host configured in Settings → social links, each with its
  // own icon + tappable URL. We never assume Instagram. Back-compat: if the
  // spine only handed a legacy IG handle, synthesise a single Instagram entry.
  const igClean = (h.handle || "").trim().replace(/^@/, "");
  const socials = (Array.isArray(h.socials) && h.socials.length)
    ? h.socials
    : ((igClean || h.instagramUrl)
        ? [{ channel: "instagram", label: "Instagram", handle: igClean ? `@${igClean}` : null, url: h.instagramUrl || (igClean ? `https://instagram.com/${igClean}` : null) }]
        : []);
  const Stat = ({ n, label, onClick }) => (
    onClick
      ? <button onClick={onClick} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: SF, fontSize: "13.5px", color: colors.textMuted }}><span style={{ color: colors.text, fontWeight: 700 }}>{n ?? 0}</span> {label}</button>
      : <span><span style={{ color: colors.text, fontWeight: 700 }}>{n ?? 0}</span> {label}</span>
  );
  return (
    <div style={{ display: "flex", gap: "16px", alignItems: "center", marginBottom: "22px", fontFamily: SF }}>
      <MastheadAvatar host={h} loading={loading} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{ fontSize: "26px", fontWeight: 750, color: colors.text, margin: "0 0 5px", letterSpacing: "0.01em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {loading ? <Bar w="200px" h={24} /> : name}
        </h1>
        {/* The substance line — people, events, pullups. The profile's proof. */}
        <div style={{ fontSize: "13.5px", color: colors.textMuted, display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          {loading ? <Bar w="220px" h={13} /> : (
            <>
              <Stat n={h.peopleCount} label="people" onClick={() => onStat?.("people")} />
              <span style={{ color: colors.textFaded }}>·</span>
              <Stat n={h.eventsCount} label="events" onClick={() => onStat?.("events")} />
              <span style={{ color: colors.textFaded }}>·</span>
              <Stat n={h.pullupsCount} label="pullups" />
            </>
          )}
        </div>
        {/* Identity — each configured social channel (right icon, clickable to
            that profile) + the bio. Channel-labelled, never assumed. */}
        {loading ? (
          <Bar w="140px" h={11} style={{ marginTop: "7px" }} />
        ) : (socials.length || roleText) ? (
          <div style={{ fontSize: "12.5px", color: colors.textSubtle, marginTop: "4px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", minWidth: 0 }}>
            {socials.map((s) => {
              const Icon = SOCIAL_ICON[s.channel] || Globe;
              const display = s.handle || s.label;
              const inner = (
                <>
                  <Icon size={13} style={{ color: SOCIAL_COLOR[s.channel] || colors.textMuted, flexShrink: 0 }} />
                  {display}
                </>
              );
              return s.url ? (
                <a key={s.channel} href={s.url} target="_blank" rel="noreferrer" title={`${s.label}${s.handle ? ` · ${s.handle}` : ""}`}
                   style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: colors.text, fontWeight: 600, textDecoration: "none", flexShrink: 0 }}>
                  {inner}
                </a>
              ) : (
                <span key={s.channel} style={{ display: "inline-flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>{inner}</span>
              );
            })}
            {roleText && socials.length > 0 && <span style={{ color: colors.textFaded, flexShrink: 0 }}>·</span>}
            {roleText && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{roleText}</span>}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── The global Room ────────────────────────────────────────────────
// Rooms you're in — the events you belong to but don't own: ones you co-host,
// and ones you attend as a guest (RSVP'd / pulled up). Every card opens the one
// shared Room. This is what makes the home work for a pure guest, who otherwise
// hosts nothing and would land on an empty page.
function MemberRoomsRail({ rooms, onOpen }) {
  const isMobile = useIsMobile();
  if (!rooms?.length) return null;
  const tag = (r) =>
    r.isHost ? { label: "Co-host", c: colors.accent, bg: colors.accentSoft, b: colors.accentBorder }
             : { label: "Guest", c: colors.textMuted, bg: colors.surfaceMuted, b: colors.border };
  return (
    <div style={{ marginTop: "26px", marginBottom: "8px" }}>
      {/* Same small-caps section label + horizontal strip as "Your events", so
          the two rails read as siblings — only the headline tells them apart. */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <DoorOpen size={13} color={colors.textSubtle} strokeWidth={2.4} />
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle }}>Rooms you're in</span>
        <span style={{ fontSize: "11px", color: colors.textFaded, letterSpacing: "0.02em" }}>· events you joined</span>
      </div>
      <div style={{ display: "flex", gap: isMobile ? "10px" : "12px", overflowX: "auto", alignItems: "flex-start", paddingBottom: "6px", scrollbarWidth: "thin", scrollSnapType: isMobile ? "x proximity" : undefined, WebkitOverflowScrolling: "touch" }}>
        {rooms.map((r) => {
          const t = tag(r);
          return (
            <button
              key={r.id}
              onClick={() => onOpen(r.id)}
              style={{ flex: "0 0 auto", width: isMobile ? 200 : 228, scrollSnapAlign: isMobile ? "start" : undefined, textAlign: "left", cursor: "pointer", padding: 0, border: `1px solid ${colors.border}`, borderRadius: "14px", overflow: "hidden", background: colors.surface, display: "flex", flexDirection: "column", boxShadow: "0 1px 2px rgba(10,10,10,0.03)" }}
            >
              <div style={{ height: 84, background: "linear-gradient(135deg, #fde7f3 0%, #f4f4f5 55%, #e7f9f5 100%)", position: "relative" }}>
                {r.coverImage && <img src={r.coverImage} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10.5, fontWeight: 700, color: t.c, background: t.bg, border: `1px solid ${t.b}`, borderRadius: 999, padding: "2px 8px" }}>{t.label}</span>
              </div>
              <div style={{ padding: "10px 12px 12px", display: "flex", flexDirection: "column", gap: "3px" }}>
                <div style={{ fontSize: "13.5px", fontWeight: 700, color: colors.text, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: SF }}>{r.title}</div>
                <div style={{ fontSize: "12px", color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[r.when, r.location].filter(Boolean).join(" · ") || (r.status === "draft" ? "Draft" : "")}
                </div>
                <div style={{ marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "12px", fontWeight: 650, color: colors.accent }}>
                  Enter room <ChevronRight size={13} strokeWidth={2.6} />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Your people — the CRM layer, surfaced ──────────────────────────
//
// Felix's note: the system already holds everyone; the body never showed them.
// This is the "richer version of the people you have" — searchable contact
// cards over the SAME people the masthead counts (no extra fetch). A card is a
// contact sheet (email / phone / @handle + where you met) and opens their full
// cross-event thread on click. Identity-resolved, so each card is one person
// no matter how many channels or events they touched.
function ContactRow({ icon: Icon, text }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "7px", minWidth: 0 }}>
      <Icon size={13} color={colors.textFaded} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: "12.5px", color: colors.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{text}</span>
    </div>
  );
}

// Quick-action button on a people card (Message / Add info). Shared style.
function CardAction({ icon: Icon, label, onClick, tone = "default" }) {
  const [hov, setHov] = useState(false);
  const accent = tone === "accent";
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        padding: "8px 10px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: SF,
        fontSize: 12.5, fontWeight: 700,
        background: accent ? (hov ? colors.accent : colors.accentSoft) : (hov ? colors.surfaceMuted : "transparent"),
        color: accent ? (hov ? "#fff" : colors.accent) : colors.textMuted,
        transition: "background 0.15s ease, color 0.15s ease",
      }}
    >
      <Icon size={13} /> {label}
    </button>
  );
}

function PeopleContactCard({ person, events, active, onClick }) {
  const [hover, setHover] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const phone = person.phone || person.phone_e164 || null;
  const ig = person.instagram ? String(person.instagram).replace(/^@+/, "") : null;
  const evChips = (person.events || []).map((id) => events.find((e) => e.id === id)).filter(Boolean);
  const hasContact = person.email || phone || ig;

  function message() {
    window.dispatchEvent(new CustomEvent("pullup:open-thread", { detail: { personId: person.id } }));
  }

  async function saveNote() {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const r = await authenticatedFetch(`/host/crm/people/${person.id}/notes`, { method: "POST", body: JSON.stringify({ content }) });
      const d = await r.json();
      if (d?.id) { setDraft(""); setAdding(false); setSaved(true); setTimeout(() => setSaved(false), 1800); }
    } catch { /* keep the draft so nothing is lost */ }
    setSaving(false);
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        borderRadius: "16px",
        border: `1px solid ${active ? colors.accentBorder : colors.border}`,
        background: active ? colors.accentSoft : hover ? colors.surfaceMuted : colors.surface,
        transition: "background 0.15s ease, border-color 0.15s ease", fontFamily: SF,
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Body — opens the full detail (notes history + message). */}
      <div onClick={onClick} role="button" tabIndex={0} style={{ cursor: "pointer", padding: "14px", display: "flex", flexDirection: "column", gap: "11px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
          <Avatar initials={person.initials} color={person.color} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <HeatDot warmth={person.warmth} />
              <span style={{ fontSize: "14.5px", fontWeight: 700, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.name}</span>
            </div>
            {person.relationship && (
              <div style={{ fontSize: "12px", color: colors.textFaded, marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.relationship}</div>
            )}
          </div>
          <span style={{ flexShrink: 0 }}>
            <ChannelChip channel={person.channel} windowOpen={person.windowOpen} windowNote={person.windowNote} />
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          {person.email && <ContactRow icon={Mail} text={person.email} />}
          {phone && <ContactRow icon={Phone} text={phone} />}
          {ig && <ContactRow icon={Instagram} text={`@${ig}`} />}
          {!hasContact && <div style={{ fontSize: "12px", color: colors.textFaded }}>No contact details yet</div>}
        </div>

        {evChips.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            {evChips.slice(0, 3).map((e) => (
              <span key={e.id} style={{ fontSize: "10.5px", color: colors.textSubtle, background: colors.surfaceMuted, border: `1px solid ${colors.borderFaint}`, padding: "2px 8px", borderRadius: "999px", whiteSpace: "nowrap", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
            ))}
            {evChips.length > 3 && <span style={{ fontSize: "10.5px", color: colors.textFaded }}>+{evChips.length - 3}</span>}
          </div>
        )}
      </div>

      {/* Quick actions — right on the card so they're never buried. */}
      <div style={{ display: "flex", gap: "4px", padding: "6px", borderTop: `1px solid ${colors.borderFaint}` }}>
        <CardAction icon={Send} label="Message" onClick={message} tone="accent" />
        <CardAction icon={saved ? Check : Plus} label={saved ? "Added" : "Add info"} onClick={() => setAdding((v) => !v)} />
      </div>

      {adding && (
        <div style={{ padding: "0 10px 10px" }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveNote();
              if (e.key === "Escape") { setAdding(false); setDraft(""); }
            }}
            autoFocus
            placeholder="Add info — allergies, how you met…"
            rows={2}
            style={{ width: "100%", resize: "none", padding: "9px 11px", borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: 13.5, fontFamily: SF, outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 6 }}>
            <button type="button" onClick={() => { setAdding(false); setDraft(""); }} style={{ padding: "6px 12px", borderRadius: 9, border: "none", background: "transparent", color: colors.textMuted, fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: SF }}>Cancel</button>
            <button type="button" onClick={saveNote} disabled={!draft.trim() || saving} style={{ padding: "6px 13px", borderRadius: 9, border: "none", background: draft.trim() && !saving ? colors.accent : colors.surfaceMuted, color: draft.trim() && !saving ? "#fff" : colors.textFaded, fontSize: 12.5, fontWeight: 700, cursor: draft.trim() && !saving ? "pointer" : "not-allowed", fontFamily: SF }}>{saving ? "Adding…" : "Add"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PeopleLayer({ people = [], events = [], activeId, onOpen }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!query) return people;
    return people.filter((p) => {
      const hay = [p.name, p.email, p.phone || p.phone_e164, p.instagram, p.relationship]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(query);
    });
  }, [people, query]);

  return (
    <div style={{ marginTop: "30px", fontFamily: SF }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle }}>Your people</span>
        {people.length > 0 && <span style={{ fontSize: "11px", color: colors.textFaded, letterSpacing: "0.02em" }}>· {people.length}</span>}
      </div>

      {people.length > 0 && (
        <div style={{ position: "relative", marginBottom: "14px" }}>
          <Search size={15} color={colors.textFaded} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your people — name, email, @handle…"
            style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: "12px", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text, fontSize: "14px", outline: "none", fontFamily: SF, boxSizing: "border-box" }}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ padding: "28px 20px", textAlign: "center", fontSize: "13px", color: colors.textFaded, border: `1px dashed ${colors.border}`, borderRadius: "16px" }}>
          {people.length ? "No one matches that." : "Your people show up here as they RSVP and pull up."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(258px, 1fr))", gap: "12px" }}>
          {filtered.map((p) => (
            <PeopleContactCard key={p.id} person={p} events={events} active={p.id === activeId} onClick={() => onOpen(p)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Person detail — the enlarged card ──────────────────────────────
//
// Clicking a people card opens THIS, not the chat. It's the contact sheet
// blown up: who they are, where you met, and a dated free-text notes log (the
// old CRM "add info" — host-private, paired by date, via person_notes). Talking
// to them is one button that hands off to the real Messages dock.
function fmtNoteDate(d) {
  if (!d) return "";
  try {
    const dt = new Date(String(d).length <= 10 ? `${d}T00:00:00` : d);
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch { return String(d); }
}

function DetailChip({ icon: Icon, text }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: colors.textMuted, background: colors.surfaceMuted, border: `1px solid ${colors.borderFaint}`, padding: "4px 9px", borderRadius: 999, minWidth: 0, maxWidth: "100%" }}>
      <Icon size={12} color={colors.textFaded} style={{ flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{text}</span>
    </span>
  );
}

function PersonDetailModal({ person, events = [], onClose }) {
  const isMobile = useIsMobile();
  const [notes, setNotes] = useState(null); // null = loading
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setNotes(null);
    authenticatedFetch(`/host/crm/people/${person.id}/notes`)
      .then((r) => r.json())
      .then((d) => { if (alive) setNotes(Array.isArray(d?.notes) ? d.notes : []); })
      .catch(() => { if (alive) setNotes([]); });
    return () => { alive = false; };
  }, [person.id]);

  async function addNote() {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const r = await authenticatedFetch(`/host/crm/people/${person.id}/notes`, {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      const d = await r.json();
      const note = d?.note || (d?.id ? d : null);
      if (note?.id) { setNotes((cur) => [note, ...(cur || [])]); setDraft(""); }
    } catch { /* keep the draft so nothing is lost */ }
    setSaving(false);
  }

  function message() {
    window.dispatchEvent(new CustomEvent("pullup:open-thread", { detail: { personId: person.id } }));
    onClose();
  }

  const phone = person.phone || person.phone_e164 || null;
  const ig = person.instagram ? String(person.instagram).replace(/^@+/, "") : null;
  const evChips = (person.events || []).map((id) => events.find((e) => e.id === id)).filter(Boolean);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.55)", backdropFilter: "blur(4px)", zIndex: 1000, display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center", padding: isMobile ? 0 : 20, fontFamily: SF }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: colors.background, border: isMobile ? "none" : `1px solid ${colors.border}`, borderRadius: isMobile ? 0 : 22, width: "100%", maxWidth: isMobile ? "100%" : 460, maxHeight: isMobile ? "100vh" : "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 60px rgba(10,10,10,0.22)" }}>
        {/* Header — the contact sheet */}
        <div style={{ padding: "18px 18px 14px", borderBottom: `1px solid ${colors.borderFaint}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
            <Avatar initials={person.initials} color={person.color} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <HeatDot warmth={person.warmth} />
                <span style={{ fontSize: 18, fontWeight: 800, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.name}</span>
              </div>
              {person.relationship && <div style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 3, lineHeight: 1.4 }}>{person.relationship}</div>}
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, padding: 4, flexShrink: 0 }}><X size={20} /></button>
          </div>

          {(person.email || phone || ig) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {person.email && <DetailChip icon={Mail} text={person.email} />}
              {phone && <DetailChip icon={Phone} text={phone} />}
              {ig && <DetailChip icon={Instagram} text={`@${ig}`} />}
            </div>
          )}

          {evChips.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {evChips.map((e) => (
                <span key={e.id} style={{ fontSize: 10.5, color: colors.textSubtle, background: colors.surfaceMuted, border: `1px solid ${colors.borderFaint}`, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
              ))}
            </div>
          )}

          <button onClick={message} style={{ marginTop: 14, width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "10px 14px", borderRadius: 12, border: "none", background: colors.accent, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: SF }}>
            <Send size={15} /> Message
          </button>
        </div>

        {/* Notes timeline */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", minHeight: 80 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle, marginBottom: 10 }}>Notes</div>
          {notes === null ? (
            <div style={{ fontSize: 13, color: colors.textFaded, padding: "8px 0" }}>Loading…</div>
          ) : notes.length === 0 ? (
            <div style={{ fontSize: 13, color: colors.textFaded, padding: "8px 0", lineHeight: 1.5 }}>Nothing yet. Add what you know — it stays paired with the date you added it.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {notes.map((n) => (
                <div key={n.id} style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.surface }}>
                  <div style={{ fontSize: 13.5, color: colors.text, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.5 }}>{n.content}</div>
                  <div style={{ fontSize: 11, color: colors.textFaded, marginTop: 6 }}>{fmtNoteDate(n.noteDate || n.createdAt)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add info */}
        <div style={{ borderTop: `1px solid ${colors.borderFaint}`, padding: "12px 18px", background: colors.surface }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") addNote(); }}
            placeholder="Add info — allergies, how you met, what they're into…"
            rows={2}
            style={{ width: "100%", resize: "none", padding: "10px 12px", borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: 14, fontFamily: SF, outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button onClick={addNote} disabled={!draft.trim() || saving} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: draft.trim() && !saving ? colors.accent : colors.surfaceMuted, color: draft.trim() && !saving ? "#fff" : colors.textFaded, fontSize: 13, fontWeight: 700, cursor: draft.trim() && !saving ? "pointer" : "not-allowed", fontFamily: SF }}>
              <Plus size={14} /> {saving ? "Adding…" : "Add info"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// OwnerConsole — the operating layer of YOUR OWN room. Rendered by
// NodeProfilePage (/r/:me) only when the viewer is the owner; it sits below the
// shared identity masthead, which the page owns. No fetch of its own: the whole
// room (identity + this console payload) arrives in one /r/:id response, so this
// is a pure render of `room` (the console slice). The masthead, count popups,
// and viewMode/search stubs that used to live here are gone — the masthead is
// the page's, and the stubs were never wired.
export function OwnerConsole({ room: roomProp }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState(null);
  const [detailPerson, setDetailPerson] = useState(null); // people-card → enlarged detail (notes + message)
  const [lensEventId, setLensEventId] = useState(null); // event-lens over the Room
  const [bulkPeople, setBulkPeople] = useState(null); // when set, the right slot shows bulk-compose
  // Local copy so ProfileSetup patches + event deletion update in place without
  // a refetch. Re-seed if the parent hands a fresh payload.
  const [room, setRoom] = useState(roomProp);
  useEffect(() => { setRoom(roomProp); }, [roomProp]);

  const HOST = room?.host || { peopleCount: 0 };
  const EVENTS = room?.events || [];
  const MEMBER_ROOMS = room?.memberRooms || [];
  const MOMENTS = room?.moments || [];
  const PEOPLE = room?.people || [];

  const lensEvent = EVENTS.find((e) => e.id === lensEventId) || null;
  const selected = PEOPLE.find((p) => p.id === selectedId) || null;

  return (
    <>
      <style>{`@keyframes roomShimmer { 0% { background-position: 100% 50%; } 100% { background-position: 0 50%; } } @keyframes roomPanelDrop { 0% { opacity: 0; transform: translateY(-6px); } 100% { opacity: 1; transform: translateY(0); } } @keyframes roomSheetUp { 0% { transform: translateY(100%); } 100% { transform: translateY(0); } }`}</style>

      {/* Make-it-yours — fills the gaps (photo, bio, Instagram, brief). Self-hides
          when done or dismissed. */}
      <ProfileSetup onHostPatch={(patch) => setRoom((r) => (r ? { ...r, host: { ...r.host, ...patch } } : r))} />

      {/* Looking back — the legacy layer. The world they built, read back to
          them. Warmth, not actions; only shows when there's a real moment. */}
      <LookingBack
        moments={MOMENTS}
        onOpenPerson={(id) => { setBulkPeople(null); setSelectedId(id); }}
        onCreate={() => navigate("/create")}
      />

      {/* The events banner — your content, up top. */}
      <EventsBanner
        events={EVENTS}
        people={PEOPLE}
        lensEventId={lensEventId}
        onOpenEvent={(id) => {
          // A draft is never "managed" in the room — it has no guests yet. Any
          // open/manage action on a draft goes straight to the editor.
          const ev = EVENTS.find((e) => e.id === id);
          navigate(ev?.status === "draft" ? `/app/events/${id}/edit` : `/events/${id}/room`);
        }}
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

      {/* Rooms you're in — events you co-host or attend as a guest. */}
      <MemberRoomsRail rooms={MEMBER_ROOMS} onOpen={(id) => navigate(`/events/${id}/room`)} />

      {/* Your people — the CRM, surfaced. Searchable contact cards over the same
          people the masthead counts. A card opens the person's full thread. */}
      <PeopleLayer
        people={PEOPLE}
        events={EVENTS}
        activeId={detailPerson?.id}
        onOpen={(p) => setDetailPerson(p)}
      />

      {/* Right slot — DESKTOP: floats fixed to the edge. PHONE: rises as a sheet
          with a tap-to-dismiss scrim. One at a time: a conversation or bulk compose. */}
      {(selected || bulkPeople) && (
        <>
          {isMobile && (
            <div
              onClick={() => { setSelectedId(null); setBulkPeople(null); }}
              style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.4)", zIndex: 29 }}
            />
          )}
          <div
            style={
              isMobile
                ? { position: "fixed", left: 0, right: 0, bottom: 0, top: "8vh", borderTopLeftRadius: 18, borderTopRightRadius: 18, background: colors.surface, boxShadow: "0 -12px 40px rgba(10,10,10,0.18)", zIndex: 30, overflow: "hidden", animation: "roomSheetUp 0.2s ease-out" }
                : { position: "fixed", top: "58px", right: 0, bottom: 0, width: "420px", borderLeft: `1px solid ${colors.border}`, background: colors.surface, boxShadow: "-12px 0 40px rgba(10,10,10,0.08)", zIndex: 30 }
            }
          >
            {bulkPeople ? (
              <BulkPanel people={bulkPeople} events={EVENTS} lensEvent={lensEvent} host={HOST} onClose={() => setBulkPeople(null)} onClear={() => setBulkPeople(null)} />
            ) : (
              <ThreadPanel person={selected} onClose={() => setSelectedId(null)} igAccounts={HOST.igAccounts || []} events={EVENTS} host={HOST} />
            )}
          </div>
        </>
      )}

      {/* People card → enlarged detail: contact sheet + dated notes + a Message
          button that hands off to the real dock. Not the inline chat. */}
      {detailPerson && (
        <PersonDetailModal person={detailPerson} events={EVENTS} onClose={() => setDetailPerson(null)} />
      )}

      {/* Host-home install nudge — "your Room on your home screen". Self-gates:
          renders only when this visitor can actually install and hasn't snoozed. */}
      <InstallPrompt
        headline="Your Room on your home screen"
        subtext="Add PullUp as an app — your people and events, one tap away."
      />
    </>
  );
}

// The list behind a masthead count — tap "44 people" / "40 events" and step
// into who/what's actually there, then click through to anyone's room.
function MastheadStatPopup({ kind, people = [], events = [], onClose, onPerson, onEvent }) {
  const isPeople = kind === "people";
  const sorted = isPeople
    ? [...people].sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    : events;
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.32)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 60, padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 460, maxHeight: "72vh", background: colors.background, borderRadius: 18, border: `1px solid ${colors.border}`, boxShadow: "0 20px 60px rgba(10,10,10,0.22)", display: "flex", flexDirection: "column", fontFamily: SF }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px 12px", borderBottom: `1px solid ${colors.borderFaint}` }}>
          <span style={{ fontSize: "14.5px", fontWeight: 800, color: colors.text }}>{isPeople ? "People in your world" : "Your events"}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: colors.textMuted, padding: 0 }}>×</button>
        </div>
        <div style={{ overflowY: "auto", padding: "4px 18px 16px" }}>
          {sorted.length === 0 && <div style={{ fontSize: 13, color: colors.textFaded, padding: "18px 0", textAlign: "center" }}>{isPeople ? "No one yet." : "No events yet."}</div>}
          {isPeople && sorted.map((p) => (
            <button key={p.id} onClick={() => onPerson(p.id)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "9px 6px", background: "none", border: "none", borderBottom: `1px solid ${colors.borderFaint}`, cursor: "pointer", fontFamily: SF }}>
              <Avatar initials={p.initials} color={p.color} size={34} />
              <span style={{ flex: 1, minWidth: 0, fontSize: "13.5px", fontWeight: 600, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
              <span style={{ fontSize: 12, color: colors.accent, fontWeight: 700 }}>→</span>
            </button>
          ))}
          {!isPeople && sorted.map((e) => (
            <button key={e.id} onClick={() => onEvent(e.id)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, padding: "9px 6px", background: "none", border: "none", borderBottom: `1px solid ${colors.borderFaint}`, cursor: "pointer", fontFamily: SF }}>
              <div style={{ width: 52, height: 40, borderRadius: 9, flexShrink: 0, overflow: "hidden", background: "linear-gradient(135deg, #fde7f3, #f4f4f5)" }}>
                {e.coverImage && <img src={e.coverImage} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <span style={{ flex: 1, minWidth: 0, fontSize: "13.5px", fontWeight: 700, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title || "Untitled"}</span>
              <span style={{ fontSize: 12, color: colors.accent, fontWeight: 700 }}>→</span>
            </button>
          ))}
        </div>
      </div>
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
  const isMobile = useIsMobile();
  const [showDrafts, setShowDrafts] = useState(false);
  // One unified panel opens below the strip when you open a card. It holds the
  // SAME action bar for every event (Manage · Team · VIP · Share · delete) so
  // nothing behaves inconsistently — only "Manage" navigates; the rest swap
  // content inline. { eventId, tab } | null.
  //
  // Desktop opens on HOVER; clicking PINS it open (so moving the mouse away
  // doesn't close it once you've committed). Phone has no hover — a tap pins it
  // straight away, and you decide right under the cards.
  const [panel, setPanel] = useState(null);
  const [pinned, setPinned] = useState(false);
  const panelEvent = panel ? events.find((e) => e.id === panel.eventId) : null;
  const hoverTimer = useRef(null);
  const closeTimer = useRef(null);
  const clearTimers = () => { clearTimeout(hoverTimer.current); clearTimeout(closeTimer.current); };

  // Click/tap: toggle a PINNED panel for this card.
  const clickCard = (id) => {
    clearTimers();
    setPanel((cur) => {
      if (cur && cur.eventId === id && pinned) { setPinned(false); return null; }
      setPinned(true);
      return cur && cur.eventId === id ? cur : { eventId: id, tab: null };
    });
  };
  // Hover (desktop only): open after a short beat so brushing across the strip
  // doesn't flash panels open.
  const hoverOpen = (id) => {
    if (isMobile) return;
    clearTimeout(closeTimer.current);
    hoverTimer.current = setTimeout(() => {
      setPanel((cur) => (cur && cur.eventId === id ? cur : { eventId: id, tab: null }));
    }, 110);
  };
  // Leaving the whole banner closes an UNPINNED panel after a grace beat (so you
  // can travel from a card down into its panel without it snapping shut).
  const bannerLeave = () => {
    if (isMobile) return;
    clearTimeout(hoverTimer.current);
    closeTimer.current = setTimeout(() => { if (!pinned) setPanel(null); }, 220);
  };
  const bannerEnter = () => { if (!isMobile) clearTimeout(closeTimer.current); };
  const closePanel = () => { clearTimers(); setPinned(false); setPanel(null); };
  useEffect(() => () => clearTimers(), []);

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
    <div ref={rootRef} onMouseEnter={bannerEnter} onMouseLeave={bannerLeave} style={{ marginBottom: "26px", position: "relative" }}>
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
      <div ref={stripRef} style={{ display: "flex", gap: isMobile ? "10px" : "12px", overflowX: "auto", alignItems: "flex-start", paddingBottom: "6px", scrollbarWidth: "thin", scrollSnapType: isMobile ? "x proximity" : undefined, WebkitOverflowScrolling: "touch" }}>
        {/* Create event leads — the primary, always-available action. */}
        <CreateTile onClick={onCreate} isMobile={isMobile} />
        {shown.map((e) => (
          <EventPosterCard
            key={e.id}
            event={e}
            isMobile={isMobile}
            focused={lensEventId === e.id}
            selected={panel?.eventId === e.id}
            onSelect={() => (e.status === "draft" ? onSubpage(e.id, "edit") : clickCard(e.id))}
            onHoverOpen={() => hoverOpen(e.id)}
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
          isMobile={isMobile}
          tab={panel.tab}
          onTab={(tab) => { setPinned(true); setPanel((cur) => ({ ...cur, tab: cur.tab === tab ? null : tab })); }}
          onClose={closePanel}
          focused={lensEventId === panelEvent.id}
          guestCount={people.filter((p) => (p.events || []).includes(panelEvent.id)).length}
          onManage={() => onOpenEvent(panelEvent.id)}
          onFocus={() => onFocus(panelEvent.id)}
          onMessageAll={() => onMessageAll?.(panelEvent.id)}
          onDeleted={() => { closePanel(); onDeleted?.(panelEvent.id); }}
        />
      )}
    </div>
  );
}

// The one panel — same bar for every event. Manage navigates; Team / VIP /
// Share swap content inline here; Focus drops the event as a lens; delete
// confirms inline. This is what removes the "some jump, some pop" confusion.
function EventActionPanel({ event, arrowLeft, isMobile, tab, onTab, onClose, focused, guestCount = 0, onManage, onFocus, onMessageAll, onDeleted }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
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
  async function doDuplicate() {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const res = await authenticatedFetch(`/host/events/${event.id}/duplicate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.event?.id) { showToast(data.message || "Could not duplicate event", "error"); setDuplicating(false); return; }
      showToast("Duplicated — change the name and date", "success");
      navigate(`/app/events/${data.event.id}/edit`); // land in the new draft's editor
    } catch { showToast("Could not duplicate event", "error"); setDuplicating(false); }
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

      <div style={{ border: `1px solid ${colors.accentBorder}`, borderTop: `3px solid ${colors.accent}`, borderRadius: "16px", background: colors.surface, overflow: "hidden", boxShadow: "0 14px 40px rgba(10,10,10,0.13)", animation: isMobile ? undefined : "roomPanelDrop 0.18s ease-out" }}>
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
        <div style={{ width: 1, height: 20, background: colors.border, margin: "0 2px" }} />
        <button onClick={doDuplicate} disabled={duplicating} title="Duplicate as a new draft" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", fontWeight: 600, fontFamily: SF, padding: "7px 14px", borderRadius: "999px", cursor: duplicating ? "default" : "pointer", opacity: duplicating ? 0.6 : 1, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, whiteSpace: "nowrap" }}>
          <Copy size={13} />{duplicating ? "Duplicating…" : "Duplicate"}
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
function EventPosterCard({ event, focused, selected, onSelect, onHoverOpen, innerRef, isMobile }) {
  const live = event.status === "live";
  const isDraft = event.status === "draft";
  const pct = event.capacity ? Math.min(1, event.comingCount / event.capacity) : 0;
  const short = event.title;
  const fallback = event.poster || gradientFor(event.id);
  const pillBg = isDraft ? "rgba(180,83,9,0.85)" : live ? "rgba(22,163,74,0.85)" : "rgba(0,0,0,0.45)";
  const pillLabel = isDraft ? "Draft" : live ? "Live" : "Past";
  const ring = selected ? colors.accent : focused ? colors.accentBorder : colors.border;
  return (
    <button
      ref={innerRef}
      onClick={onSelect}
      onMouseEnter={onHoverOpen}
      style={{
        // Phone: ~43vw so two cards sit full with a sliver of the third peeking
        // (reads as swipeable). Desktop: fixed 172.
        width: isMobile ? "43vw" : 172, maxWidth: isMobile ? 190 : undefined,
        scrollSnapAlign: isMobile ? "start" : undefined,
        flexShrink: 0, borderRadius: "16px", border: `1px solid ${ring}`,
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
function CreateTile({ onClick, isMobile }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: isMobile ? "40vw" : 150, maxWidth: isMobile ? 178 : undefined,
        scrollSnapAlign: isMobile ? "start" : undefined,
        flexShrink: 0, minHeight: 92 + 78, borderRadius: "16px",
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
