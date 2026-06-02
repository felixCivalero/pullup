// DockMessages — the pullup chat, compact, inside the floating dock. The same
// space-rooted threads as the Room (host↔guest, the star), surfaced as a quick
// inbox: who needs a reply first, tap in, send on whatever channel they're
// reachable on. NOT a place to message strangers — every thread is someone in
// your rooms. Reuses /host/room (real data) + /host/room/message (omnichannel
// send via dispatch). Now two-way: inbound replies thread in as well.

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Send } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const CH = {
  whatsapp: { label: "WhatsApp", color: "#1fab54" },
  instagram: { label: "Instagram", color: "#d6249f" },
  email: { label: "Email", color: "#6b6b6b" },
};

function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

export default function DockMessages() {
  const [people, setPeople] = useState(null);
  const [filter, setFilter] = useState("needs"); // needs | all
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]); // optimistic, this session
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
  const list = useMemo(() => {
    const ps = people || [];
    const ranked = [...ps].sort((a, b) => (a.needsYou === b.needsYou ? (b.warmth || 0) - (a.warmth || 0) : a.needsYou ? -1 : 1));
    return filter === "needs" ? ranked.filter((p) => p.needsYou) : ranked;
  }, [people, filter]);

  const thread = useMemo(() => {
    if (!open) return [];
    return [...(open.thread || []), ...sent.filter((m) => m.personId === open.id)];
  }, [open, sent]);

  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [thread.length, openId]);

  async function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || !open) return;
    const channel = open.channel || "email";
    setSending(true);
    setDraft("");
    setSent((s) => [...s, { personId: open.id, from: "you", text, time: "now" }]);
    try {
      await authenticatedFetch("/host/room/message", {
        method: "POST",
        body: JSON.stringify({ personId: open.id, channel, text }),
      });
    } finally { setSending(false); }
  }

  // ── A single conversation ──────────────────────────────────────────────
  if (open) {
    const ch = CH[open.channel] || CH.email;
    const windowClosed = open.channel === "whatsapp" && open.windowOpen === false;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "min(66vh, 480px)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingBottom: 10, borderBottom: `1px solid ${colors.border}` }}>
          <button onClick={() => { setOpenId(null); setDraft(""); }} style={iconBtn} aria-label="Back"><ChevronLeft size={18} /></button>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: colors.surfaceMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: colors.textMuted }}>{initials(open.name)}</div>
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
              <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
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
          <button type="submit" disabled={sending || !draft.trim()} style={{ ...iconBtn, background: colors.accent, color: "#fff", borderRadius: 10, padding: "0 12px", opacity: draft.trim() ? 1 : 0.5 }} aria-label="Send"><Send size={15} /></button>
        </form>
      </div>
    );
  }

  // ── The inbox list ──────────────────────────────────────────────────────
  const needsCount = (people || []).filter((p) => p.needsYou).length;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "min(66vh, 480px)" }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        <button onClick={() => setFilter("needs")} style={pill(filter === "needs")}>Needs you{needsCount ? ` · ${needsCount}` : ""}</button>
        <button onClick={() => setFilter("all")} style={pill(filter === "all")}>Everyone</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {people === null && <div style={{ fontSize: 12.5, color: colors.textFaded, padding: 8 }}>Loading…</div>}
        {people && list.length === 0 && <div style={{ fontSize: 12.5, color: colors.textFaded, padding: 8 }}>{filter === "needs" ? "Nobody's waiting on you. Quiet is good." : "No one in the room yet."}</div>}
        {list.map((p) => {
          const ch = CH[p.channel] || CH.email;
          return (
            <button key={p.id} onClick={() => setOpenId(p.id)} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 6px", border: "none", borderBottom: `1px solid ${colors.borderFaint}`, background: "none", cursor: "pointer", textAlign: "left", width: "100%" }}>
              <div style={{ position: "relative", flexShrink: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: 999, background: colors.surfaceMuted, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12.5, fontWeight: 700, color: colors.textMuted }}>{initials(p.name)}</div>
                {p.needsYou && <span style={{ position: "absolute", top: -1, right: -1, width: 9, height: 9, borderRadius: 999, background: colors.accent, border: `2px solid ${colors.background}` }} />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                <div style={{ fontSize: 11.5, color: colors.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.needsYou && p.move ? p.move : (p.relationship || "")}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: ch.color, flexShrink: 0 }}>{ch.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", height: 34, minWidth: 34, border: "none", background: "none", cursor: "pointer", color: colors.textMuted };
const pill = (on) => ({ padding: "5px 11px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: `1px solid ${on ? colors.accent : colors.border}`, background: on ? colors.accent : "transparent", color: on ? "#fff" : colors.textMuted });
