// DockMessages — the pullup chat, as a real two-pane messenger inside the dock.
// Contacts AND the open conversation live together (not drill-in/drill-out):
// filter the left, talk on the right. Every thread is space-rooted (host↔guest,
// the star) — your people, never strangers. Reuses /host/room (real data) +
// /host/room/message (omnichannel send via dispatch). Two-way: inbound threads.

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Search } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const CH = {
  whatsapp: { label: "WhatsApp", color: "#1fab54" },
  instagram: { label: "Instagram", color: "#d6249f" },
  email: { label: "Email", color: "#6b6b6b" },
};
const TINTS = [
  { bg: "rgba(236,23,143,0.13)", fg: "#ec178f" },
  { bg: "rgba(13,148,136,0.13)", fg: "#0d9488" },
  { bg: "rgba(234,88,12,0.13)", fg: "#ea580c" },
  { bg: "rgba(124,58,237,0.13)", fg: "#7c3aed" },
  { bg: "rgba(20,120,200,0.13)", fg: "#1478c8" },
];
function tint(name) { let h = 0; for (const c of String(name || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TINTS[h % TINTS.length]; }
function initials(name = "") { return String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }

function Avatar({ name, size = 32 }) {
  const t = tint(name);
  return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: t.bg, color: t.fg, fontWeight: 800, fontSize: Math.round(size * 0.38), letterSpacing: "-0.02em" }}>{initials(name)}</div>;
}

export default function DockMessages() {
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("needs"); // needs | all
  const [channel, setChannel] = useState("all"); // all | whatsapp | instagram | email
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const scroller = useRef(null);

  async function load() {
    try {
      const r = await authenticatedFetch("/host/room");
      const d = r.ok ? await r.json() : null;
      setPeople(d?.people || []);
    } catch { setPeople([]); }
  }
  useEffect(() => { load(); }, []);

  const open = useMemo(() => (people || []).find((p) => p.id === openId) || null, [people, openId]);
  const needsCount = (people || []).filter((p) => p.needsYou).length;

  const list = useMemo(() => {
    let ps = [...(people || [])];
    if (filter === "needs") ps = ps.filter((p) => p.needsYou);
    if (channel !== "all") ps = ps.filter((p) => (p.channel || "email") === channel);
    if (q.trim()) { const s = q.trim().toLowerCase(); ps = ps.filter((p) => (p.name || "").toLowerCase().includes(s)); }
    return ps.sort((a, b) => (a.needsYou === b.needsYou ? (b.warmth || 0) - (a.warmth || 0) : a.needsYou ? -1 : 1));
  }, [people, filter, channel, q]);

  const thread = useMemo(() => {
    if (!open) return [];
    return [...(open.thread || []), ...sent.filter((m) => m.personId === open.id)];
  }, [open, sent]);

  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [thread.length, openId]);

  async function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !open) return;
    const ch = open.channel || "email";
    setSending(true); setDraft("");
    setSent((s) => [...s, { personId: open.id, from: "you", text, time: "now" }]);
    try { await authenticatedFetch("/host/room/message", { method: "POST", body: JSON.stringify({ personId: open.id, channel: ch, text }) }); }
    finally { setSending(false); }
  }

  const ch = open ? (CH[open.channel] || CH.email) : null;
  const windowClosed = open?.channel === "whatsapp" && open?.windowOpen === false;

  return (
    <div style={{ display: "flex", height: "min(70vh, 520px)", margin: "0 -6px" }}>
      {/* ── Left: filterable contacts ─────────────────────────────────── */}
      <div style={{ width: 234, flexShrink: 0, borderRight: `1px solid ${colors.border}`, display: "flex", flexDirection: "column", paddingRight: 8 }}>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: colors.textFaded }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…"
            style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px 8px 28px", borderRadius: 9, border: `1px solid ${colors.border}`, fontSize: 12.5, outline: "none", color: colors.text }} />
        </div>
        <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
          <button onClick={() => setFilter("needs")} style={pill(filter === "needs")}>Needs you{needsCount ? ` ${needsCount}` : ""}</button>
          <button onClick={() => setFilter("all")} style={pill(filter === "all")}>Everyone</button>
        </div>
        <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
          {["all", "whatsapp", "instagram", "email"].map((c) => (
            <button key={c} onClick={() => setChannel(c)} title={c === "all" ? "All channels" : CH[c].label}
              style={{ ...pill(channel === c), padding: "4px 8px", fontSize: 10.5, color: channel === c ? "#fff" : (c === "all" ? colors.textMuted : CH[c].color) }}>
              {c === "all" ? "All" : CH[c].label.slice(0, 2).toUpperCase()}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", margin: "0 -4px" }}>
          {people === null && <div style={dim}>Loading…</div>}
          {people && list.length === 0 && <div style={dim}>{filter === "needs" ? "Nobody's waiting." : "No one here."}</div>}
          {list.map((p) => {
            const c = CH[p.channel] || CH.email;
            const on = p.id === openId;
            return (
              <button key={p.id} onClick={() => setOpenId(p.id)} style={{ display: "flex", gap: 9, alignItems: "center", width: "100%", padding: "8px 6px", border: "none", borderRadius: 9, background: on ? colors.accentSoft : "none", cursor: "pointer", textAlign: "left" }}>
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <Avatar name={p.name} size={30} />
                  {p.needsYou && <span style={{ position: "absolute", top: -1, right: -1, width: 8, height: 8, borderRadius: 999, background: colors.accent, border: `2px solid ${colors.background}` }} />}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: colors.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.needsYou && p.move ? p.move : (p.relationship || "")}</div>
                </div>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: c.color, flexShrink: 0 }} title={c.label} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: the open conversation ──────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", paddingLeft: 12 }}>
        {!open ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: colors.textFaded, fontSize: 13, padding: 20, lineHeight: 1.5 }}>
            Pick someone on the left — your conversations with the people in your rooms live here.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 9, paddingBottom: 10, borderBottom: `1px solid ${colors.border}` }}>
              <Avatar name={open.name} size={32} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{open.name}</div>
                <div style={{ fontSize: 11, color: ch.color, fontWeight: 600 }}>{ch.label}{windowClosed ? " · window closed" : ""}</div>
              </div>
            </div>
            <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: "12px 2px", display: "flex", flexDirection: "column", gap: 8 }}>
              {open.read && <div style={{ fontSize: 12, color: colors.textFaded, lineHeight: 1.5, marginBottom: 4 }}>{open.read}</div>}
              {thread.map((m, i) => {
                const mine = m.from === "you" || m.from === "system";
                return (
                  <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
                    <div style={{ padding: "8px 11px", borderRadius: mine ? "13px 13px 4px 13px" : "13px 13px 13px 4px", background: mine ? colors.accent : colors.surfaceMuted, color: mine ? "#fff" : colors.text, fontSize: 13, lineHeight: 1.4 }}>{m.text}</div>
                    {m.time && <div style={{ fontSize: 10, color: colors.textFaded, marginTop: 2, textAlign: mine ? "right" : "left" }}>{m.time}</div>}
                  </div>
                );
              })}
              {thread.length === 0 && !open.read && <div style={{ fontSize: 12.5, color: colors.textFaded }}>No history yet. Say hi.</div>}
            </div>
            <form onSubmit={send} style={{ display: "flex", gap: 6, paddingTop: 10, borderTop: `1px solid ${colors.border}` }}>
              <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message on ${ch.label}…`}
                style={{ flex: 1, padding: "9px 11px", borderRadius: 10, border: `1px solid ${colors.border}`, fontSize: 13, outline: "none", color: colors.text }} />
              <button type="submit" disabled={sending || !draft.trim()} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: colors.accent, color: "#fff", borderRadius: 10, padding: "0 13px", cursor: "pointer", opacity: draft.trim() ? 1 : 0.5 }} aria-label="Send"><Send size={15} /></button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const dim = { fontSize: 12.5, color: colors.textFaded, padding: 8 };
const pill = (on) => ({ padding: "5px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent : "transparent", color: on ? "#fff" : colors.textMuted, whiteSpace: "nowrap" });
