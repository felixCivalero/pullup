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

import { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2, Check, Link2, Paperclip, X, Search, Instagram, Music2, Twitter, Youtube, Globe, Linkedin, DoorOpen, ChevronRight, ChevronDown, Copy, Mail, Phone, Plus, Send, ExternalLink, SlidersHorizontal, Share2, MoreHorizontal } from "lucide-react";
import { useToast } from "../components/Toast";
import { colors } from "../theme/colors.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { EventShareModal } from "../components/EventShareModal.jsx";
import ProfileSetup from "../components/room/ProfileSetup.jsx";
import LookingBack from "../components/room/LookingBack.jsx";
import { InstallPrompt } from "../components/pwa/InstallPrompt.jsx";
import { useRoomRealtime } from "../lib/useRoomRealtime.js";
import { useAudienceFilter, PEOPLE_LENSES, ATTENDANCE, CHANNEL_KEYS, CHANNEL_LABELS } from "../lib/useAudienceFilter.js";
import MessageStatusTicks from "../components/room/MessageStatusTicks.jsx";
import { RoomProductShowcase } from "../components/room/RoomProductShowcase.jsx";
import { RoomProductManager } from "../components/room/RoomProductManager.jsx";

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
  const taRef = useRef(null); // textarea — for Quick-access caret insertion + auto-grow
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

  // The composer grows with the message so longer notes — real emails — are
  // comfortable to write, then scrolls past a generous cap.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 260)}px`;
  }, [draft]);

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
          <textarea ref={taRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={rail === "whatsapp" && person.windowOpen === false ? "Window closed — sends as a WhatsApp template" : `Message ${person.name.split(" ")[0]} on ${c.label}…`} rows={2} style={{ flex: 1, minWidth: 0, resize: "none", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13.5px", fontFamily: SF, color: colors.text, outline: "none", maxHeight: "260px", overflowY: "auto", lineHeight: 1.45 }} />
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
  const [subject, setSubject] = useState(""); // email subject for the email recipients
  const [sending, setSending] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [eventId, setEventId] = useState(lensEvent?.id || null); // optionally include an event
  const fileRef = useRef(null);
  const taRef = useRef(null); // textarea — for Quick-access caret insertion + auto-grow
  const move = people[0]?.move;
  // Start blank — the host writes in their own voice (no pre-filled suggestion).
  useEffect(() => { setDraft(""); setSubject(""); setEventId(lensEvent?.id || null); }, [people, lensEvent?.id]);

  // Grow the composer with the message so longer notes are comfortable to write.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 60), 260)}px`;
  }, [draft]);

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
        body: JSON.stringify({ personIds: people.map((p) => p.id), channel: "whatsapp", text, subject: subject.trim() || undefined, attachments, eventId }),
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
        {/* Subject — shown when anyone in the batch lands over email. Optional;
            falls back to "A note from {host}". */}
        {emCount > 0 && (
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={`Subject for the ${emCount} on email (optional)`}
            style={{ width: "100%", boxSizing: "border-box", marginBottom: "8px", border: `1px solid ${colors.border}`, borderRadius: "10px", padding: "9px 12px", fontSize: "13px", fontWeight: 600, fontFamily: SF, color: colors.text, outline: "none" }}
          />
        )}

        <input ref={fileRef} type="file" multiple onChange={onAttach} style={{ display: "none" }} />
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <button onClick={() => fileRef.current?.click()} title="Attach a file or image" style={{ width: 38, height: 38, flexShrink: 0, borderRadius: "10px", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Paperclip size={16} /></button>
          <textarea ref={taRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Write to all ${people.length}…`} rows={3} style={{ flex: 1, minWidth: 0, resize: "none", border: `1px solid ${colors.border}`, borderRadius: "12px", padding: "10px 12px", fontSize: "13.5px", fontFamily: SF, color: colors.text, outline: "none", maxHeight: "260px", overflowY: "auto", lineHeight: 1.45 }} />
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
// Your community — the front door to THIS room. Self-contained so it can sit in
// its own column beside "Rooms you're in". No outer margin; the caller spaces it.
// One header language for every section of the home Room — a real title, the
// count, and a one-line whisper of what the section IS. Repeated verbatim on
// every section so the page scans like a table of contents instead of blending.
function SectionHeader({ title, badge, count, hint, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, fontFamily: SF, minHeight: 32 }}>
      <span style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-0.015em", color: colors.text, whiteSpace: "nowrap" }}>{title}</span>
      {badge}
      {count != null && <span style={{ fontSize: "13px", fontWeight: 700, color: colors.textFaded }}>{typeof count === "number" ? count.toLocaleString() : count}</span>}
      {hint && <span style={{ fontSize: "12.5px", color: colors.textFaded, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>· {hint}</span>}
      <div style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// The shared "new section starts here" break — air + a faint rule, so sections
// stop bleeding into each other.
const SECTION_BREAK = { marginTop: 34, paddingTop: 24, borderTop: `1px solid ${colors.borderFaint}` };

function CommunityCard({ community }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const c = community;
  const live = !!c?.live;
  const members = c?.memberCount || 0;
  const origin = typeof window !== "undefined" ? window.location.origin : "https://pullup.se";
  const shareUrl = c?.slug ? `${origin}/c/${c.slug}` : null;
  const copyLink = async (e) => {
    e.stopPropagation();
    if (!shareUrl) return;
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  const glass = {
    display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, fontFamily: SF,
    cursor: "pointer", padding: "8px 13px", borderRadius: 999, border: "none",
    background: "rgba(10,10,10,0.52)", color: "#fff", textDecoration: "none",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", whiteSpace: "nowrap",
  };
  return (
    // Fills its column so it stands the same height as the "Rooms you're in"
    // cards beside it — the two read as one tidy grid row.
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <SectionHeader
        title="Your community"
        hint="people who join through your link"
        badge={c && !live && (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 10.5, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
            padding: "3px 9px", borderRadius: 999,
            color: colors.textMuted, background: colors.surfaceMuted, border: `1px solid ${colors.border}`,
          }}>
            Draft
          </span>
        )}
      />
      {live ? (
        // The card IS the community page in miniature — its cover, its title,
        // its member count — same poster language as the events wall. Click
        // opens your community view; Copy/View ride on the image.
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate("/community")}
          onKeyDown={(e) => { if (e.key === "Enter") navigate("/community"); }}
          style={{
            position: "relative", flex: 1, minHeight: 190, width: "100%", boxSizing: "border-box",
            borderRadius: 16, overflow: "hidden", cursor: "pointer", fontFamily: SF,
            background: gradientFor(c.id), boxShadow: "0 2px 10px rgba(10,10,10,0.08)",
          }}
        >
          {c.coverImage && (
            <img src={c.coverImage} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          )}
          <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.26) 0%, rgba(0,0,0,0.04) 38%, rgba(0,0,0,0.72) 100%)" }} />

          <span style={{ position: "absolute", top: 10, left: 10, fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "#fff", background: "rgba(22,163,74,0.92)", padding: "4px 9px", borderRadius: 999, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>Live</span>

          <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6 }}>
            {shareUrl && (
              <button type="button" onClick={copyLink} style={{ ...glass, background: copied ? "rgba(22,163,74,0.85)" : glass.background }}>
                {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy link</>}
              </button>
            )}
            <a href={`/c/${c.slug}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={glass}>
              View <ExternalLink size={13} />
            </a>
          </div>

          <div style={{ position: "absolute", left: 14, right: 14, bottom: 12 }}>
            <div style={{ fontSize: "17px", fontWeight: 800, color: "#fff", letterSpacing: "-0.01em", lineHeight: 1.2, textShadow: "0 1px 10px rgba(0,0,0,0.5)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.title || "Your community"}</div>
            <div style={{ marginTop: 3, fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.88)", textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
              <strong style={{ fontWeight: 800, color: "#fff" }}>{members.toLocaleString()}</strong> {members === 1 ? "member" : "members"} · everyone who joined through your link
            </div>
          </div>
        </div>
      ) : (
        // No page yet / still a draft → one clear CTA row (create or publish).
        <div
          role="button"
          tabIndex={0}
          onClick={() => navigate("/community")}
          onKeyDown={(e) => { if (e.key === "Enter") navigate("/community"); }}
          style={{
            display: "flex", alignItems: "center", gap: 13, width: "100%", flex: 1, boxSizing: "border-box",
            padding: "15px 16px", borderRadius: 16, cursor: "pointer",
            textAlign: "left", fontFamily: SF,
            border: `1px solid ${colors.border}`,
            background: `linear-gradient(180deg, ${colors.accent}12, ${colors.surface} 70%)`,
            color: colors.text,
          }}
        >
          <span style={{ flex: "0 0 auto", width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `${colors.accent}1f`, color: colors.accent }}>
            <DoorOpen size={20} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14.5, fontWeight: 700 }}>
              {!c ? "Create your community signup page" : "Finish your community signup page"}
            </span>
            <span style={{ display: "block", fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>
              {!c ? "One link — everyone who wants in lands in your room." : "It's a draft — publish it to open the doors."}
            </span>
          </span>
          <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 800, color: "#fff", background: colors.accent, padding: "7px 13px", borderRadius: 999 }}>
            {!c ? <><Plus size={13} /> Create</> : "Publish"}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Your people — the CRM layer, surfaced ──────────────────────────
//
// The body never showed the people the system already holds. This is the
// "richer version of the people you have": searchable full-profile cards over
// the SAME people the masthead counts (no extra fetch). Each card IS the profile
// — contact sheet, where-you-met, message, and the dated notes log inline — so
// there's nothing to click open. Identity-resolved: one card per person no
// matter how many channels or events they touched.
// A full profile, inline. No modal, no click-to-open — everything that used to
// live in the popup (contact sheet, where-you-met, message, the dated notes log
// + add-info) is the card itself, so a note you add shows on it immediately.
// Notes arrive on the room payload (person.notes); adds are optimistic.
function PeopleContactCard({ person, events }) {
  const [notes, setNotes] = useState(() => (Array.isArray(person.notes) ? person.notes : []));
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);       // note composer folded until asked for
  const [allEvents, setAllEvents] = useState(false); // event chips folded past the first two
  const phone = person.phone || person.phone_e164 || null;
  const ig = person.instagram ? String(person.instagram).replace(/^@+/, "") : null;
  const evChips = (person.events || []).map((id) => events.find((e) => e.id === id)).filter(Boolean);
  const shownChips = allEvents ? evChips : evChips.slice(0, 2);
  const moreChips = evChips.length - shownChips.length;

  // Merge fresh payload notes with any optimistic local-only adds (by id), so a
  // 5s poll that hasn't caught up yet can't blink a just-added note away.
  useEffect(() => {
    const server = Array.isArray(person.notes) ? person.notes : [];
    setNotes((local) => {
      const ids = new Set(server.map((n) => n.id));
      const localOnly = local.filter((n) => !ids.has(n.id));
      return [...localOnly, ...server];
    });
  }, [person.notes]);

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
      if (d?.id) { setNotes((cur) => [d, ...cur]); setDraft(""); setAdding(false); }
    } catch { /* keep the draft so nothing is lost */ }
    setSaving(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", borderRadius: 18, border: `1px solid ${colors.border}`, background: colors.surface, fontFamily: SF, overflow: "hidden" }}>
      <div style={{ padding: "14px 15px", display: "flex", flexDirection: "column", gap: 11 }}>
        {/* Identity row — avatar, name, the one-line relationship, and a quiet
            Message pill in the corner (the card is the person, not a form). */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
          <Avatar initials={person.initials} color={person.color} size={44} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <HeatDot warmth={person.warmth} />
              <span style={{ fontSize: 15.5, fontWeight: 800, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.name}</span>
            </div>
            {person.relationship && <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2, lineHeight: 1.4 }}>{person.relationship}</div>}
          </div>
          <button
            onClick={message}
            title={`Message ${person.name || ""}`}
            style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999, border: `1px solid ${colors.accentBorder}`, background: colors.accentSoft, color: colors.accent, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: SF }}
          >
            <Send size={13} /> Message
          </button>
        </div>

        {/* Contact */}
        {(person.email || phone || ig) && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {person.email && <DetailChip icon={Mail} text={person.email} />}
            {phone && <DetailChip icon={Phone} text={phone} />}
            {ig && <DetailChip icon={Instagram} text={`@${ig}`} />}
          </div>
        )}

        {/* Where you met — first two events, the rest behind "+N". */}
        {evChips.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {shownChips.map((e) => (
              <span key={e.id} style={{ fontSize: 10.5, color: colors.textSubtle, background: colors.surfaceMuted, border: `1px solid ${colors.borderFaint}`, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", maxWidth: 210, overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
            ))}
            {(moreChips > 0 || allEvents) && (
              <button onClick={() => setAllEvents((v) => !v)} style={{ fontSize: 10.5, fontWeight: 700, color: colors.textMuted, background: "none", border: `1px dashed ${colors.border}`, padding: "3px 9px", borderRadius: 999, cursor: "pointer", fontFamily: SF, whiteSpace: "nowrap" }}>
                {allEvents ? "less" : `+${moreChips} more`}
              </button>
            )}
          </div>
        )}

        {/* What they answered — the host's enrichment questions, across events. */}
        {Array.isArray(person.answers) && person.answers.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {person.answers.map((a, i) => (
              <div key={i} style={{ padding: "7px 11px", borderRadius: 10, border: `1px solid ${colors.borderFaint}`, background: colors.surfaceMuted }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: colors.textSubtle }}>{a.label} </span>
                <span style={{ fontSize: 12.5, color: colors.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notes — existing notes always visible; the composer stays folded
          behind "+ Add info" so an empty card doesn't carry an empty form. */}
      <div style={{ borderTop: `1px solid ${colors.borderFaint}`, padding: "11px 15px 13px", display: "flex", flexDirection: "column", gap: 8 }}>
        {notes.map((n) => (
          <div key={n.id} style={{ padding: "8px 11px", borderRadius: 10, border: `1px solid ${colors.borderFaint}`, background: colors.background }}>
            <div style={{ fontSize: 13, color: colors.text, whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.45 }}>{n.content}</div>
            <div style={{ fontSize: 10.5, color: colors.textFaded, marginTop: 4 }}>{fmtNoteDate(n.noteDate || n.createdAt)}</div>
          </div>
        ))}
        {!adding ? (
          <button
            onClick={() => setAdding(true)}
            style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 2px", border: "none", background: "none", color: colors.textMuted, fontSize: 12, fontWeight: 650, cursor: "pointer", fontFamily: SF }}
          >
            <Plus size={13} /> Add info — allergies, how you met, what they're into…
          </button>
        ) : (
          <>
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") saveNote(); }}
              placeholder="Allergies, how you met, what they're into…"
              rows={2}
              style={{ width: "100%", resize: "none", padding: "9px 11px", borderRadius: 10, border: `1px solid ${colors.border}`, background: colors.background, color: colors.text, fontSize: 13, fontFamily: SF, outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => { setAdding(false); setDraft(""); }} style={{ padding: "6px 12px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: SF }}>
                Cancel
              </button>
              <button onClick={saveNote} disabled={!draft.trim() || saving} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 13px", borderRadius: 999, border: "none", background: draft.trim() && !saving ? colors.accent : colors.surfaceMuted, color: draft.trim() && !saving ? "#fff" : colors.textFaded, fontSize: 12, fontWeight: 700, cursor: draft.trim() && !saving ? "pointer" : "not-allowed", fontFamily: SF }}>
                {saving ? "Adding…" : "Save"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PeopleLayer({ people = [], events = [] }) {
  // The SAME audience builder as the Messages dock (shared hook), so the Room's
  // people view and the messaging picker filter identically off one payload.
  const af = useAudienceFilter(people, events);
  const { channels, eventIds, attendance, segment, q, setAttendance, setSegment, setQ,
    toggleChannel, clearChannels, toggleEvent, clearEvents } = af;
  const filtered = af.list;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [eventPickerOpen, setEventPickerOpen] = useState(false);

  // Don't dump everyone into the DOM — show 5, reveal 20 more on demand.
  const PAGE = 20;
  const [visible, setVisible] = useState(5);
  useEffect(() => { setVisible(5); }, [q, segment, channels, eventIds, attendance]);
  const shown = filtered.slice(0, visible);
  const remaining = filtered.length - shown.length;

  const pill = (on) => ({
    display: "inline-flex", alignItems: "center", gap: 6, padding: "7px 13px", borderRadius: 999, cursor: "pointer",
    fontFamily: SF, fontSize: "12.5px", fontWeight: 600,
    border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent : colors.surface,
    color: on ? "#fff" : colors.textMuted, transition: "background 0.15s, border-color 0.15s, color 0.15s",
  });
  const lbl = { fontSize: "10.5px", fontWeight: 800, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.06em", margin: "14px 2px 7px" };

  return (
    <div style={{ ...SECTION_BREAK, fontFamily: SF }}>
      <SectionHeader
        title="Your people"
        count={people.length || null}
        hint="everyone who's crossed your events — search, filter, message"
        right={people.length > 0 && (
          <button type="button" onClick={() => setFiltersOpen((o) => !o)} style={pill(filtersOpen || af.activeCount > 0)}>
            <SlidersHorizontal size={14} strokeWidth={2.2} />
            Filters{af.activeCount > 0 ? ` · ${af.activeCount}` : ""}
          </button>
        )}
      />

      {people.length > 0 && (
        <div style={{ position: "relative", marginBottom: "12px" }}>
          <Search size={15} color={colors.textFaded} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search your people — name, email, @handle…"
            style={{ width: "100%", padding: "10px 12px 10px 34px", borderRadius: "12px", border: `1px solid ${colors.border}`, background: colors.surface, color: colors.text, fontSize: "14px", outline: "none", fontFamily: SF, boxSizing: "border-box" }}
          />
        </div>
      )}

      {/* Plain-language summary of the audience being built. */}
      {af.summary.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginBottom: "12px", fontSize: "13px", color: colors.textMuted }}>
          <span style={{ color: colors.text, fontWeight: 700 }}>{filtered.length} {filtered.length === 1 ? "person" : "people"}</span>
          <span style={{ color: colors.textFaded }}>·</span>
          <span>{af.summary.join(" · ")}</span>
          <button type="button" onClick={af.clear} style={{ border: "none", background: "none", cursor: "pointer", color: colors.accent, fontWeight: 700, fontSize: "12.5px", fontFamily: SF }}>Clear</button>
        </div>
      )}

      {/* The audience builder — identical capabilities to the Messages dock. */}
      {filtersOpen && people.length > 0 && (
        <div style={{ marginBottom: "16px", padding: "2px 16px 16px", border: `1px solid ${colors.border}`, borderRadius: "16px", background: colors.surface }}>
          <div style={lbl}>Channel</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={clearChannels} style={pill(channels.length === 0)}>Any</button>
            {CHANNEL_KEYS.map((c) => <button key={c} type="button" onClick={() => toggleChannel(c)} style={pill(channels.includes(c))}>{CHANNEL_LABELS[c]}</button>)}
          </div>

          <div style={lbl}>People</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PEOPLE_LENSES.map(([v, label]) => <button key={v} type="button" onClick={() => setSegment(v)} style={pill(segment === v)}>{label}</button>)}
          </div>

          {events.length > 0 && (
            <>
              <div style={lbl}>Events</div>
              <button type="button" onClick={() => setEventPickerOpen((o) => !o)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", boxSizing: "border-box", padding: "10px 13px", borderRadius: "12px", border: `1px solid ${eventIds.length ? colors.accent : colors.border}`, background: colors.surface, color: eventIds.length ? colors.accent : colors.text, fontWeight: eventIds.length ? 700 : 500, fontSize: "13px", fontFamily: SF, cursor: "pointer" }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {eventIds.length === 0 ? "All events" : eventIds.length === 1 ? (events.find((e) => e.id === eventIds[0])?.title || "1 event") : `${eventIds.length} events selected`}
                </span>
                <ChevronDown size={16} style={{ flexShrink: 0, transform: eventPickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
              </button>
              {eventPickerOpen && (
                <div style={{ marginTop: 6, border: `1px solid ${colors.border}`, borderRadius: "12px", maxHeight: 220, overflowY: "auto", background: colors.surface }}>
                  {eventIds.length > 0 && (
                    <button type="button" onClick={clearEvents} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 13px", border: "none", borderBottom: `1px solid ${colors.border}`, background: "none", color: colors.textMuted, fontSize: "12px", fontWeight: 700, fontFamily: SF, cursor: "pointer" }}>Clear selection</button>
                  )}
                  {events.map((ev) => {
                    const on = eventIds.includes(ev.id);
                    return (
                      <button key={ev.id} type="button" onClick={() => toggleEvent(ev.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "9px 13px", border: "none", background: on ? colors.surfaceAlt || "rgba(0,0,0,0.03)" : "none", color: colors.text, fontSize: "13px", fontFamily: SF, cursor: "pointer" }}>
                        <span style={{ width: 18, height: 18, flexShrink: 0, borderRadius: 6, border: `2px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{on && <Check size={12} color="#fff" strokeWidth={3.5} />}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                        <span style={{ fontSize: "11px", color: colors.textFaded, textTransform: "capitalize", flexShrink: 0 }}>{ev.status}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {eventIds.length > 0 && (
                <>
                  <div style={lbl}>Attendance</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {ATTENDANCE.map(([v, label]) => <button key={v} type="button" onClick={() => setAttendance(v)} style={pill(attendance === v)}>{label}</button>)}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ padding: "28px 20px", textAlign: "center", fontSize: "13px", color: colors.textFaded, border: `1px dashed ${colors.border}`, borderRadius: "16px" }}>
          {people.length ? "No one matches that." : "Your people show up here as they RSVP and pull up."}
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px", alignItems: "start" }}>
            {shown.map((p) => (
              <PeopleContactCard key={p.id} person={p} events={events} />
            ))}
          </div>
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setVisible((v) => v + PAGE)}
              style={{
                marginTop: "16px", width: "100%", padding: "11px 16px", borderRadius: "12px",
                border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted,
                fontFamily: SF, fontSize: "13px", fontWeight: 600, cursor: "pointer",
              }}
            >
              Load {Math.min(PAGE, remaining)} more · {remaining} left
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── People-card helpers — note dates + contact chips ───────────────
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
  const [bulkPeople, setBulkPeople] = useState(null); // when set, the right slot shows bulk-compose
  const [managingProducts, setManagingProducts] = useState(false); // main-room product manager
  // Local copy so ProfileSetup patches + event deletion update in place without
  // a refetch. Re-seed if the parent hands a fresh payload.
  const [room, setRoom] = useState(roomProp);
  useEffect(() => { setRoom(roomProp); }, [roomProp]);

  const HOST = room?.host || { peopleCount: 0 };
  const EVENTS = room?.events || [];
  const MEMBER_ROOMS = room?.memberRooms || [];
  const MOMENTS = room?.moments || [];
  const PEOPLE = room?.people || [];
  const COMMUNITY = room?.community || null;
  const PRODUCTS = room?.products || [];

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

      {/* The events banner — your content, up top. One shelf, two faces:
          Hosting (the wall you run) and Going (rooms you joined), switched by
          the segmented pills in the header. */}
      <EventsBanner
        events={EVENTS}
        memberRooms={MEMBER_ROOMS}
        onOpenEvent={(id) => {
          // A draft is never "managed" in the room — it has no guests yet. Any
          // open action on a draft goes straight to the editor.
          const ev = EVENTS.find((e) => e.id === id);
          navigate(ev?.status === "draft" ? `/app/events/${id}/edit` : `/events/${id}/room`);
        }}
        onOpenRoom={(id) => navigate(`/events/${id}/room`)}
        onCreate={() => navigate("/create")}
        onDeleted={(id) => setRoom((r) => (r ? { ...r, events: r.events.filter((e) => e.id !== id) } : r))}
      />

      {/* Your community — the full-width banner row (going-events moved up
          into the events shelf's Going face). */}
      <div style={{ ...SECTION_BREAK, display: "flex" }}>
        <CommunityCard community={COMMUNITY} />
      </div>

      {/* Your products — under the community/rooms grid. The host's global product
          library: a tight banner for one, a clean grid for many. Live products
          show in the main room automatically; this is the manage anchor. */}
      <div style={SECTION_BREAK}>
        <RoomProductShowcase
          products={PRODUCTS}
          isHost
          theme="light"
          scope="main"
          heading="Your products"
          hint="what you sell beyond tickets"
          homeHeader
          onManage={() => setManagingProducts(true)}
        />
      </div>
      {managingProducts && (
        <RoomProductManager
          scope="main"
          onClose={() => setManagingProducts(false)}
          onChanged={() => { /* optimistic; payload refreshes on next load */ }}
        />
      )}

      {/* Your people — the CRM, surfaced. Each card is the full profile: contact
          sheet, where-you-met, message, and inline dated notes. No click-open. */}
      <PeopleLayer people={PEOPLE} events={EVENTS} />

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
              <BulkPanel people={bulkPeople} events={EVENTS} host={HOST} onClose={() => setBulkPeople(null)} onClear={() => setBulkPeople(null)} />
            ) : (
              <ThreadPanel person={selected} onClose={() => setSelectedId(null)} igAccounts={HOST.igAccounts || []} events={EVENTS} host={HOST} />
            )}
          </div>
        </>
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
      <Bar w="150px" h={16} style={{ marginBottom: "14px" }} />
      <div style={{ display: "flex", gap: "14px", overflow: "hidden", alignItems: "stretch" }}>
        {/* create tile placeholder */}
        <div style={{ width: 148, flexShrink: 0, borderRadius: "20px", background: colors.surfaceMuted, animation: SHIMMER, backgroundImage: `linear-gradient(90deg, ${colors.surfaceMuted} 25%, ${colors.borderFaint} 37%, ${colors.surfaceMuted} 63%)`, backgroundSize: "400% 100%" }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ width: 200, aspectRatio: "5 / 7", flexShrink: 0, borderRadius: "20px", background: colors.surfaceMuted, animation: SHIMMER, backgroundImage: `linear-gradient(90deg, ${colors.surfaceMuted} 25%, ${colors.borderFaint} 37%, ${colors.surfaceMuted} 63%)`, backgroundSize: "400% 100%" }} />
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
function EventsBanner({ events, memberRooms = [], onOpenEvent, onOpenRoom, onCreate, onDeleted }) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { showToast } = useToast();
  // One shelf, two faces: Hosting (the wall you run) and Going (rooms you
  // joined — guest + co-host). A pure guest who hosts nothing lands on Going.
  const [view, setView] = useState(() => (events.length === 0 && memberRooms.length > 0 ? "going" : "hosting"));
  const going = view === "going" && memberRooms.length > 0;
  // Drafts are hidden by default to keep the wall clean — a "N drafts · show"
  // toggle surfaces them on demand (they then sort first with a Draft badge).
  const [showDrafts, setShowDrafts] = useState(false);
  const [shareEvent, setShareEvent] = useState(null);   // → share popup (page / room)
  const [deleteEvent, setDeleteEvent] = useState(null); // → delete confirm popup
  const [sheetEvent, setSheetEvent] = useState(null);   // phone ⋯ → action sheet
  const [duplicatingId, setDuplicatingId] = useState(null);

  const drafts = events.filter((e) => e.status === "draft");
  const published = events.filter((e) => e.status !== "draft");
  const shown = showDrafts ? [...drafts, ...published] : published;

  async function doDuplicate(event) {
    if (duplicatingId) return;
    setDuplicatingId(event.id);
    setSheetEvent(null);
    try {
      const res = await authenticatedFetch(`/host/events/${event.id}/duplicate`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.event?.id) { showToast(data.message || "Could not duplicate event", "error"); setDuplicatingId(null); return; }
      showToast("Duplicated — change the name and date", "success");
      navigate(`/app/events/${data.event.id}/edit`); // land in the new draft's editor
    } catch { showToast("Could not duplicate event", "error"); setDuplicatingId(null); }
  }

  return (
    <div style={{ marginBottom: "26px", position: "relative" }}>
      <SectionHeader
        title="Your events"
        count={memberRooms.length > 0 ? null : (published.length || null)}
        badge={memberRooms.length > 0 && (
          // The switch — two labelled pills with the counts baked in, so the
          // face you're NOT on is never invisible.
          <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.surfaceMuted }}>
            {[["hosting", `Hosting · ${published.length + drafts.length}`], ["going", `Going · ${memberRooms.length}`]].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{ border: "none", borderRadius: 999, padding: "4px 11px", fontSize: "11.5px", fontWeight: 700, fontFamily: SF, cursor: "pointer", whiteSpace: "nowrap", background: view === v ? colors.text : "transparent", color: view === v ? "#fff" : colors.textMuted, transition: "background 0.15s, color 0.15s" }}
              >
                {label}
              </button>
            ))}
          </span>
        )}
        right={!going && drafts.length > 0 && (
          <button
            onClick={() => setShowDrafts((v) => !v)}
            title={showDrafts ? "Hide drafts" : "Show drafts"}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: "10.5px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", color: showDrafts ? "#b45309" : colors.textMuted, background: showDrafts ? "rgba(180,83,9,0.12)" : colors.surfaceMuted, border: `1px solid ${showDrafts ? "rgba(180,83,9,0.32)" : colors.border}`, borderRadius: 999, padding: "3px 9px", cursor: "pointer", fontFamily: SF }}
          >
            {drafts.length} draft{drafts.length === 1 ? "" : "s"} {showDrafts ? "· hide" : "· show"}
          </button>
        )}
      />
      <div style={{ display: "flex", gap: isMobile ? "10px" : "14px", overflowX: "auto", alignItems: "stretch", paddingBottom: "6px", scrollbarWidth: "thin", scrollSnapType: isMobile ? "x proximity" : undefined, WebkitOverflowScrolling: "touch" }}>
        {going ? (
          // Going — the rooms you joined, wearing the same posters as yours
          // (Guest/Co-host pill instead of quick actions; click = enter room).
          memberRooms.map((r) => (
            <EventPosterCard key={r.id} event={r} isMobile={isMobile} going onOpen={() => onOpenRoom(r.id)} />
          ))
        ) : (
          <>
            {/* Create event leads — the primary, always-available action. */}
            <CreateTile onClick={onCreate} isMobile={isMobile} />
            {shown.map((e) => (
              <EventPosterCard
                key={e.id}
                event={e}
                isMobile={isMobile}
                busy={duplicatingId === e.id}
                onOpen={() => onOpenEvent(e.id)}
                onShare={() => setShareEvent(e)}
                onDuplicate={() => doDuplicate(e)}
                onDelete={() => { setSheetEvent(null); setDeleteEvent(e); }}
                onMenu={() => setSheetEvent(e)}
              />
            ))}
            {!shown.length && (
              <div style={{ display: "flex", alignItems: "center", color: colors.textSubtle, fontSize: "13px", fontFamily: SF, padding: "0 8px" }}>
                No published events yet — make your first one.
              </div>
            )}
          </>
        )}
      </div>

      {shareEvent && <EventShareModal event={shareEvent} onClose={() => setShareEvent(null)} />}
      {deleteEvent && (
        <DeleteEventModal
          event={deleteEvent}
          onClose={() => setDeleteEvent(null)}
          onDeleted={(id) => { setDeleteEvent(null); onDeleted?.(id); }}
        />
      )}
      {sheetEvent && (
        <EventActionSheet
          event={sheetEvent}
          onClose={() => setSheetEvent(null)}
          onShare={() => { const e = sheetEvent; setSheetEvent(null); setShareEvent(e); }}
          onDuplicate={() => doDuplicate(sheetEvent)}
          onDelete={() => { const e = sheetEvent; setSheetEvent(null); setDeleteEvent(e); }}
        />
      )}
    </div>
  );
}

// Delete confirm — its own small popup so the wall never grows panels.
function DeleteEventModal({ event, onClose, onDeleted }) {
  const { showToast } = useToast();
  const [deleting, setDeleting] = useState(false);
  async function doDelete() {
    setDeleting(true);
    try {
      const res = await authenticatedFetch(`/host/events/${event.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { showToast(data.message || "Could not delete event", "error"); setDeleting(false); return; }
      showToast("Event deleted", "success");
      onDeleted(event.id);
    } catch { showToast("Could not delete event", "error"); setDeleting(false); }
  }
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(10,10,10,0.42)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 380, background: colors.background, borderRadius: 18, border: `1px solid ${colors.border}`, boxShadow: "0 24px 70px rgba(10,10,10,0.28)", padding: "20px 20px 18px", fontFamily: SF }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: colors.text, lineHeight: 1.35 }}>Delete “{event.title}”?</div>
        <div style={{ fontSize: "12.5px", color: colors.textMuted, marginTop: 6, lineHeight: 1.5 }}>This can’t be undone.</div>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button disabled={deleting} onClick={doDelete} style={{ padding: "9px 18px", borderRadius: 999, border: "none", background: colors.danger, color: "#fff", fontWeight: 700, fontSize: "13px", cursor: deleting ? "not-allowed" : "pointer", opacity: deleting ? 0.7 : 1, fontFamily: SF }}>
            {deleting ? "Deleting…" : "Delete event"}
          </button>
          <button onClick={onClose} style={{ padding: "9px 18px", borderRadius: 999, border: `1px solid ${colors.border}`, background: colors.surface, color: colors.textMuted, fontWeight: 600, fontSize: "13px", cursor: "pointer", fontFamily: SF }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// Phone ⋯ sheet — the same three quick actions the desktop card shows on hover.
function EventActionSheet({ event, onClose, onShare, onDuplicate, onDelete }) {
  const isDraft = event.status === "draft";
  const row = (danger) => ({
    display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "15px 18px",
    border: "none", borderBottom: `1px solid ${colors.borderFaint}`, background: "none",
    fontSize: "14.5px", fontWeight: 650, color: danger ? colors.danger : colors.text,
    cursor: "pointer", fontFamily: SF, textAlign: "left",
  });
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(10,10,10,0.42)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 470, background: colors.background, borderRadius: "20px 20px 0 0", boxShadow: "0 -12px 44px rgba(10,10,10,0.22)", paddingBottom: "env(safe-area-inset-bottom, 8px)", fontFamily: SF, animation: "roomSheetUp 0.2s ease-out" }}>
        <div style={{ padding: "14px 18px 10px", fontSize: "13px", fontWeight: 800, color: colors.textSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", borderBottom: `1px solid ${colors.borderFaint}` }}>{event.title}</div>
        {!isDraft && <button onClick={onShare} style={row(false)}><Share2 size={17} color={colors.textMuted} /> Share</button>}
        <button onClick={onDuplicate} style={row(false)}><Copy size={17} color={colors.textMuted} /> Duplicate as a new draft</button>
        <button onClick={onDelete} style={row(true)}><Trash2 size={17} /> Delete</button>
        <button onClick={onClose} style={{ ...row(false), justifyContent: "center", borderBottom: "none", color: colors.textMuted }}>Cancel</button>
      </div>
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

// A cinematic poster — the cover IS the card (title + when · where on the
// bottom scrim). ONE click = go to the event (drafts → the editor). Quick
// actions (share / duplicate / delete) fade in top-right on hover; phones get
// a ⋯ that opens the same three as a sheet. Past events read cooler
// (desaturated + dimmed) so the wall separates "alive" from "memory" at a
// glance without reading a word.
function EventPosterCard({ event, isMobile, busy, going = false, onOpen, onShare, onDuplicate, onDelete, onMenu }) {
  const [hover, setHover] = useState(false);
  const live = event.status === "live";
  const isDraft = event.status === "draft";
  const isPast = event.status === "past";
  const fallback = event.poster || gradientFor(event.id);
  // Going face: the pill names your seat (Co-host/Guest), not the lifecycle —
  // and the card carries no host quick-actions (it isn't yours to run).
  const pillBg = going
    ? (event.isHost ? "rgba(236,23,143,0.88)" : "rgba(10,10,10,0.5)")
    : isDraft ? "rgba(180,83,9,0.9)" : live ? "rgba(22,163,74,0.92)" : "rgba(10,10,10,0.55)";
  const pillLabel = going ? (event.isHost ? "Co-host" : "Guest") : isDraft ? "Draft" : live ? "Live" : "Past";
  const meta = [event.when, event.location].filter(Boolean).join(" · ");
  const glass = {
    width: 30, height: 30, borderRadius: "50%", border: "none", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "rgba(10,10,10,0.52)", color: "#fff",
    backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)",
  };
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        // Phone: ~46vw so two posters sit full with a sliver of the third
        // peeking (reads as swipeable). Desktop: fixed 200, cinema 5:7.
        width: isMobile ? "46vw" : 200, maxWidth: isMobile ? 220 : undefined,
        aspectRatio: "5 / 7",
        scrollSnapAlign: isMobile ? "start" : undefined,
        flexShrink: 0, borderRadius: 20, position: "relative", overflow: "hidden",
        background: fallback, cursor: "pointer", fontFamily: SF, textAlign: "left",
        transform: hover && !isMobile ? "translateY(-3px)" : "none",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        boxShadow: hover && !isMobile ? "0 16px 34px rgba(10,10,10,0.22)" : "0 2px 10px rgba(10,10,10,0.08)",
      }}
    >
      {event.coverImage && (
        <img
          src={event.coverImage} alt=""
          onError={(e) => { e.currentTarget.style.display = "none"; }}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: isPast ? "grayscale(55%) contrast(0.96)" : "none", opacity: isPast ? 0.88 : 1 }}
        />
      )}
      <span style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.24) 0%, rgba(0,0,0,0) 34%, rgba(0,0,0,0.02) 52%, rgba(0,0,0,0.74) 100%)" }} />

      <span style={{ position: "absolute", top: 10, left: 10, fontSize: "9.5px", fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "#fff", background: pillBg, padding: "4px 9px", borderRadius: 999, backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>{pillLabel}</span>

      {/* Quick actions — hover-fade on desktop, an always-there ⋯ on phones.
          The going face has none: you enter this room, you don't run it. */}
      {going ? null : isMobile ? (
        <button onClick={stop(onMenu)} aria-label="Event actions" style={{ ...glass, position: "absolute", top: 8, right: 8 }}>
          <MoreHorizontal size={17} />
        </button>
      ) : (
        <div style={{ position: "absolute", top: 8, right: 8, display: "flex", gap: 6, opacity: hover ? 1 : 0, pointerEvents: hover ? "auto" : "none", transition: "opacity 0.15s ease" }}>
          {!isDraft && <button onClick={stop(onShare)} title="Share" style={glass}><Share2 size={14} /></button>}
          <button onClick={stop(onDuplicate)} title="Duplicate as a new draft" style={{ ...glass, opacity: busy ? 0.5 : 1 }}><Copy size={14} /></button>
          <button onClick={stop(onDelete)} title="Delete" style={{ ...glass, color: "#fca5a5" }}><Trash2 size={14} /></button>
        </div>
      )}

      <div style={{ position: "absolute", left: 12, right: 12, bottom: 11 }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "#fff", lineHeight: 1.22, letterSpacing: "-0.01em", textShadow: "0 1px 10px rgba(0,0,0,0.5)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{event.title}</div>
        {meta && (
          <div style={{ marginTop: 3, fontSize: "11.5px", fontWeight: 600, color: "rgba(255,255,255,0.88)", textShadow: "0 1px 8px rgba(0,0,0,0.5)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
        )}
        <div style={{ marginTop: 4, fontSize: "11.5px", fontWeight: 700, color: isDraft && !going ? "#fcd34d" : "rgba(255,255,255,0.72)", textShadow: "0 1px 8px rgba(0,0,0,0.5)" }}>
          {going ? "Enter room →" : isDraft ? "Finish & publish →" : `${event.comingCount}${event.capacity ? ` / ${event.capacity}` : ""} ${live ? "coming" : "came"}`}
        </div>
      </div>
    </div>
  );
}

// The clear primary action — leads the wall, filled accent, stretches to the
// posters' height so the row reads as one shelf.
function CreateTile({ onClick, isMobile }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: isMobile ? "34vw" : 148, maxWidth: isMobile ? 170 : undefined,
        scrollSnapAlign: isMobile ? "start" : undefined,
        alignSelf: "stretch",
        flexShrink: 0, borderRadius: 20,
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
