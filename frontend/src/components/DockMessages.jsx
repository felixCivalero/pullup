// DockMessages — the pullup messenger. Instagram-DM shape (single pane: a list
// you tap into a conversation, back out), on the light PullUp palette. Every thread
// is space-rooted (host↔guest, the star) — your people, never strangers.
// Reuses /host/room (real data) + /host/room/message (omnichannel via dispatch)
// + /host/room/attachment. Two-way: inbound threads. Smart: needs-you ranking,
// the suggested move, channel + search filters, attachments.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Search, Paperclip, X, Sparkles, ChevronLeft, ChevronRight, Maximize2, Minimize2, Check, CalendarClock, RotateCw, Instagram, Mail, MessageCircle, CalendarCheck, Star, Hourglass, CreditCard, CircleDot, Lock } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { getGoogleMapsUrl } from "../lib/urlUtils";
import { useToast } from "./Toast";
import { useRoomRealtime } from "../lib/useRoomRealtime.js";
import MessageStatusTicks from "./room/MessageStatusTicks.jsx";

const newClientId = () => (globalThis.crypto?.randomUUID?.() || `c_${Date.now()}_${Math.random().toString(36).slice(2)}`);

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
// Channel icons (lucide, matching the rest of the app — no WhatsApp brand mark
// in lucide, so the chat bubble stands in). Inherit currentColor so the pill's
// active (white) / idle (brand-tinted) colour just works.
const CH_ICON = { whatsapp: MessageCircle, instagram: Instagram, email: Mail };
// Non-message timeline logs (rsvp, pull-up=attended, waitlist…) woven into the
// same flow — the per-person source of truth: logs AND messages, one thread.
const LOG = {
  rsvp: { Icon: CalendarCheck, c: "#0d9488" },
  attended: { Icon: Star, c: "#ec178f" },          // a pull-up — they showed up
  waitlist_join: { Icon: Hourglass, c: "#b45309" },
  rsvp_cancel: { Icon: X, c: "rgba(10,10,10,0.40)" },
  payment: { Icon: CreditCard, c: "#16a34a" },
};
const logMeta = (type) => LOG[type] || { Icon: CircleDot, c: "rgba(10,10,10,0.40)" };
const TINTS = ["#ec178f", "#0d9488", "#ea580c", "#7c3aed", "#1478c8", "#e11d48"];
function hashName(n) { let h = 0; for (const c of String(n || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function initials(n = "") { return String(n).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }
// The channels one person is reachable on — one human, several linked accounts.
// Falls back to their preferred channel when the room didn't enumerate reach.
function reachOf(p) { return p?.reachable?.length ? p.reachable : [p?.channel || "email"]; }

// Can we send a normal free-text message ON this channel RIGHT NOW? Email always.
// WhatsApp/Instagram only inside their open window — so the composer can lock a
// closed rail and a DM never silently becomes an email. Uses the server's live
// channelState; falls back to the legacy windowOpen flag if an older payload
// hasn't got channelState yet (don't lock on missing data).
function chanOpen(p, c) {
  if (c === "email") return true;
  const st = p?.channelState?.[c];
  if (st) return st === "open";
  if (c === "whatsapp") return p?.windowOpen !== false;
  return true; // instagram / unknown with no state → assume open (back-compat)
}

// The channel a send will ACTUALLY go out on: the host's pick if it's still
// open, else their preferred rail if open, else the best open rail. Never lands
// on a closed rail — that's the whole point.
function resolveActiveCh(p, picked) {
  if (!p) return "email";
  const reach = reachOf(p);
  if (picked && reach.includes(picked) && chanOpen(p, picked)) return picked;
  const preferred = p.channel || "email";
  if (chanOpen(p, preferred)) return preferred;
  return reach.filter((c) => chanOpen(p, c))[0] || preferred;
}

function Avatar({ name, size = 44, dot, src }) {
  const c = TINTS[hashName(name) % TINTS.length];
  const [broken, setBroken] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {src && !broken ? (
        // Real profile photo (e.g. Instagram), resolved from the person's linked
        // source profiles. Falls back to the initials tile if the URL 404s.
        <img src={src} alt={name || ""} onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.36, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em", background: `linear-gradient(135deg, ${c} 0%, ${c}99 100%)` }}>{initials(name)}</div>
      )}
      {dot && <span style={{ position: "absolute", right: -1, bottom: -1, width: size * 0.28, height: size * 0.28, borderRadius: "50%", background: dot, border: `2px solid ${D.bg}` }} />}
    </div>
  );
}

export default function DockMessages({ onClose, expanded, onToggleExpand, openThread = null }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [people, setPeople] = useState(null);
  const [roomEvents, setRoomEvents] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [channel, setChannel] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [sendChannel, setSendChannel] = useState(null); // chosen send channel for the open thread (null = the person's preferred)
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const scroller = useRef(null);
  const fileRef = useRef(null);
  // Keys (clientId + server id) of bubbles WE created this session, so a realtime
  // echo of our own send doesn't double-render alongside its optimistic copy.
  const sentKeysRef = useRef(new Set());

  async function load() {
    try { const r = await authenticatedFetch("/host/room"); const d = r.ok ? await r.json() : null; setPeople(d?.people || []); setRoomEvents(d?.events || []); }
    catch { setPeople([]); }
  }
  useEffect(() => { load(); }, []);
  // Safety net: realtime is the live path, but if the tab was backgrounded and
  // the socket dropped, refetch on focus so nothing is missed.
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // ── Live: inbound replies + delivery-status ticks stream straight in. ──
  useRoomRealtime({
    onMessage: ({ eventType, row }) => {
      const mine = row.from === "you";
      if (eventType === "UPDATE") {
        // A tick moved (sent → delivered → read / failed). Patch wherever it lives.
        setSent((s) => s.map((m) => (m.id === row.id ? { ...m, status: row.status } : m)));
        setPeople((ps) => ps && ps.map((p) => p.id !== row.personId ? p : { ...p, thread: (p.thread || []).map((m) => (m.id === row.id ? { ...m, status: row.status } : m)) }));
        return;
      }
      // INSERT
      if (mine) {
        // Our own send echoing back: reconcile the optimistic bubble's id, don't
        // duplicate it. An outbound from ANOTHER device (unknown key) is appended.
        if (row.clientId && sentKeysRef.current.has(row.clientId)) {
          setSent((s) => s.map((m) => (m.clientId === row.clientId ? { ...m, id: row.id, status: row.status || m.status } : m)));
          sentKeysRef.current.add(row.id);
          return;
        }
        if (sentKeysRef.current.has(row.id)) return;
      }
      // New person we don't have yet → pull the room fresh; otherwise append the
      // reply (or another-device send) to their thread + float them up the list.
      if (!(people || []).some((p) => p.id === row.personId)) { load(); return; }
      setPeople((ps) => ps && ps.map((p) => {
        if (p.id !== row.personId) return p;
        if ((p.thread || []).some((m) => m.id === row.id)) return p;
        return {
          ...p,
          thread: [...(p.thread || []), { ...row, time: "now" }],
          lastMessage: { from: row.from, text: row.text || "", time: "now" },
          needsYou: !mine ? true : p.needsYou,
        };
      }));
    },
  });

  const open = useMemo(() => (people || []).find((p) => p.id === openId) || null, [people, openId]);
  // A notification (via IdeaWidget) can target a specific person's thread. Set
  // the id; the thread resolves as soon as `people` loads.
  useEffect(() => { if (openThread?.id) setOpenId(openThread.id); }, [openThread]);
  const needsCount = (people || []).filter((p) => p.needsYou).length;

  const list = useMemo(() => {
    let ps = [...(people || [])];
    if (filter === "needs") ps = ps.filter((p) => p.needsYou);
    if (channel !== "all") ps = ps.filter((p) => reachOf(p).includes(channel));
    if (eventFilter !== "all") ps = ps.filter((p) => (p.events || []).includes(eventFilter));
    if (q.trim()) { const s = q.trim().toLowerCase(); ps = ps.filter((p) => (p.name || "").toLowerCase().includes(s)); }
    return ps.sort((a, b) => (a.needsYou === b.needsYou ? (b.warmth || 0) - (a.warmth || 0) : a.needsYou ? -1 : 1));
  }, [people, filter, channel, eventFilter, q]);

  const thread = useMemo(() => {
    if (!open) return [];
    const base = open.thread || [];
    // A send that's since been refetched into the server thread shouldn't also
    // show as its local optimistic copy — dedupe by id, server wins.
    const seen = new Set(base.map((m) => m.id).filter(Boolean));
    const mine = sent.filter((m) => m.personId === open.id && !(m.id && seen.has(m.id)));
    // Order by real timestamp (ms precision), NOT insertion order — otherwise an
    // optimistic send or a live-arriving reply can land out of sequence (your
    // question sitting UNDER the answer it preceded). Stable tiebreak on equal
    // timestamps via original index; anything genuinely untimed sinks to newest.
    return [...base, ...mine]
      .map((m, i) => ({ m, i, t: m.at ? new Date(m.at).getTime() : Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => (a.t - b.t) || (a.i - b.i))
      .map((x) => x.m);
  }, [open, sent]);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; }, [thread.length, openId]);
  useEffect(() => { setDraft(""); setAttachments([]); setSmartOpen(false); setSendChannel(null); }, [openId]);

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

  // The actual POST + reconcile, shared by first-send and retry. The optimistic
  // bubble already exists in `sent` (keyed by clientId); this flips its status
  // sending → sent (then delivered/read arrive live) or → failed.
  async function doSend({ clientId, personId, ch, text, atts, ev, loc }) {
    setSent((s) => s.map((m) => (m.clientId === clientId ? { ...m, status: "sending" } : m)));
    try {
      // strict: a 1:1 thread send must go out on the chosen rail or come back
      // blocked — the server never silently reroutes a DM to email.
      const res = await authenticatedFetch("/host/room/message", { method: "POST", body: JSON.stringify({ personId, channel: ch, text, attachments: atts, eventId: ev?.id || undefined, location: loc || undefined, clientId, strict: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setSent((s) => s.map((m) => (m.clientId === clientId ? { ...m, status: "failed" } : m)));
        const msg = data.error === "no_email"
          ? "No email on file for them yet"
          : data.error === "channel_closed"
            ? `${CH[data.blockedChannel]?.label || "That channel"} is closed — they need to message first. Send on Email to reach them.`
            : "Couldn't send — tap to retry";
        showToast(msg, "error");
        return;
      }
      // Reflect the channel the server actually used (WhatsApp/IG can fall to email).
      const used = data.channel || ch;
      if (data.messageId) sentKeysRef.current.add(data.messageId);
      setSent((s) => s.map((m) => (m.clientId === clientId ? { ...m, id: data.messageId || m.id, status: data.status || "sent", channel: used } : m)));
      if (ch !== "email" && used === "email") showToast(`Sent as email — couldn't reach them on ${CH[ch]?.label || ch} right now`, "success");
    } catch {
      setSent((s) => s.map((m) => (m.clientId === clientId ? { ...m, status: "failed" } : m)));
      showToast("Couldn't send — tap to retry", "error");
    }
  }

  async function send(e) {
    e.preventDefault();
    const text = draft.trim();
    if ((!text && attachments.length === 0 && !attachedEventId && !attachedLocation) || !open || sending) return;
    const ch = resolveActiveCh(open, sendChannel); const atts = attachments;
    const ev = attachedEvent ? { id: attachedEvent.id, title: attachedEvent.title, slug: attachedEvent.slug, coverImageUrl: attachedEvent.coverImageUrl || attachedEvent.image || null, whenLabel: fmtWhen(attachedEvent), location: attachedEvent.location } : undefined;
    const loc = attachedLocation || undefined;
    const clientId = newClientId();
    sentKeysRef.current.add(clientId);
    // Show the bubble INSTANTLY, then clear the composer — the send happens behind it.
    setSent((s) => [...s, { clientId, personId: open.id, from: "you", text, atts, event: ev, location: loc, at: new Date().toISOString(), time: "now", channel: ch, status: "sending", _send: { personId: open.id, ch, text, atts, ev, loc } }]);
    setDraft(""); setAttachments([]); setAttachedEventId(null); setAttachedLocation(null); setSmartOpen(false);
    setSending(true);
    try { await doSend({ clientId, personId: open.id, ch, text, atts, ev, loc }); }
    finally { setSending(false); }
  }

  // Tap a failed bubble to re-send it.
  function retry(m) {
    if (!m?._send) return;
    doSend({ clientId: m.clientId, ...m._send });
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
  // Always Google Maps, exact pin when the event carries coords (else address search).
  function mapsLink(e) { if (!(e?.location || "").trim()) return ""; return getGoogleMapsUrl(e.location, e.locationLat, e.locationLng) || ""; }
  function smartBlock(e) { const parts = []; if (e?.title) parts.push(e.title); const w = fmtWhen(e); if (w) parts.push(w); if (e?.location) parts.push(e.location); const ml = mapsLink(e); if (ml) parts.push(ml); return parts.join("\n"); }
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
            {smartEvent.location && smartChip("Location", () => { setAttachedLocation({ label: smartEvent.location, url: mapsLink(smartEvent) }); setSmartOpen(false); })}
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
      <form onSubmit={onSubmit} autoComplete="off" style={{ display: "flex", gap: 8, alignItems: "center", background: D.raise, borderRadius: 999, padding: "5px 6px 5px 8px" }}>
        <button type="button" onClick={() => setSmartOpen((v) => !v)} disabled={!smartEvent} title="Insert event details"
          style={{ ...iconBtn, color: smartOpen ? D.pink : (smartEvent ? D.muted : D.faint) }}><CalendarClock size={18} /></button>
        {/* It's a chat box, not a payment field — stop Chrome's credit-card /
            password-manager autofill from popping over it. */}
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
          name="pullup-message" autoComplete="off" autoCorrect="off" data-lpignore="true" data-1p-ignore data-form-type="other"
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
    const reach = reachOf(open);
    const activeCh = resolveActiveCh(open, sendChannel);
    const ch = CH[activeCh] || CH.email;
    const others = reach.filter((c) => c !== activeCh);
    // The active rail is normally open (resolveActiveCh prefers an open one); it's
    // only closed when EVERY reachable rail is closed and none can carry a DM now.
    const activeClosed = !chanOpen(open, activeCh);
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: `1px solid ${D.line}` }}>
          {!split && <button onClick={() => setOpenId(null)} style={{ ...iconBtn, color: D.ink }} aria-label="Back"><ChevronLeft size={20} /></button>}
          <button onClick={() => { navigate(`/r/${open.id}`); onClose?.(); }} title="Open their room" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "inherit", fontFamily: "inherit" }}>
            <Avatar name={open.name} src={open.avatarUrl} size={34} dot={open.channel === "whatsapp" && open.windowOpen ? D.green : null} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{open.name}</div>
              <div style={{ fontSize: 11, color: ch.color, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {ch.label}{activeClosed ? " · window closed" : ""}
                {others.length > 0 && <span style={{ color: D.faint, fontWeight: 500 }}> · also on {others.map((c) => `${CH[c]?.label || c}${chanOpen(open, c) ? "" : " (closed)"}`).join(", ")}</span>}
              </div>
            </div>
          </button>
          {!split && onToggleExpand && <button onClick={onToggleExpand} style={iconBtn} aria-label="Expand">{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>}
          {!split && onClose && <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>}
        </div>

        {/* One person, several linked accounts — pick which to send on. A rail
            whose window is closed is LOCKED (not selectable): you can't fire a DM
            that would silently go out as email. Email is always open. */}
        {reach.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${D.line}`, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: D.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>Send on</span>
            {reach.map((c) => {
              const Icon = CH_ICON[c] || MessageCircle;
              const on = activeCh === c;
              const col = CH[c]?.color || D.muted;
              const isOpen = chanOpen(open, c);
              if (!isOpen) {
                return (
                  <span key={c} title={`${CH[c]?.label || c} window closed — they haven't messaged in a while, so a DM can't go out. Send on Email instead.`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "not-allowed", border: `1px dashed ${D.line}`, background: "transparent", color: D.faint, opacity: 0.75 }}>
                    <Lock size={11} strokeWidth={2.5} /> {CH[c]?.label || c}
                  </span>
                );
              }
              return (
                <button key={c} type="button" onClick={() => setSendChannel(c)} title={CH[c]?.label || c}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, padding: "4px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? "transparent" : D.line}`, background: on ? col : "transparent", color: on ? "#fff" : col }}>
                  <Icon size={13} strokeWidth={2.25} /> {CH[c]?.label || c}
                </button>
              );
            })}
          </div>
        )}

        {/* Every reachable rail is closed (e.g. WhatsApp-only, quiet 24h+ and no
            email on file) — say so plainly instead of letting a send fail blind. */}
        {activeClosed && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderBottom: `1px solid ${D.line}`, fontSize: 11.5, fontWeight: 600, color: "#b45309", background: "rgba(180,83,9,0.06)" }}>
            <Lock size={12} strokeWidth={2.4} style={{ flexShrink: 0 }} />
            <span>{CH[activeCh]?.label || "This channel"} is closed — they need to message first before you can DM.</span>
          </div>
        )}

        <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          {open.read && <div style={{ fontSize: 12, color: D.faint, lineHeight: 1.5, textAlign: "center", padding: "0 10px 4px" }}>{open.read}</div>}
          {thread.map((m, i) => {
            // A log entry (rsvp / pull-up / waitlist / payment…) — render it AS a
            // log woven into the flow, not as a host message bubble.
            if (m.from === "system") {
              const { Icon, c } = logMeta(m.type);
              return (
                <div key={m.id || i} style={{ display: "flex", justifyContent: "center", margin: "1px 0" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: D.muted, background: D.raise, borderRadius: 999, padding: "4px 11px", maxWidth: "88%", lineHeight: 1.35 }}>
                    <Icon size={12} color={c} style={{ flexShrink: 0 }} strokeWidth={2.25} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</span>
                    {m.time && <span style={{ color: D.faint, flexShrink: 0 }}>· {m.time === "now" ? "now" : m.time}</span>}
                  </span>
                </div>
              );
            }
            const mine = m.from === "you";
            const failed = m.status === "failed";
            return (
              <div key={m.id || m.clientId || i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 7 }}>
                {!mine && <Avatar name={open.name} src={open.avatarUrl} size={22} />}
                <div style={{ maxWidth: "74%", opacity: m.status === "sending" ? 0.72 : 1, transition: "opacity 0.2s" }} onClick={failed ? () => retry(m) : undefined} title={failed ? "Tap to retry" : undefined}>
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
                  {(m.time || mine) && (
                    <div style={{ fontSize: 10, color: failed ? "#dc2626" : D.faint, marginTop: 3, display: "flex", gap: 4, alignItems: "center", justifyContent: mine ? "flex-end" : "flex-start" }}>
                      {/* Auto-DMs (comment→DM, flows) read as automated, not hand-typed. */}
                      {m.type === "auto_dm_sent" && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: D.pink, fontWeight: 700 }}>
                          <Sparkles size={9} /> Auto-DM
                        </span>
                      )}
                      {/* The label tracks the live delivery state of OUR messages. */}
                      <span>{failed ? "Not delivered · tap to retry" : m.status === "sending" ? "Sending…" : m.time === "now" ? "now" : m.time}</span>
                      {/* One tick language across WhatsApp / Instagram / email. */}
                      {mine && <MessageStatusTicks status={m.status} pink={D.pink} faint={D.faint} />}
                      {failed && <RotateCw size={10} style={{ color: "#dc2626" }} />}
                    </div>
                  )}
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
              <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -9, borderRadius: "50%", boxShadow: `0 0 0 2px ${D.bg}` }}><Avatar name={p.name} src={p.avatarUrl} size={30} /></div>
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
                  <Avatar name={p.name} src={p.avatarUrl} size={20} />{(p.name || "").split(" ")[0]}
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
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" type="search"
            name="pullup-search" autoComplete="off" data-lpignore="true" data-1p-ignore data-form-type="other"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 32px", borderRadius: 10, border: "none", background: D.raise, color: D.ink, fontSize: 13, outline: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setFilter("needs")} style={pill(filter === "needs")}>Needs you{needsCount ? ` · ${needsCount}` : ""}</button>
          <button onClick={() => setFilter("all")} style={pill(filter === "all")}>All</button>
          <span style={{ width: 1, background: D.line, margin: "2px 2px" }} />
          {["all", "whatsapp", "instagram", "email"].map((c) => {
            const Icon = CH_ICON[c];
            return (
              <button key={c} onClick={() => setChannel(c)} title={c === "all" ? "Any channel" : CH[c].label} aria-label={c === "all" ? "Any channel" : CH[c].label}
                style={{ ...pill(channel === c, c === "all" ? D.muted : CH[c].color), display: "inline-flex", alignItems: "center", justifyContent: "center", padding: c === "all" ? "5px 11px" : "6px 10px" }}>
                {c === "all" ? "Any" : <Icon size={15} strokeWidth={2.25} />}
              </button>
            );
          })}
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
          const line = p.needsYou && p.move ? p.move : (p.relationship || "");
          const sel = selected.includes(p.id);
          const baseBg = (selecting && sel) || (split && p.id === openId) ? D.hover : "none";
          return (
            <button key={p.id} onClick={() => (selecting ? toggleSel(p.id) : setOpenId(p.id))} onMouseEnter={(e) => (e.currentTarget.style.background = D.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = baseBg)}
              style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "9px 10px", border: "none", borderRadius: 12, background: baseBg, cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}>
              <Avatar name={p.name} src={p.avatarUrl} size={44} dot={p.channel === "whatsapp" && p.windowOpen ? D.green : null} />
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
                <span title={reachOf(p).map((c) => CH[c]?.label || c).join(" · ")}
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  {reachOf(p).slice(0, 3).map((c) => {
                    const Icon = CH_ICON[c] || MessageCircle;
                    const on = c === (p.channel || "email");
                    return <Icon key={c} size={14} strokeWidth={2.25} color={CH[c]?.color || D.faint} style={{ opacity: on ? 1 : 0.45 }} />;
                  })}
                </span>
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
            Write to {selected.length} <ChevronRight size={15} />
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
