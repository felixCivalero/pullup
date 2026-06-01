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
import { ROOM_EVENT, ROOM_BRIEF, ROOM_PEOPLE } from "../components/room/roomFixtures.js";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

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

export default function EventRoomPage() {
  const { id } = useParams();
  const { setEventNav } = useEventNav();
  const [selectedId, setSelectedId] = useState(null);

  // Dummy event for now; sets the top-bar nav like the other event pages.
  useEffect(() => {
    setEventNav({
      title: ROOM_EVENT.title,
      slug: "sunset-vol-4",
      status: "LIVE",
      guestsCount: ROOM_EVENT.comingCount,
      myRole: "host",
    });
  }, [setEventNav]);

  // Rank: who needs you first, then by warmth. Stage stays backstage.
  const ranked = useMemo(() => {
    return [...ROOM_PEOPLE].sort((a, b) => {
      if (a.needsYou !== b.needsYou) return a.needsYou ? -1 : 1;
      return b.warmth - a.warmth;
    });
  }, []);

  const selected = ranked.find((p) => p.id === selectedId) || null;
  const needsCount = ranked.filter((p) => p.needsYou).length;

  return (
    <div style={{ display: "flex", height: "100vh", paddingTop: "58px", boxSizing: "border-box" }}>
      {/* Left: the room */}
      <div
        style={{
          flex: selected ? "1 1 0" : "1 1 100%",
          overflowY: "auto",
          transition: "flex 0.2s ease",
          minWidth: 0,
        }}
      >
        <div style={{ maxWidth: "720px", margin: "0 auto", padding: "28px 20px 60px" }}>
          {/* Title */}
          <div style={{ marginBottom: "20px" }}>
            <h1 style={{ fontSize: "26px", fontWeight: 750, color: colors.text, margin: "0 0 4px", letterSpacing: "-0.02em", fontFamily: SF }}>
              The Room
            </h1>
            <div style={{ fontSize: "13.5px", color: colors.textMuted }}>
              {ROOM_EVENT.comingCount} coming · {ROOM_EVENT.capacity - ROOM_EVENT.comingCount} spots left
              {needsCount > 0 && <> · <span style={{ color: colors.accent, fontWeight: 600 }}>{needsCount} need you</span></>}
            </div>
          </div>

          <Brief brief={ROOM_BRIEF} onOpenPerson={setSelectedId} />

          {/* People as living threads */}
          <div>
            {ranked.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                active={p.id === selectedId}
                onClick={() => setSelectedId(p.id === selectedId ? null : p.id)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Right: thread panel, in place */}
      {selected && (
        <div
          style={{
            width: "420px",
            flexShrink: 0,
            borderLeft: `1px solid ${colors.border}`,
            background: colors.surface,
            height: "100%",
            boxShadow: "-12px 0 40px rgba(10,10,10,0.04)",
          }}
        >
          <ThreadPanel person={selected} onClose={() => setSelectedId(null)} />
        </div>
      )}
    </div>
  );
}
