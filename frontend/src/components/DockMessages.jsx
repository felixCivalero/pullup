// DockMessages — the pullup messenger. Instagram-DM shape (single pane: a list
// you tap into a conversation, back out), on the light PullUp palette. Every thread
// is space-rooted (host↔guest, the star) — your people, never strangers.
// Reuses /host/room (real data) + /host/room/message (omnichannel via dispatch)
// + /host/room/attachment. Two-way: inbound threads. Smart: needs-you ranking,
// the suggested move, channel + search filters, attachments.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Search, Paperclip, X, Sparkles, ChevronLeft, Maximize2, Minimize2, Check, CalendarClock } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { useToast } from "./Toast";

// Light PullUp palette — white canvas, near-black ink, the one pink accent.
const D = {
  bg: "#ffffff",
  raise: "#f4f4f5",
  hover: "rgba(10,10,10,0.04)",
  line: "rgba(10,10,10,0.10)",
  ink: "#0a0a0a",
  muted: "rgba(10,10,10,0.56)",
  faint: "rgba(10,10,10,0.40)",
  pink: "#ec178f",
  youGrad: "linear-gradient(135deg, #ff45ad 0%, #ec178f 55%, #c2127a 100%)",
  them: "#f1f1f3",
  green: "#16a34a",
};
const CH = {
  whatsapp: { label: "WhatsApp", color: "#1aa251" },
  instagram: { label: "Instagram", color: "#d6249f" },
  email: { label: "Email", color: "#6b7280" },
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
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [people, setPeople] = useState(null);
  const [roomEvents, setRoomEvents] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("needs");
  const [channel, setChannel] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const scroller = useRef(null);
  const fileRef = useRef(null);

  async function load() {
    try { const r = await authenticatedFetch("/host/room"); const d = r.ok ? await r.json() : null; setPeople(d?.people || []); setRoomEvents(d?.events || []); }
    catch { setPeople([]); }
  }
  useEffect(() => { load(); }, []);

  const open = useMemo(() => (people || []).find((p) => p.id === openId) || null, [people, openId]);
  const needsCount = (people || []).filter((p) => p.needsYou).length;

  const list = useMemo(() => {
    let ps = [...(people || [])];
    if (filter === "needs") ps = ps.filter((p) => p.needsYou);
    if (channel !== "all") ps = ps.filter((p) => (p.channel || "email") === channel);
    if (eventFilter !== "all") ps = ps.filter((p) => (p.events || []).includes(eventFilter));
    if (q.trim()) { const s = q.trim().toLowerCase(); ps = ps.filter((p) => (p.name || "").toLowerCase().includes(s)); }
    return ps.sort((a, b) => (a.needsYou === b.needsYou ? (b.warmth || 0) - (a.warmth || 0) : a.needsYou ? -1 : 1));
  }, [people, filter, channel, eventFilter, q]);

  const thread = useMemo(() => open ? [...(open.thread || []), ...sent.filter((m) => m.personId === open.id)] : [], [open, sent]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [thread.length, openId]);
  useEffect(() => { setDraft(""); setAttachments([]); setSmartOpen(false); }, [openId]);

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
    if ((!text && attachments.length === 0 && !attachedEventId && !attachedLocation) || !open || sending) return;
    const ch = open.channel || "email"; const atts = attachments;
    setSending(true);
    try {
      const res = await authenticatedFetch("/host/room/message", { method: "POST", body: JSON.stringify({ personId: open.id, channel: ch, text, attachments: atts, eventId: attachedEventId || undefined, location: attachedLocation || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        // Don't pretend it sent — surface the real reason and keep the draft.
        showToast(data.error === "no_email" ? "No email on file for them yet" : "Couldn't send — try again", "error");
        return;
      }
      // Reflect the channel the server actually used (WhatsApp/IG can fall to email).
      const used = data.channel || ch;
      const ev = attachedEvent ? { id: attachedEvent.id, title: attachedEvent.title, slug: attachedEvent.slug, coverImageUrl: attachedEvent.coverImageUrl || attachedEvent.image || null, whenLabel: fmtWhen(attachedEvent), location: attachedEvent.location } : undefined;
      setSent((s) => [...s, { personId: open.id, from: "you", text, atts, event: ev, location: attachedLocation || undefined, time: "now", channel: used }]);
      setDraft(""); setAttachments([]); setAttachedEventId(null); setAttachedLocation(null);
      showToast(ch !== "email" && used === "email" ? `Sent as email — couldn't reach them on ${CH[ch]?.label || ch} right now` : "Sent", "success");
    } catch {
      showToast("Couldn't send — try again", "error");
    } finally { setSending(false); }
  }

  // ── Smart insert: pull event name / time / place / maps into the draft ──
  const [events, setEvents] = useState([]);
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartEventId, setSmartEventId] = useState(null);
  const [attachedEventId, setAttachedEventId] = useState(null); // event attached as a card
  const attachedEvent = events.find((e) => e.id === attachedEventId) || null;
  const [attachedLocation, setAttachedLocation] = useState(null); // { label, url } → clickable address
  useEffect(() => {
    authenticatedFetch("/events").then((r) => (r.ok ? r.json() : [])).then((evs) => {
      const arr = Array.isArray(evs) ? evs : [];
      arr.sort((a, b) => new Date(a.startsAt || 0) - new Date(b.startsAt || 0));
      setEvents(arr);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (smartEventId || !events.length) return;
    const now = Date.now();
    const upcoming = events.find((e) => e.startsAt && new Date(e.startsAt).getTime() >= now) || events[0];
    setSmartEventId(upcoming?.id || null);
  }, [events, smartEventId]);
  const smartEvent = events.find((e) => e.id === smartEventId) || events[0] || null;
  // Keep the initial event list tight instead of dumping every event: what's
  // upcoming (soonest first) + the 2 most recent past. "Show all" reveals the
  // long tail (older + undated/drafts).
  const [showAllEvents, setShowAllEvents] = useState(false);
  const curatedEvents = useMemo(() => {
    const now = Date.now();
    const dated = events.filter((e) => e.startsAt);
    const upcoming = dated
      .filter((e) => new Date(e.startsAt).getTime() >= now)
      .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    const past = dated
      .filter((e) => new Date(e.startsAt).getTime() < now)
      .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
      .slice(0, 2);
    return [...upcoming, ...past];
  }, [events]);
  const visibleEvents = showAllEvents || !curatedEvents.length ? events : curatedEvents;
  function fmtWhen(e) { if (!e?.startsAt) return ""; try { return new Date(e.startsAt).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch { return ""; } }
  function mapsLink(e, provider) { const loc = (e?.location || "").trim(); if (!loc) return ""; const query = encodeURIComponent(loc); return provider === "apple" ? `https://maps.apple.com/?q=${query}` : `https://www.google.com/maps/search/?api=1&query=${query}`; }
  function smartBlock(e) { const parts = []; if (e?.title) parts.push(e.title); const w = fmtWhen(e); if (w) parts.push(w); if (e?.location) parts.push(e.location); const ml = mapsLink(e, "google"); if (ml) parts.push(ml); return parts.join("\n"); }
  function appendDraft(txt) { if (!txt) return; setDraft((d) => (d && !/\s$/.test(d) ? d + " " : d) + txt); }

  // ── Multi-select → message several people at once ──
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [broadcast, setBroadcast] = useState(false);
  const selectedPeople = useMemo(() => (people || []).filter((p) => selected.includes(p.id)), [people, selected]);
  function toggleSel(id) { setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); }
  function exitSelect() { setSelecting(false); setSelected([]); setBroadcast(false); }
  // Select-all over the currently-filtered list (event/channel/search aware).
  const allVisibleSelected = list.length > 0 && list.every((p) => selected.includes(p.id));
  function toggleSelectAll() {
    if (allVisibleSelected) setSelected((s) => s.filter((id) => !list.some((p) => p.id === id)));
    else setSelected((s) => [...new Set([...s, ...list.map((p) => p.id)])]);
  }
  async function sendBroadcast(e) {
    e.preventDefault();
    const text = draft.trim(); const atts = attachments;
    if ((!text && !atts.length && !attachedEventId && !attachedLocation) || !selectedPeople.length) return;
    setSending(true);
    try {
      await Promise.all(selectedPeople.map((p) => authenticatedFetch("/host/room/message", { method: "POST", body: JSON.stringify({ personId: p.id, channel: p.channel || "email", text, attachments: atts, eventId: attachedEventId || undefined, location: attachedLocation || undefined }) }).catch(() => null)));
    } finally {
      setSending(false); setDraft(""); setAttachments([]); setAttachedEventId(null); setAttachedLocation(null); setSmartOpen(false); exitSelect();
    }
  }

  const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", color: D.muted, padding: 6 };
  const pill = (on, col) => ({ padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${on ? "transparent" : D.line}`, background: on ? D.pink : "transparent", color: on ? "#fff" : (col || D.muted) });

  // Composer shared by single threads + the broadcast view. `suggest` shows the
  // needs-you nudge (single only); the sparkle opens the event smart-insert.
  const smartChip = (label, onClick, primary) => (
    <button type="button" key={label} onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${primary ? "transparent" : D.line}`, background: primary ? D.pink : D.raise, color: primary ? "#fff" : D.ink }}>
      {label}
    </button>
  );
  const renderComposer = (onSubmit, placeholder, suggest) => (
    <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${D.line}`, position: "relative" }}>
      {smartOpen && smartEvent && (
        <div style={{ position: "absolute", left: 12, right: 12, bottom: "calc(100% - 4px)", background: D.bg, border: `1px solid ${D.line}`, borderRadius: 14, boxShadow: "0 14px 36px rgba(10,10,10,0.16)", padding: 11, zIndex: 30 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: D.faint, textTransform: "uppercase", letterSpacing: "0.07em" }}>Insert event details</span>
            <button type="button" onClick={() => setSmartOpen(false)} style={{ ...iconBtn, padding: 0, color: D.faint }}><X size={14} /></button>
          </div>
          {events.length > 1 && (
            <select value={smartEventId || ""} onChange={(e) => { if (e.target.value === "__all__") { setShowAllEvents(true); return; } setSmartEventId(e.target.value); }}
              style={{ width: "100%", boxSizing: "border-box", marginBottom: 9, padding: "7px 9px", borderRadius: 9, border: `1px solid ${D.line}`, background: D.raise, color: D.ink, fontSize: 12.5, outline: "none" }}>
              {visibleEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.title || "Untitled event"}</option>)}
              {!showAllEvents && events.length > visibleEvents.length && <option value="__all__">Show all events… ({events.length})</option>}
            </select>
          )}
          <div style={{ fontSize: 13, fontWeight: 700, color: D.ink }}>{smartEvent.title || "Untitled event"}</div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 10 }}>{[fmtWhen(smartEvent), smartEvent.location].filter(Boolean).join(" · ") || "No date or place yet"}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {smartChip("Name", () => appendDraft(smartEvent.title))}
            {fmtWhen(smartEvent) && smartChip("Date & time", () => appendDraft(fmtWhen(smartEvent)))}
            {smartEvent.location && smartChip("Location", () => { setAttachedLocation({ label: smartEvent.location, url: mapsLink(smartEvent, "google") }); setSmartOpen(false); })}
            {smartChip("Attach event card", () => { setAttachedEventId(smartEvent.id); setSmartOpen(false); }, true)}
          </div>
        </div>
      )}
      {suggest && open && open.needsYou && open.move && !draft && attachments.length === 0 && (
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
      {attachedEvent && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(236,23,143,0.10)", border: "1px solid rgba(236,23,143,0.30)", borderRadius: 10, padding: "5px 8px 5px 10px", fontSize: 12, fontWeight: 600, color: D.pink, maxWidth: "100%" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📅 {attachedEvent.title} · event card</span>
            <button type="button" onClick={() => setAttachedEventId(null)} style={{ ...iconBtn, padding: 0, color: D.pink }}><X size={13} /></button>
          </span>
        </div>
      )}
      {attachedLocation && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(236,23,143,0.10)", border: "1px solid rgba(236,23,143,0.30)", borderRadius: 10, padding: "5px 8px 5px 10px", fontSize: 12, fontWeight: 600, color: D.pink, maxWidth: "100%" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {attachedLocation.label}</span>
            <button type="button" onClick={() => setAttachedLocation(null)} style={{ ...iconBtn, padding: 0, color: D.pink }}><X size={13} /></button>
          </span>
        </div>
      )}
      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, alignItems: "center", background: D.raise, borderRadius: 999, padding: "5px 6px 5px 8px" }}>
        <button type="button" onClick={() => setSmartOpen((v) => !v)} disabled={!smartEvent} title="Insert event details"
          style={{ ...iconBtn, color: smartOpen ? D.pink : (smartEvent ? D.muted : D.faint) }}><CalendarClock size={18} /></button>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          style={{ flex: 1, background: "none", border: "none", outline: "none", color: D.ink, fontSize: 13.5 }} />
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...iconBtn, color: uploading ? D.faint : D.muted }} aria-label="Attach"><Paperclip size={17} /></button>
        <button type="submit" disabled={sending || (!draft.trim() && !attachments.length && !attachedEventId && !attachedLocation)} aria-label="Send"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, borderRadius: "50%", border: "none", background: (draft.trim() || attachments.length) ? D.youGrad : D.them, color: (draft.trim() || attachments.length) ? "#fff" : D.faint, cursor: "pointer" }}><Send size={15} /></button>
      </form>
    </div>
  );

  // ── Conversation view ───────────────────────────────────────────────────
  const conversationView = (split = false) => {
    const ch = CH[open.channel] || CH.email;
    const windowClosed = open.channel === "whatsapp" && open.windowOpen === false;
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: `1px solid ${D.line}` }}>
          {!split && <button onClick={() => setOpenId(null)} style={{ ...iconBtn, color: D.ink }} aria-label="Back"><ChevronLeft size={20} /></button>}
          <button onClick={() => { navigate(`/r/${open.id}`); onClose?.(); }} title="Open their room" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "inherit", fontFamily: "inherit" }}>
            <Avatar name={open.name} size={34} dot={open.channel === "whatsapp" && open.windowOpen ? D.green : null} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{open.name}</div>
              <div style={{ fontSize: 11, color: ch.color, fontWeight: 600 }}>{ch.label}{windowClosed ? " · window closed" : ""}</div>
            </div>
          </button>
          {!split && onToggleExpand && <button onClick={onToggleExpand} style={iconBtn} aria-label="Expand">{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
          {!split && onClose && <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>}
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
                  {m.text && <div style={{ padding: "9px 13px", borderRadius: mine ? "18px 18px 5px 18px" : "18px 18px 18px 5px", background: mine ? D.youGrad : D.them, color: mine ? "#fff" : D.ink, fontSize: 13.5, lineHeight: 1.45, boxShadow: mine ? "0 4px 14px rgba(236,23,143,0.24)" : "none" }}>{m.text}</div>}
                  {m.event && m.event.slug && (
                    <a href={`/e/${m.event.slug}`} target="_blank" rel="noreferrer" style={{ display: "flex", gap: 9, alignItems: "center", textDecoration: "none", marginTop: m.text ? 4 : 0, padding: 8, borderRadius: 14, border: `1px solid ${D.line}`, background: D.raise, maxWidth: 264 }}>
                      {m.event.coverImageUrl && <img src={m.event.coverImageUrl} alt="" style={{ width: 44, height: 44, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: D.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.event.title}</div>
                        {[m.event.whenLabel, m.event.location].filter(Boolean).length > 0 && <div style={{ fontSize: 11, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[m.event.whenLabel, m.event.location].filter(Boolean).join(" · ")}</div>}
                        <div style={{ fontSize: 11, fontWeight: 700, color: D.pink, marginTop: 2 }}>View event →</div>
                      </div>
                    </a>
                  )}
                  {m.location && m.location.url && (
                    <a href={m.location.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: m.text ? 4 : 0, fontSize: 13, fontWeight: 600, color: D.pink, textDecoration: "none", padding: "7px 11px", borderRadius: 14, border: `1px solid ${D.line}`, background: D.raise, maxWidth: 264 }}>
                      📍 <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.location.label}</span>
                    </a>
                  )}
                  {m.time && <div style={{ fontSize: 10, color: D.faint, marginTop: 3, textAlign: mine ? "right" : "left" }}>{m.time === "now" ? "Sent · now" : m.time}</div>}
                </div>
              </div>
            );
          })}
          {thread.length === 0 && !open.read && <div style={{ fontSize: 13, color: D.faint, textAlign: "center", marginTop: 20 }}>No history yet. Say hi.</div>}
        </div>

        {renderComposer(send, `Message on ${ch.label}…`, true)}
      </div>
    );
  };

  // ── Broadcast view — compose once, send to everyone selected ──────────────
  const broadcastView = (split = false) => {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: `1px solid ${D.line}` }}>
          <button onClick={() => setBroadcast(false)} style={{ ...iconBtn, color: D.ink }} aria-label="Back"><ChevronLeft size={20} /></button>
          <div style={{ display: "flex" }}>
            {selectedPeople.slice(0, 5).map((p, i) => (
              <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -9, borderRadius: "50%", boxShadow: `0 0 0 2px ${D.bg}` }}><Avatar name={p.name} size={30} /></div>
            ))}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedPeople.length} {selectedPeople.length === 1 ? "person" : "people"}</div>
            <div style={{ fontSize: 11, color: D.muted }}>each gets it on their channel</div>
          </div>
          {!split && onClose && <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 8, alignContent: "flex-start" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selectedPeople.map((p) => {
              const pch = CH[p.channel] || CH.email;
              return (
                <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 10px 5px 6px", borderRadius: 999, background: D.raise, color: D.ink }}>
                  <Avatar name={p.name} size={20} />{(p.name || "").split(" ")[0]}
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: pch.color }}>{pch.label.slice(0, 2).toUpperCase()}</span>
                  <button type="button" onClick={() => toggleSel(p.id)} style={{ ...iconBtn, padding: 0, color: D.faint }}><X size={12} /></button>
                </span>
              );
            })}
          </div>
          <div style={{ fontSize: 12, color: D.faint, marginTop: 4 }}>One message, sent to each person individually — not a group thread.</div>
        </div>

        {renderComposer(sendBroadcast, `Message ${selectedPeople.length} ${selectedPeople.length === 1 ? "person" : "people"}…`, false)}
      </div>
    );
  };

  // ── List view ───────────────────────────────────────────────────────────
  const listView = (split = false) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "13px 12px 11px 16px", borderBottom: `1px solid ${D.line}` }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", flex: 1 }}>Messages</div>
        <button onClick={() => (selecting ? exitSelect() : setSelecting(true))} style={{ ...iconBtn, fontSize: 12.5, fontWeight: 700, color: selecting ? D.pink : D.muted, padding: "4px 8px" }}>{selecting ? "Done" : "Select"}</button>
        {onToggleExpand && <button onClick={onToggleExpand} style={iconBtn} aria-label="Expand">{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>}
        {onClose && <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={19} /></button>}
      </div>

      <div style={{ padding: "10px 12px 8px" }}>
        <div style={{ position: "relative", marginBottom: 9 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: D.faint }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 32px", borderRadius: 10, border: "none", background: D.raise, color: D.ink, fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setFilter("needs")} style={pill(filter === "needs")}>Needs you{needsCount ? ` · ${needsCount}` : ""}</button>
          <button onClick={() => setFilter("all")} style={pill(filter === "all")}>All</button>
          <span style={{ width: 1, background: D.line, margin: "2px 2px" }} />
          {["all", "whatsapp", "instagram", "email"].map((c) => (
            <button key={c} onClick={() => setChannel(c)} style={pill(channel === c, c === "all" ? D.muted : CH[c].color)}>{c === "all" ? "Any" : CH[c].label.slice(0, 2).toUpperCase()}</button>
          ))}
        </div>
        {roomEvents.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
            <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)}
              style={{ flex: 1, minWidth: 0, padding: "7px 10px", borderRadius: 10, border: `1px solid ${eventFilter !== "all" ? D.pink : D.line}`, background: D.raise, color: eventFilter !== "all" ? D.pink : D.ink, fontWeight: eventFilter !== "all" ? 700 : 500, fontSize: 12.5, outline: "none" }}>
              <option value="all">All events</option>
              {roomEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.title}</option>)}
            </select>
            {selecting && (
              <button onClick={toggleSelectAll} style={{ ...iconBtn, fontSize: 12.5, fontWeight: 700, color: D.pink, padding: "4px 6px", whiteSpace: "nowrap" }}>
                {allVisibleSelected ? "Clear" : `Select all · ${list.length}`}
              </button>
            )}
          </div>
        )}
        {selecting && roomEvents.length === 0 && (
          <div style={{ marginTop: 8 }}>
            <button onClick={toggleSelectAll} style={{ ...iconBtn, fontSize: 12.5, fontWeight: 700, color: D.pink, padding: "4px 6px" }}>
              {allVisibleSelected ? "Clear" : `Select all · ${list.length}`}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px" }}>
        {people === null && <div style={{ fontSize: 13, color: D.faint, padding: 14 }}>Loading…</div>}
        {people && list.length === 0 && <div style={{ fontSize: 13, color: D.faint, padding: 14 }}>{filter === "needs" ? "Nobody's waiting on you." : "No one here yet."}</div>}
        {list.map((p) => {
          const ch = CH[p.channel] || CH.email;
          const line = p.needsYou && p.move ? p.move : (p.relationship || "");
          const sel = selected.includes(p.id);
          const baseBg = (selecting && sel) || (split && p.id === openId) ? D.hover : "none";
          return (
            <button key={p.id} onClick={() => (selecting ? toggleSel(p.id) : setOpenId(p.id))} onMouseEnter={(e) => (e.currentTarget.style.background = D.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = baseBg)}
              style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "9px 10px", border: "none", borderRadius: 12, background: baseBg, cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}>
              <Avatar name={p.name} size={44} dot={p.channel === "whatsapp" && p.windowOpen ? D.green : null} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: D.ink }}>{p.name}</span>
                  {p.needsYou && <span style={{ width: 7, height: 7, borderRadius: 999, background: D.pink, flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 12.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</div>
              </div>
              {selecting ? (
                <span style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, border: `2px solid ${sel ? D.pink : D.line}`, background: sel ? D.pink : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {sel && <Check size={13} color="#fff" strokeWidth={3} />}
                </span>
              ) : (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: ch.color, flexShrink: 0 }}>{ch.label}</span>
              )}
            </button>
          );
        })}
      </div>

      {selecting && selected.length > 0 && (
        <div style={{ padding: "10px 12px", borderTop: `1px solid ${D.line}`, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: D.muted, flex: 1 }}>{selected.length} selected</div>
          <button onClick={() => { setDraft(""); setAttachments([]); setSmartOpen(false); setBroadcast(true); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 999, border: "none", background: D.youGrad, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
            Message {selected.length} <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );

  // ── Compose ───────────────────────────────────────────────────────────────
  // Expanded = a real two-pane messenger: contacts pinned on the left, the open
  // conversation (or broadcast) filling the right. Compact = the Instagram-DM
  // single-pane swap (list ↔ thread). The same state drives both.
  if (expanded) {
    return (
      <div style={{ display: "flex", height: "100%", background: D.bg, color: D.ink }}>
        <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${D.line}`, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {listView(true)}
        </div>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
          {open
            ? conversationView(true)
            : (broadcast && selectedPeople.length)
              ? broadcastView(true)
              : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: D.faint, textAlign: "center", padding: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: D.muted }}>Your messages</div>
                  <div style={{ fontSize: 13 }}>Pick someone on the left to open the conversation.</div>
                </div>
              )}
        </div>
      </div>
    );
  }

  if (open) return conversationView(false);
  if (broadcast && selectedPeople.length) return broadcastView(false);
  return listView(false);
}
