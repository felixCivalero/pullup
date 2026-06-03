// frontend/src/pages/EventRoomPage.jsx
//
// THE ROOM — PullUp as the host's chief-of-staff for one event.
//
// This is the heart of the product's narrowing (see "The Room" direction,
// 2026-05-31). It is NOT a funnel, a CRM table, or a stage board. It's a
// conversational surface: PullUp reads the whole room out loud (the brief),
// then shows the people as living threads ranked by who needs the host now.
// Depth/closeness is surfaced as a FEELING (a plain sentence + a soft heat
// dot), never a status badge or a column the host has to sort.
//
// Locked interaction: tapping a person opens their thread in a SIDE PANEL,
// in place — the room stays visible while you work each person.
//
// Currently rendered against seeded dummy data (roomFixtures.js) so we can
// design against a lived multi-channel reality. The real /events/:id/room
// endpoint will return the same shape later.

import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useEventNav } from "../contexts/EventNavContext.jsx";
import { colors } from "../theme/colors.js";
import { PullupEyes } from "../components/PullupEyes.jsx";
import { authenticatedFetch } from "../lib/api.js";
import { RoomAccessSettings } from "../components/RoomAccessSettings.jsx";
import RoomConversation from "../components/room/RoomConversation.jsx";
import { MessageSquare } from "lucide-react";
import { ROOM_EVENT, ROOM_BRIEF, ROOM_PEOPLE } from "../components/room/roomFixtures.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

// ─── Faces ───────────────────────────────────────────────────────────
// A closed group feels like one when you can see the people in it. Soft
// warm tints, picked deterministically by name, so the same person is
// always the same colour — quietly alive, never loud.
const AVATAR_TINTS = [
  { bg: "rgba(236, 23, 143, 0.12)", fg: "#ec178f" }, // pink
  { bg: "rgba(13, 148, 136, 0.12)", fg: "#0d9488" }, // teal
  { bg: "rgba(234, 88, 12, 0.12)",  fg: "#ea580c" }, // amber
  { bg: "rgba(124, 58, 237, 0.12)", fg: "#7c3aed" }, // violet
  { bg: "rgba(20, 120, 200, 0.12)", fg: "#1478c8" }, // blue
];
function tintFor(name) {
  let h = 0;
  for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}
function initialsOf(name) {
  return String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}
function FaceAvatar({ name, size = 28 }) {
  const t = tintFor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: t.bg, color: t.fg, fontWeight: 800, fontFamily: SF,
      fontSize: Math.round(size * 0.38), letterSpacing: "-0.02em",
    }}>{initialsOf(name)}</div>
  );
}
// "Pia, Cole & Nadia" / "Pia, Cole & 4 more" — the room said as a sentence.
function firstNames(list, max = 3) {
  const ns = (list || []).map((p) => String(p.name || "").split(/\s+/)[0]).filter(Boolean);
  if (ns.length === 0) return "";
  if (ns.length === 1) return ns[0];
  if (ns.length <= max) return ns.slice(0, -1).join(", ") + " & " + ns[ns.length - 1];
  return `${ns.slice(0, 2).join(", ")} & ${ns.length - 2} more`;
}

// ─── Storage: the room renders from YOUR cloud, never ours ───────────
//
// The federated stance made literal: content lives in the connected cloud
// (Drive / iCloud / Dropbox), PullUp holds only the ledger and renders. The
// real OAuth rail is the backend brick still to come — this wires the FRONT
// of it: the connect moment + the per-folder sharing verb. State is local
// (no backend yet), but the grammar is real.

// Where the bytes can live. "floor" is PullUp's thin temporary holding —
// the thing we actively want to empty as people connect their own cloud.
const STORAGE_PROVIDERS = [
  { key: "gdrive", label: "Google Drive", hint: "an app-folder, only we touch it" },
  { key: "icloud", label: "iCloud Photos", hint: "your Apple library" },
  { key: "dropbox", label: "Dropbox", hint: "your own folder" },
  { key: "floor", label: "PullUp floor", hint: "temporary — move it home later" },
];

// The verb a folder grants by default. A bead inherits its folder's verb
// unless someone changes it. See = look only · Ask = request to keep ·
// Take = yours forever (the irrevocable gift) · Pay = a copy, coming soon.
const SHARE_VERBS = {
  see:  { label: "See",        note: "look, don't keep",  color: colors.textSubtle, bg: colors.surfaceMuted,  border: colors.border },
  ask:  { label: "Ask",        note: "request to keep",   color: colors.secondary,  bg: colors.secondarySoft, border: colors.secondaryBorder },
  take: { label: "Take",       note: "yours to keep",     color: colors.accent,     bg: colors.accentSoft,    border: colors.accentBorder },
  pay:  { label: "Pay · soon", note: "buy a copy",        color: colors.textFaded,  bg: "transparent",        border: colors.border, soon: true },
};
const VERB_CYCLE = ["see", "ask", "take", "pay"];

function VerbChip({ verb, onCycle }) {
  const v = SHARE_VERBS[verb];
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      title={`${v.label} — ${v.note} (tap to change)`}
      style={{
        alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px",
        fontSize: "10.5px", fontWeight: 700, color: v.color, background: v.bg,
        border: `1px solid ${v.border}`, borderRadius: "999px", padding: "2px 8px",
        cursor: "pointer", lineHeight: 1.4, fontFamily: SF,
        opacity: v.soon ? 0.7 : 1,
      }}
    >
      {v.label}
    </button>
  );
}

function StorageFolders() {
  const [provider, setProvider] = useState(null);   // null = not connected yet
  const [picking, setPicking] = useState(false);
  const [verbs, setVerbs] = useState({ all: "see", group: "take", after: "see" });

  const connected = STORAGE_PROVIDERS.find((p) => p.key === provider);
  const folders = [
    { key: "all", label: "All photos", hint: "everything dropped here" },
    { key: "group", label: "Group shot", hint: "the one with everyone" },
    { key: "after", label: "Afters", hint: "what happened later" },
    { key: "add", label: "+ New folder", hint: "", add: true },
  ];

  const cycleVerb = (key) => setVerbs((prev) => {
    const cur = prev[key] || "see";
    const next = VERB_CYCLE[(VERB_CYCLE.indexOf(cur) + 1) % VERB_CYCLE.length];
    return { ...prev, [key]: next };
  });

  return (
    <div style={{ marginBottom: "24px" }}>
      {/* Header — STORAGE + the connect state on the right */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.06em" }}>Storage</div>
        {connected ? (
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 600,
              color: colors.secondary, background: colors.secondarySoft, border: `1px solid ${colors.secondaryBorder}`,
              borderRadius: "999px", padding: "3px 10px", cursor: "pointer", fontFamily: SF,
            }}
          >
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: colors.secondary }} />
            {connected.label} · connected
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPicking((p) => !p)}
            style={{
              fontSize: "11.5px", fontWeight: 700, color: colors.accent, background: colors.accentSoft,
              border: `1px solid ${colors.accentBorder}`, borderRadius: "999px", padding: "4px 12px",
              cursor: "pointer", fontFamily: SF,
            }}
          >
            Connect storage
          </button>
        )}
      </div>

      {/* The thesis, said plainly — only while unconnected */}
      {!connected && !picking && (
        <div style={{
          fontSize: "12px", color: colors.textMuted, background: colors.accentSoft,
          border: `1px solid ${colors.accentBorder}`, borderRadius: "12px",
          padding: "9px 12px", marginBottom: "12px", lineHeight: 1.5,
        }}>
          Your photos live in <b style={{ color: colors.text }}>your</b> cloud — PullUp just renders the room from them. Connect one to fill these folders.
        </div>
      )}

      {/* Provider picker */}
      {picking && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "12px",
          padding: "10px", borderRadius: "12px", border: `1px solid ${colors.border}`, background: colors.surface,
        }}>
          {STORAGE_PROVIDERS.map((p) => {
            const active = p.key === provider;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => { setProvider(p.key); setPicking(false); }}
                style={{
                  textAlign: "left", padding: "9px 11px", borderRadius: "10px", cursor: "pointer", fontFamily: SF,
                  border: `1px solid ${active ? colors.accentBorder : colors.border}`,
                  background: active ? colors.accentSoft : "transparent",
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 700, color: colors.text }}>{p.label}</div>
                {p.hint && <div style={{ fontSize: "11px", color: colors.textFaded, marginTop: "1px" }}>{p.hint}</div>}
              </button>
            );
          })}
        </div>
      )}

      {/* Folder grid — thin rows now; dim until a cloud is behind it */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", opacity: connected ? 1 : 0.55, transition: "opacity .2s" }}>
        {folders.map((f) => (
          <div key={f.key} style={{
            minHeight: "56px", borderRadius: "12px", padding: "10px 12px",
            border: `1px ${f.add ? "dashed" : "solid"} ${colors.border}`,
            background: f.add ? "transparent" : colors.surface,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
            cursor: "pointer",
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "13.5px", fontWeight: 700, color: f.add ? colors.textMuted : colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.label}</div>
              {f.hint && <div style={{ fontSize: "11px", color: colors.textFaded, marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.hint}</div>}
            </div>
            {!f.add && <VerbChip verb={verbs[f.key] || "see"} onCycle={() => cycleVerb(f.key)} />}
          </div>
        ))}
      </div>

      {/* Low-key: where the bytes actually live */}
      {connected && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: colors.textFaded, marginTop: "9px" }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: colors.secondary, flexShrink: 0 }} />
          Saved to your {connected.label} — PullUp renders it, never holds it.
        </div>
      )}
    </div>
  );
}

// The host's view of the event's COLLECTIVE conversation, organised into TOPICS
// (host holds the pen — can open new topics). Real data, above the mockup below.
function HostRoomSpace({ eventId, roster }) {
  const api = useMemo(() => ({
    loadChannels: () => authenticatedFetch(`/host/events/${eventId}/channels`).then((r) => (r.ok ? r.json().then((d) => d.channels || []) : [])),
    loadMessages: (cid) => authenticatedFetch(`/host/events/${eventId}/space?channelId=${cid}`).then((r) => (r.ok ? r.json().then((d) => d.messages || []) : [])),
    post: (cid, body) => authenticatedFetch(`/host/events/${eventId}/space`, { method: "POST", body: JSON.stringify({ body, channelId: cid }) }).then((r) => (r.ok ? r.json().then((d) => d.messages || []) : [])),
    createTopic: (name) => authenticatedFetch(`/host/events/${eventId}/channels`, { method: "POST", body: JSON.stringify({ name }) }).then((r) => (r.ok ? r.json().then((d) => d.channels || null) : null)),
  }), [eventId]);

  const here = roster?.pulledUp || [];

  return (
    <div style={{ marginBottom: "24px", border: `1px solid ${colors.borderStrong}`, borderRadius: "18px", padding: "18px 20px", background: colors.background, boxShadow: "0 1px 2px rgba(10,10,10,0.03), 0 12px 32px rgba(10,10,10,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: here.length ? "13px" : "14px" }}>
        <div style={{ width: 28, height: 28, borderRadius: "9px", background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MessageSquare size={15} color={colors.accent} strokeWidth={2.4} />
        </div>
        <div style={{ fontSize: "15px", fontWeight: 750, color: colors.text, letterSpacing: "-0.01em" }}>
          The Room
          <span style={{ fontSize: "12.5px", fontWeight: 500, color: colors.textFaded, letterSpacing: 0 }}> · a closed circle — only people who pulled up</span>
        </div>
      </div>

      {/* The people in the circle — faces first, so it reads like a group, not a feed */}
      {here.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "11px", marginBottom: "14px", paddingBottom: "14px", borderBottom: `1px solid ${colors.borderFaint}` }}>
          <div style={{ display: "flex" }}>
            {here.slice(0, 6).map((p, i) => (
              <div key={p.id} style={{ marginLeft: i === 0 ? 0 : "-8px", borderRadius: "50%", boxShadow: `0 0 0 2px ${colors.surface}` }}>
                <FaceAvatar name={p.name} size={30} />
              </div>
            ))}
          </div>
          <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.4 }}>
            <b style={{ color: colors.text }}>{firstNames(here)}</b> {here.length === 1 ? "is" : "are"} here
            <span style={{ color: colors.textFaded }}> · and you</span>
          </div>
        </div>
      )}

      <RoomConversation canCreateTopic sidebar api={api} />
    </div>
  );
}

// ─── Channel identity ───────────────────────────────────────────────
// Each rail gets a quiet visual signature. The host never picks a channel;
// PullUp shows where the person is reachable right now.
const CHANNELS = {
  whatsapp: { label: "WhatsApp", color: "#25D366", soft: "#e7f9ee", glyph: "✆" },
  instagram: { label: "Instagram", color: "#d6249f", soft: "#fdeef7", glyph: "◎" },
  email: { label: "Email", color: "#6b6b6b", soft: "#f0f0ee", glyph: "✉" },
};

function ChannelChip({ channel, windowOpen, windowNote }) {
  const c = CHANNELS[channel] || CHANNELS.email;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        fontSize: "11px",
        fontWeight: 600,
        color: c.color,
        background: c.soft,
        padding: "3px 9px",
        borderRadius: "999px",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: "11px" }}>{c.glyph}</span>
      {c.label}
      {windowOpen === true && (
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: c.color,
            boxShadow: `0 0 0 3px ${c.soft}`,
          }}
          title={windowNote || "open"}
        />
      )}
    </span>
  );
}

// Warmth as a feeling, not a number. A soft ascending heat: faint → pink.
function HeatDot({ warmth }) {
  const fill =
    warmth >= 0.8 ? colors.accent
    : warmth >= 0.55 ? "#f472b6"
    : warmth >= 0.35 ? "#f9a8d4"
    : colors.borderStrong;
  return (
    <span
      title="how close they are to you"
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: fill,
        flexShrink: 0,
        display: "inline-block",
      }}
    />
  );
}

function Avatar({ initials, color, size = 44 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.36,
        fontWeight: 700,
        letterSpacing: "0.02em",
        flexShrink: 0,
        fontFamily: SF,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Person card — a living thread, ranked by who-needs-you ─────────
function PersonCard({ person, active, onClick }) {
  const [hover, setHover] = useState(false);
  const lm = person.lastMessage;
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        gap: "14px",
        width: "100%",
        textAlign: "left",
        padding: "16px",
        borderRadius: "16px",
        border: `1px solid ${active ? colors.accentBorder : colors.border}`,
        background: active ? colors.accentSoft : hover ? colors.surfaceMuted : colors.surface,
        cursor: "pointer",
        transition: "background 0.15s ease, border-color 0.15s ease",
        fontFamily: SF,
        marginBottom: "10px",
      }}
    >
      <Avatar initials={person.initials} color={person.color} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: name + heat + channel */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
          <HeatDot warmth={person.warmth} />
          <span
            style={{
              fontSize: "14.5px",
              fontWeight: 650,
              color: colors.text,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {person.name}
          </span>
          <span style={{ marginLeft: "auto", flexShrink: 0 }}>
            <ChannelChip channel={person.channel} windowOpen={person.windowOpen} windowNote={person.windowNote} />
          </span>
        </div>

        {/* Row 2: PullUp's read — the relationship as a feeling */}
        <div style={{ fontSize: "13px", color: colors.textMuted, lineHeight: 1.45, marginBottom: lm || person.needsYou ? "8px" : 0 }}>
          {person.read}
        </div>

        {/* Row 3: last message preview */}
        {lm && (
          <div style={{ display: "flex", alignItems: "baseline", gap: "6px", fontSize: "12.5px", color: colors.textSubtle }}>
            <span style={{ color: lm.from === "them" ? colors.text : colors.textSubtle, fontWeight: lm.from === "them" ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lm.from === "them" ? "" : lm.from === "you" ? "You: " : ""}{lm.text}
            </span>
            <span style={{ marginLeft: "auto", flexShrink: 0, color: colors.textFaded }}>{lm.time}</span>
          </div>
        )}

        {/* Row 4: the one suggested move */}
        {person.needsYou && person.move && (
          <div
            style={{
              marginTop: "10px",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              fontWeight: 600,
              color: colors.accent,
              background: colors.surface,
              border: `1px solid ${colors.accentBorder}`,
              padding: "5px 11px",
              borderRadius: "999px",
            }}
          >
            → {person.move}
          </div>
        )}
      </div>
    </button>
  );
}

// ─── Side panel: one person's thread, opened in place ───────────────
function ThreadPanel({ person, onClose }) {
  const [draft, setDraft] = useState("");
  // The rail this reply will ride. Defaults to PullUp's auto-pick (the rail
  // the person is reachable on right now), but the host can override — answer
  // an email on WhatsApp, say. When they cross channels we'll bridge it.
  const [rail, setRail] = useState(person.channel);

  // The channel the person last reached the host on — what they'd "expect" a
  // reply to land on. If the host's chosen rail differs, we prepend a bridge.
  const lastInboundChannel = useMemo(() => {
    const inbound = [...person.thread].reverse().find((m) => m.from === "them");
    return inbound?.channel || person.channel;
  }, [person]);

  const reachable = person.reachable || [person.channel];
  const c = CHANNELS[rail] || CHANNELS.email;
  const crossing = rail !== lastInboundChannel;

  // Reset composer + rail to the auto-pick whenever we open a new person.
  useEffect(() => {
    setDraft("");
    setRail(person.channel);
  }, [person.id, person.channel]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: SF,
      }}
    >
      {/* Panel header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "18px 18px 16px", borderBottom: `1px solid ${colors.border}` }}>
        <Avatar initials={person.initials} color={person.color} size={40} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: "15px", fontWeight: 700, color: colors.text }}>{person.name}</div>
          <div style={{ fontSize: "12px", color: colors.textSubtle }}>{person.handle}</div>
        </div>
        <ChannelChip channel={person.channel} windowOpen={person.windowOpen} windowNote={person.windowNote} />
        <button
          onClick={onClose}
          style={{ width: 30, height: 30, borderRadius: "50%", border: "none", background: colors.surfaceMuted, color: colors.textMuted, fontSize: "16px", cursor: "pointer", flexShrink: 0 }}
        >
          ×
        </button>
      </div>

      {/* PullUp's read of this person */}
      <div style={{ padding: "14px 18px", background: colors.surfaceMuted, borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ fontSize: "12.5px", color: colors.textMuted, lineHeight: 1.5, marginBottom: "8px" }}>{person.read}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {person.signals.map((s, i) => (
            <span key={i} style={{ fontSize: "11px", color: colors.textMuted, background: colors.surface, border: `1px solid ${colors.border}`, padding: "3px 9px", borderRadius: "999px" }}>
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* Thread — ONE conversation, no matter which channel each message
          came through. This is the moat: Sara found you on Instagram, RSVP'd
          by email, now asks about parking on WhatsApp — the host sees a single
          continuous timeline and PullUp tracks which rail each message rode.
          A subtle divider marks when the conversation moved channels. */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: "10px" }}>
        {person.thread.map((m, i) => {
          // Channel-switch divider: when this message rode a different rail
          // than the previous one, mark the handoff so the cross-channel
          // stitching is legible rather than invisible.
          const prev = person.thread[i - 1];
          const mch = m.channel || person.channel;
          const pch = prev ? prev.channel || person.channel : null;
          const switched = prev && mch !== pch;
          const ch = CHANNELS[mch] || CHANNELS.email;

          const divider = switched ? (
            <div key={`d${i}`} style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 4px" }}>
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
                <div
                  style={{
                    maxWidth: "78%",
                    padding: "9px 13px",
                    borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                    background: mine ? colors.accent : colors.surfaceMuted,
                    color: mine ? "#fff" : colors.text,
                    fontSize: "13.5px",
                    lineHeight: 1.45,
                  }}
                >
                  {m.text}
                </div>
                <span style={{ fontSize: "10.5px", color: colors.textFaded, marginTop: "3px", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                  <span style={{ color: ch.color, fontWeight: 600 }}>{ch.glyph}</span>
                  {m.time}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{ borderTop: `1px solid ${colors.border}`, padding: "12px 14px" }}>
        {person.needsYou && person.move && !draft && (
          <button
            onClick={() => setDraft(suggestedDraft(person))}
            style={{ display: "block", width: "100%", textAlign: "left", marginBottom: "10px", fontSize: "12.5px", color: colors.accent, background: colors.accentSoft, border: `1px solid ${colors.accentBorder}`, borderRadius: "12px", padding: "10px 12px", cursor: "pointer", lineHeight: 1.4 }}
          >
            <span style={{ fontWeight: 700 }}>Suggested:</span> {suggestedDraft(person)}
          </button>
        )}

        {/* Rail selector — PullUp auto-picks, host can override. Reachable
            rails only; the active one is filled, the rest are quiet options. */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "9px" }}>
          <span style={{ fontSize: "11px", color: colors.textSubtle, marginRight: "2px" }}>Send on</span>
          {reachable.map((r) => {
            const rc = CHANNELS[r] || CHANNELS.email;
            const isAuto = r === person.channel;
            const on = r === rail;
            return (
              <button
                key={r}
                onClick={() => setRail(r)}
                title={isAuto ? "PullUp's pick" : undefined}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "5px",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: on ? "#fff" : rc.color,
                  background: on ? rc.color : rc.soft,
                  border: `1px solid ${on ? rc.color : "transparent"}`,
                  padding: "4px 10px",
                  borderRadius: "999px",
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "9px", fontWeight: 800 }}>{rc.glyph}</span>
                {rc.label}
                {isAuto && <span style={{ fontSize: "9px", opacity: 0.8 }}>{on ? "" : "· pick"}</span>}
              </button>
            );
          })}
        </div>

        {/* Cross-channel bridge: when the host answers on a different rail than
            the one the guest wrote on, PullUp prepends an orienting line so the
            guest isn't confused getting a WhatsApp about an email they sent. */}
        {crossing && (
          <div style={{ fontSize: "11px", color: colors.secondary, background: colors.secondarySoft, border: `1px solid ${colors.secondaryBorder}`, borderRadius: "10px", padding: "8px 11px", marginBottom: "9px", lineHeight: 1.45 }}>
            They last wrote on <strong>{(CHANNELS[lastInboundChannel] || CHANNELS.email).label}</strong>. PullUp will open with:{" "}
            <em style={{ color: colors.text }}>
              "Replying here on {c.label} to your {(CHANNELS[lastInboundChannel] || CHANNELS.email).label.toLowerCase()} —"
            </em>
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              rail === "whatsapp" && person.windowOpen === false
                ? `Window closed — sends as a WhatsApp template`
                : `Message ${person.name.split(" ")[0]} on ${c.label}…`
            }
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              border: `1px solid ${colors.border}`,
              borderRadius: "12px",
              padding: "10px 12px",
              fontSize: "13.5px",
              fontFamily: SF,
              color: colors.text,
              outline: "none",
            }}
          />
          <button
            disabled={!draft.trim()}
            style={{
              padding: "10px 16px",
              borderRadius: "999px",
              border: "none",
              background: draft.trim() ? colors.accent : colors.surfaceMuted,
              color: draft.trim() ? "#fff" : colors.textFaded,
              fontWeight: 700,
              fontSize: "13px",
              cursor: draft.trim() ? "pointer" : "default",
              flexShrink: 0,
              height: "fit-content",
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

// A throwaway draft generator so the suggested message feels real in the mock.
function suggestedDraft(person) {
  const first = person.name.split(" ")[0];
  switch (person.id) {
    case "p_sara": return `Metro's easiest — Medborgarplatsen, 4 min walk. Street parking's a pain on Saturdays. Can't wait to see you both!`;
    case "p_adam": return `Noah's in — bring him! Always good to have you, Adam.`;
    case "p_lina": return `Hey ${first}! Saw you peeking 👀 Vol. 4's shaping up beautifully — would love to have you back. Want me to hold you a spot?`;
    case "p_tobias": return `Welcome ${first}! So glad you found us. Anything you want to know before Saturday?`;
    case "p_emma": return `${first} — two spots just opened. You're in if you still want it 🙌`;
    case "p_marcus": return `Hey ${first}! Doing another rooftop night Saturday — your kind of crowd. Want the details?`;
    case "p_nadia": return `Same energy, even better view this time 🌇 Here's the link — ${first}, would love to have you: pullup.se/e/sunset-vol-4`;
    default: return `Hey ${first} —`;
  }
}

// ─── The brief — PullUp reading the room out loud ───────────────────
function Brief({ brief, onOpenPerson }) {
  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: "20px",
        padding: "20px 22px",
        background: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.surfaceMuted} 100%)`,
        marginBottom: "24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <PullupEyes variant="small" style={{ width: "26px", height: "22px", display: "block" }} />
        <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: colors.textSubtle }}>
          Here's where things stand
        </span>
      </div>

      {/* Pulse + the one urgent thing (tap to jump in) */}
      <p style={{ margin: "0 0 14px", fontSize: "16px", lineHeight: 1.6, fontFamily: SF, letterSpacing: "-0.01em" }}>
        <span style={{ color: colors.text }}>{brief.lead} </span>
        <button
          onClick={() => onOpenPerson(brief.urgent.personId)}
          style={{
            border: "none", background: "transparent", padding: 0, margin: 0, font: "inherit",
            color: colors.accent, fontWeight: 600, cursor: "pointer", textAlign: "left",
            textDecoration: "underline", textDecorationColor: colors.accentBorder, textUnderlineOffset: "3px",
          }}
        >
          {brief.urgent.text}
        </button>
      </p>

      {/* Quick moves — each jumps into that person's thread */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        {brief.moves.map((m) => (
          <button
            key={m.personId}
            onClick={() => onOpenPerson(m.personId)}
            style={{
              display: "inline-flex", alignItems: "center", gap: "7px",
              fontSize: "12.5px", fontFamily: SF, color: colors.text,
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: "999px", padding: "6px 12px", cursor: "pointer",
              transition: "border-color 0.15s ease, background 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.accentBorder; e.currentTarget.style.background = colors.accentSoft; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border; e.currentTarget.style.background = colors.surface; }}
          >
            <span style={{ fontWeight: 600 }}>{m.label}</span>
            <span style={{ color: colors.textSubtle }}>· {m.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Roster — who's in the room, on the lifecycle: RSVP'd (coming) first, then
// pull-up-only (showed). The shared area's "who's here", not a CRM of threads.
// RosterStrip — presence as a small global line under the title: a face-pile
// per state + a quiet count. The full member list lives in Guests; here it's
// just "who's around", glanceable.
function RosterStrip({ roster }) {
  if (!roster) return null;
  const up = roster.pulledUp || [];
  const coming = roster.coming || [];
  if (!up.length && !coming.length) return null;

  const Cluster = ({ people, label, accent }) => {
    if (!people.length) return null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
        <div style={{ display: "flex" }}>
          {people.slice(0, 5).map((p, i) => (
            <div key={p.id} title={p.name} style={{ marginLeft: i === 0 ? 0 : "-7px", borderRadius: "50%", boxShadow: "0 0 0 2px #fff" }}>
              <FaceAvatar name={p.name} size={26} />
            </div>
          ))}
          {people.length > 5 && (
            <div style={{ marginLeft: "-7px", width: 26, height: 26, borderRadius: "50%", boxShadow: "0 0 0 2px #fff", background: colors.surfaceMuted, color: colors.textMuted, fontSize: 10.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SF }}>+{people.length - 5}</div>
          )}
        </div>
        <span style={{ fontSize: "12.5px", fontWeight: accent ? 700 : 600, color: accent ? colors.accent : colors.textMuted }}>
          {people.length} {label}
        </span>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "20px", flexWrap: "wrap", marginTop: "14px" }}>
      <Cluster people={up} label="pulled up" accent />
      <Cluster people={coming} label="coming" />
    </div>
  );
}

export default function EventRoomPage() {
  const { id } = useParams();
  const { setEventNav } = useEventNav();
  const [roster, setRoster] = useState(null);

  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/host/events/${id}/roster`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d) return;
        setRoster(d);
        setEventNav({ title: d.event?.title || "Event", status: d.event?.ended ? "PASSED" : (d.event?.status || "LIVE"), guestsCount: d.pulledUpCount, myRole: "host" });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [id, setEventNav]);

  const ev = roster?.event;
  const when = ev?.startsAt ? new Date(ev.startsAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : null;

  return (
    <div style={{ display: "flex", height: "100vh", paddingTop: "58px", boxSizing: "border-box" }}>
      <div style={{ flex: "1 1 100%", overflowY: "auto", minWidth: 0 }}>
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "28px 20px 60px" }}>
          {/* Event identity — this room IS this event. */}
          <div style={{ marginBottom: "22px" }}>
            {/* Banner: always a soft branded gradient; the cover paints over it
                only if it actually loads (a missing/broken URL just shows the
                gradient — never a broken-image icon). */}
            <div style={{ height: 150, borderRadius: "18px", overflow: "hidden", marginBottom: "14px", background: "linear-gradient(135deg, #fde7f3 0%, #f4f4f5 55%, #e7f9f5 100%)" }}>
              {ev?.cover && (
                <img src={ev.cover} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              )}
            </div>
            <h1 style={{ fontSize: "26px", fontWeight: 750, color: colors.text, margin: "0 0 4px", letterSpacing: "-0.02em", fontFamily: SF }}>
              {ev?.title || "The Room"}
            </h1>
            <div style={{ fontSize: "13.5px", color: colors.textMuted }}>
              {[when, ev?.location].filter(Boolean).join(" · ") || " "}
            </div>
            <RosterStrip roster={roster} />
          </div>

          <StorageFolders />

          <HostRoomSpace eventId={id} roster={roster} />

          <RoomAccessSettings eventId={id} />
        </div>
      </div>
    </div>
  );
}
