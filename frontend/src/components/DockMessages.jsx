// DockMessages — the pullup messenger. Instagram-DM shape (single pane: a list
// you tap into a conversation, back out), but darker and sexier. Every thread
// is space-rooted (host↔guest, the star) — your people, never strangers.
// Reuses /host/room (real data) + /host/room/message (omnichannel via dispatch)
// + /host/room/attachment. Two-way: inbound threads. Smart: needs-you ranking,
// the suggested move, channel + search filters, attachments.

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Search, Paperclip, X, Sparkles, ChevronLeft, Maximize2, Minimize2 } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";

// Dark, sexy palette — its own world, not the light dashboard.
const D = {
  bg: "#121217",
  raise: "#1b1b22",
  hover: "rgba(255,255,255,0.05)",
  line: "rgba(255,255,255,0.08)",
  ink: "#f4f4f7",
  muted: "rgba(244,244,247,0.56)",
  faint: "rgba(244,244,247,0.34)",
  pink: "#ec178f",
  youGrad: "linear-gradient(135deg, #ff45ad 0%, #ec178f 55%, #c2127a 100%)",
  them: "#26262f",
  green: "#2ecc71",
};
const CH = {
  whatsapp: { label: "WhatsApp", color: "#25d366" },
  instagram: { label: "Instagram", color: "#e1306c" },
  email: { label: "Email", color: "#9aa0a6" },
};
const TINTS = ["#ec178f", "#0d9488", "#ea580c", "#7c3aed", "#1478c8", "#e11d48"];
function hashName(n) { let h = 0; for (const c of String(n || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function initials(n = "") { return String(n).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }

function Avatar({ name, size = 44, dot }) {
  const c = TINTS[hashName(name) % TINTS.length];
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <div style={{ width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", background: `linear-gradient(135deg, ${c} 0%, ${c}99 100%)` }}>{initials(name)}</div>
      {dot && <span style={{ position: "absolute", right: -1, bottom: -1, width: size * 0.28, height: size * 0.28, borderRadius: "50%", background: dot, border: `2px solid ${D.bg}` }} />}
    </div>
  );
}

export default function DockMessages({ onClose, expanded, onToggleExpand }) {
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("needs");
  const [channel, setChannel] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const scroller = useRef(null);
  const fileRef = useRef(null);

  async function load() {
    try { const r = await authenticatedFetch("/host/room"); const d = r.ok ? await r.json() : null; setPeople(d?.people || []); }
    catch { setPeople([]); }
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

  const thread = useMemo(() => open ? [...(open.thread || []), ...sent.filter((m) => m.personId === open.id)] : [], [open, sent]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [thread.length, openId]);
  useEffect(() => { setDraft(""); setAttachments([]); }, [openId]);

  async function onPickFile(e) {
    const file = e.target.files?.[0]; e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      const r = await authenticatedFetch("/host/room/attachment", { method: "POST", body: JSON.stringify({ dataUrl, filename: file.name }) });
      if (r.ok) { const a = await r.json(); setAttachments((p) => [...p, { url: a.url, name: a.name, isImage: a.isImage }]); }
    } finally { setUploading(false); }
  }

  async function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if ((!text && attachments.length === 0) || !open) return;
    const ch = open.channel || "email"; const atts = attachments;
    setSending(true); setDraft(""); setAttachments([]);
    setSent((s) => [...s, { personId: open.id, from: "you", text, atts, time: "now" }]);
    try { await authenticatedFetch("/host/room/message", { method: "POST", body: JSON.stringify({ personId: open.id, channel: ch, text, attachments: atts }) }); }
    finally { setSending(false); }
  }

  const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", color: D.muted, padding: 6 };
  const pill = (on, col) => ({ padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${on ? "transparent" : D.line}`, background: on ? D.pink : "transparent", color: on ? "#fff" : (col || D.muted) });

  // ── Conversation view ───────────────────────────────────────────────────
  if (open) {
    const ch = CH[open.channel] || CH.email;
    const windowClosed = open.channel === "whatsapp" && open.windowOpen === false;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: `1px solid ${D.line}` }}>
          <button onClick={() => setOpenId(null)} style={{ ...iconBtn, color: D.ink }} aria-label="Back"><ChevronLeft size={20} /></button>
          <Avatar name={open.name} size={34} dot={open.channel === "whatsapp" && open.windowOpen ? D.green : null} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{open.name}</div>
            <div style={{ fontSize: 11, color: ch.color, fontWeight: 600 }}>{ch.label}{windowClosed ? " · window closed" : ""}</div>
          </div>
          {onToggleExpand && <button onClick={onToggleExpand} style={iconBtn} aria-label="Expand">{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
          {onClose && <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>}
        </div>

        <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {open.read && <div style={{ fontSize: 12, color: D.faint, lineHeight: 1.5, textAlign: "center", padding: "0 10px 4px" }}>{open.read}</div>}
          {thread.map((m, i) => {
            const mine = m.from === "you" || m.from === "system";
            return (
              <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 7 }}>
                {!mine && <Avatar name={open.name} size={22} />}
                <div style={{ maxWidth: "74%" }}>
                  {(m.atts || []).map((a, j) => a.isImage ? (
                    <img key={j} src={a.url} alt="" style={{ display: "block", maxWidth: "100%", borderRadius: 16, marginBottom: 4 }} />
                  ) : (
                    <div key={j} style={{ fontSize: 12.5, color: D.muted, marginBottom: 4 }}><Paperclip size={11} /> {a.name}</div>
                  ))}
                  {m.text && <div style={{ padding: "9px 13px", borderRadius: mine ? "18px 18px 5px 18px" : "18px 18px 18px 5px", background: mine ? D.youGrad : D.them, color: "#fff", fontSize: 13.5, lineHeight: 1.45, boxShadow: mine ? "0 4px 14px rgba(236,23,143,0.28)" : "none" }}>{m.text}</div>}
                  {m.time && <div style={{ fontSize: 10, color: D.faint, marginTop: 3, textAlign: mine ? "right" : "left" }}>{m.time === "now" ? "Sent · now" : m.time}</div>}
                </div>
              </div>
            );
          })}
          {thread.length === 0 && !open.read && <div style={{ fontSize: 13, color: D.faint, textAlign: "center", marginTop: 20 }}>No history yet. Say hi.</div>}
        </div>

        <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${D.line}` }}>
          {open.needsYou && open.move && !draft && attachments.length === 0 && (
            <button type="button" onClick={() => setDraft(`Hey ${(open.name || "").split(" ")[0]}! `)}
              style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", textAlign: "left", marginBottom: 9, fontSize: 12, color: D.pink, background: "rgba(236,23,143,0.10)", border: "1px solid rgba(236,23,143,0.30)", borderRadius: 12, padding: "8px 11px", cursor: "pointer", lineHeight: 1.4 }}>
              <Sparkles size={12} style={{ flexShrink: 0 }} /><span><b>Suggested:</b> {open.move}</span>
            </button>
          )}
          {attachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {attachments.map((a, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "4px 8px", borderRadius: 8, background: D.raise, color: D.muted }}>
                  <Paperclip size={11} /> {(a.name || "file").slice(0, 16)}
                  <button type="button" onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} style={{ ...iconBtn, padding: 0, color: D.faint }}><X size={12} /></button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={send} style={{ display: "flex", gap: 8, alignItems: "center", background: D.raise, borderRadius: 999, padding: "5px 6px 5px 14px" }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Message on ${ch.label}…`}
              style={{ flex: 1, background: "none", border: "none", outline: "none", color: D.ink, fontSize: 13.5 }} />
            <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...iconBtn, color: uploading ? D.faint : D.muted }} aria-label="Attach"><Paperclip size={17} /></button>
            <button type="submit" disabled={sending || (!draft.trim() && !attachments.length)} aria-label="Send"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", border: "none", background: (draft.trim() || attachments.length) ? D.youGrad : D.them, color: "#fff", cursor: "pointer" }}><Send size={15} /></button>
          </form>
        </div>
      </div>
    );
  }

  // ── List view ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 12px 11px 16px", borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", flex: 1 }}>Messages</div>
        {onToggleExpand && <button onClick={onToggleExpand} style={iconBtn} aria-label="Expand">{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>}
        {onClose && <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={19} /></button>}
      </div>

      <div style={{ padding: "10px 12px 8px" }}>
        <div style={{ position: "relative", marginBottom: 9 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: D.faint }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 32px", borderRadius: 10, border: "none", background: D.raise, color: D.ink, fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("needs")} style={pill(filter === "needs")}>Needs you{needsCount ? ` · ${needsCount}` : ""}</button>
          <button onClick={() => setFilter("all")} style={pill(filter === "all")}>All</button>
          <span style={{ width: 1, background: D.line, margin: "2px 2px" }} />
          {["all", "whatsapp", "instagram", "email"].map((c) => (
            <button key={c} onClick={() => setChannel(c)} style={pill(channel === c, c === "all" ? D.muted : CH[c].color)}>{c === "all" ? "Any" : CH[c].label.slice(0, 2).toUpperCase()}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px" }}>
        {people === null && <div style={{ fontSize: 13, color: D.faint, padding: 14 }}>Loading…</div>}
        {people && list.length === 0 && <div style={{ fontSize: 13, color: D.faint, padding: 14 }}>{filter === "needs" ? "Nobody's waiting on you." : "No one here yet."}</div>}
        {list.map((p) => {
          const ch = CH[p.channel] || CH.email;
          const line = p.needsYou && p.move ? p.move : (p.relationship || "");
          return (
            <button key={p.id} onClick={() => setOpenId(p.id)} onMouseEnter={(e) => (e.currentTarget.style.background = D.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "9px 10px", border: "none", borderRadius: 12, background: "none", cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}>
              <Avatar name={p.name} size={44} dot={p.channel === "whatsapp" && p.windowOpen ? D.green : null} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: D.ink }}>{p.name}</span>
                  {p.needsYou && <span style={{ width: 7, height: 7, borderRadius: 999, background: D.pink, flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 12.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: ch.color, flexShrink: 0 }}>{ch.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
