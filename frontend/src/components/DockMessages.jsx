// DockMessages — the pullup messenger. Instagram-DM shape (single pane: a list
// you tap into a conversation, back out), on the light PullUp palette. Every thread
// is space-rooted (host↔guest, the star) — your people, never strangers.
// Reuses /host/room (real data) + /host/room/message (omnichannel via dispatch)
// + /host/room/attachment. Two-way: inbound threads. Smart: needs-you ranking,
// the suggested move, channel + search filters, attachments.

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Search, Paperclip, X, Sparkles, ChevronLeft, ChevronRight, Maximize2, Minimize2, Check, CalendarClock, RotateCw, Instagram, Mail, MessageCircle, CalendarCheck, Star, Hourglass, CreditCard, CircleDot, Lock, SlidersHorizontal, Users, ChevronDown, Loader2, CheckCircle2, PenLine } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { getGoogleMapsUrl } from "../lib/urlUtils";
import { useToast } from "./Toast";
import { useRoomRealtime } from "../lib/useRoomRealtime.js";
import { useAudienceFilter } from "../lib/useAudienceFilter.js";
import { useMessagesStore } from "../contexts/useMessagesStore.js";
import MessageStatusTicks from "./room/MessageStatusTicks.jsx";

const newClientId = () => (globalThis.crypto?.randomUUID?.() || `c_${Date.now()}_${Math.random().toString(36).slice(2)}`);

// Run async work with bounded concurrency — a steady, server-friendly drip for
// bulk sends (so 171 messages don't fire as 171 simultaneous requests) and so
// the per-channel progress fills gradually instead of all at once.
async function runPool(items, worker, concurrency = 6) {
  let i = 0;
  const run = async () => { while (i < items.length) { const idx = i++; await worker(items[idx], idx); } };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
}

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
  access_request: { Icon: Sparkles, c: "#7c3aed" }, // "request early access" click — a log, not person speech
};
const logMeta = (type) => LOG[type] || { Icon: CircleDot, c: "rgba(10,10,10,0.40)" };
const TINTS = ["#ec178f", "#0d9488", "#ea580c", "#7c3aed", "#1478c8", "#e11d48"];
function hashName(n) { let h = 0; for (const c of String(n || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; }
function initials(n = "") { return String(n).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }
// The channels one person is reachable on — one human, several linked accounts.
// Falls back to their preferred channel when the room didn't enumerate reach.
function reachOf(p) { return p?.reachable?.length ? p.reachable : [p?.channel || "email"]; }
// PullUp itself in the inbox — threads with the platform's own addresses wear
// the eyes and read as "PullUp", so system communication stands out from people.
const SYSTEM_EMAILS = new Set(["felix@pullup.se", "hello@pullup.se"]);
const isSystemPerson = (p) => SYSTEM_EMAILS.has(String(p?.email || "").toLowerCase().trim());
const dispName = (p) => (isSystemPerson(p) ? "PullUp" : p?.name);

// Compact "how long ago" for the list rows (Instagram-style: now, 5m, 3h, 2d,
// 1w, then a short date). Computed client-side off the ISO so it stays accurate.
function relTimeShort(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!t) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return "now";
  const m = s / 60; if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60; if (h < 24) return `${Math.round(h)}h`;
  const d = h / 24; if (d < 7) return `${Math.round(d)}d`;
  const w = d / 7; if (w < 5) return `${Math.round(w)}w`;
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); } catch { return `${Math.round(d)}d`; }
}

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
// Messages-list order — like Instagram: the newest activity is always on top,
// unread or not. Tier 0 = any message thread (ranked purely by recency, so a
// reply you just sent jumps to the top even when older unreads exist); tier 1 =
// action-only (no messages yet — ranked by their latest action). The two tiers
// keep an rsvp/attended log from ever sitting above a written message. The
// unread dot still marks what's awaiting you — it just no longer reorders.
function msgRank(p) {
  const msgMs = p.lastMessageAt ? new Date(p.lastMessageAt).getTime() : 0;
  if (msgMs) return [0, msgMs];
  const actMs = p.lastActivityAt ? new Date(p.lastActivityAt).getTime() : 0;
  return [1, actMs || (p.warmth || 0)];
}

function resolveActiveCh(p, picked) {
  if (!p) return "email";
  const reach = reachOf(p);
  if (picked && reach.includes(picked) && chanOpen(p, picked)) return picked;
  const preferred = p.channel || "email";
  if (chanOpen(p, preferred)) return preferred;
  return reach.filter((c) => chanOpen(p, c))[0] || preferred;
}

function Avatar({ name, size = 44, dot, src, system }) {
  const c = TINTS[hashName(name) % TINTS.length];
  const [broken, setBroken] = useState(false);
  if (system) {
    // PullUp speaking — the eyes on white with a pink ring, never initials.
    return (
      <div style={{ position: "relative", flexShrink: 0 }}>
        <div style={{ width: size, height: size, borderRadius: "50%", background: "#fff", border: `2px solid ${D.pink}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          <img src="/pullup-smalleyes.svg" alt="PullUp" style={{ width: "68%", display: "block" }} />
        </div>
        {dot && <span style={{ position: "absolute", right: -1, bottom: -1, width: size * 0.28, height: size * 0.28, borderRadius: "50%", background: dot, border: `2px solid ${D.bg}` }} />}
      </div>
    );
  }
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
  // Contacts live in the app-level store — loaded once per session, kept live
  // over realtime, surviving every dock close and page change. The dock only
  // ASKS for them; it never owns them.
  const { people, setPeople, roomEvents, ensureLoaded, sentKeys: sentKeysRef } = useMessagesStore();
  // Audience builder — shared verbatim with the Room's "Your people" view.
  const af = useAudienceFilter(people || [], roomEvents);
  const { channels, eventIds, attendance, segment, q, setAttendance, setSegment, setQ,
    toggleChannel, clearChannels, toggleEvent, clearEvents } = af;
  const activeFilterCount = af.activeCount;
  const filterSummary = af.summary;
  const clearFilters = af.clear;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [eventPickerOpen, setEventPickerOpen] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [sendChannel, setSendChannel] = useState(null); // chosen send channel for the open thread (null = the person's preferred)
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState(""); // email subject — broadcast only
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const scroller = useRef(null);
  const fileRef = useRef(null);
  const taRef = useRef(null); // composer textarea — for auto-grow

  // First mount asks the store to load (a no-op ever after — the cache renders
  // instantly on every later open). All people-list realtime merges live in
  // the store; the dock's own subscription below only reconciles the local
  // optimistic `sent` bubbles (tick upgrades + own-echo id reconcile).
  useEffect(() => { ensureLoaded(); }, [ensureLoaded]);
  useRoomRealtime({
    onMessage: ({ eventType, row }) => {
      if (eventType === "UPDATE") {
        setSent((s) => s.map((m) => (m.id === row.id ? { ...m, status: row.status } : m)));
        return;
      }
      if (row.from === "you" && row.clientId && sentKeysRef.current.has(row.clientId)) {
        setSent((s) => s.map((m) => (m.clientId === row.clientId ? { ...m, id: row.id, status: row.status || m.status } : m)));
      }
    },
  });

  const open = useMemo(() => (people || []).find((p) => p.id === openId) || null, [people, openId]);
  // A notification (via IdeaWidget) can target a specific person's thread. Set
  // the id; the thread resolves as soon as `people` loads.
  useEffect(() => { if (openThread?.id) setOpenId(openThread.id); }, [openThread]);

  // The dock orders the filtered audience like an inbox (unread → recency).
  const list = useMemo(() => [...af.list].sort((a, b) => {
    const ra = msgRank(a), rb = msgRank(b);
    return ra[0] !== rb[0] ? ra[0] - rb[0] : rb[1] - ra[1];
  }), [af.list]);

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

  // The composer grows with the message so longer notes — real emails — are
  // comfortable to write, then scrolls past a sensible cap. (Enter is a line
  // break now; sending is the button only.)
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 20), 160)}px`;
  }, [draft, openId]);

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
    // Replying clears the unread flag and bumps recency, so the thread re-sorts
    // out of the "awaiting reply" tier the moment you hit send.
    setPeople((ps) => ps && ps.map((p) => (p.id !== open.id ? p : { ...p, awaitingReply: false, lastMessageAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() })));
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
  function appendDraft(txt) { if (!txt) return; setDraft((d) => (d && !/\s$/.test(d) ? d + " " : d) + txt); }

  // ── Multi-select → message several people at once ──
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState([]);
  const [broadcast, setBroadcast] = useState(false);
  // Live bulk-send status: { groups: {channel:{total,done,failed}}, total, done, failed, complete }.
  const [sendProgress, setSendProgress] = useState(null);
  const selectedPeople = useMemo(() => (people || []).filter((p) => selected.includes(p.id)), [people, selected]);
  // The system person (PullUp) is a contact for service chat, never an
  // audience member — every bulk path works off this list, not `list`.
  const broadcastList = useMemo(() => list.filter((p) => !isSystemPerson(p)), [list]);
  function toggleSel(id) {
    if ((people || []).some((p) => p.id === id && isSystemPerson(p))) return; // can't select PullUp
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function exitSelect() { setSelecting(false); setSelected([]); setBroadcast(false); setSendProgress(null); }
  // Select-all over the currently-filtered list (event/channel/search aware).
  const allVisibleSelected = broadcastList.length > 0 && broadcastList.every((p) => selected.includes(p.id));
  function toggleSelectAll() {
    if (allVisibleSelected) setSelected((s) => s.filter((id) => !broadcastList.some((p) => p.id === id)));
    else setSelected((s) => [...new Set([...s, ...broadcastList.map((p) => p.id)])]);
  }
  async function sendBroadcast(e) {
    e.preventDefault();
    const text = draft.trim(); const atts = attachments;
    const evId = attachedEventId || undefined; const loc = attachedLocation || undefined;
    if ((!text && !atts.length && !evId && !loc) || !selectedPeople.length || sendProgress) return;
    // One-to-many, not a group thread: send each individually on the rail they'll
    // actually receive on, and surface honest per-channel progress so the host can
    // watch it land — no wondering "did they get it?".
    const recips = selectedPeople.map((p) => ({ p, ch: resolveActiveCh(p, null) }));
    const groups = {};
    for (const { ch } of recips) (groups[ch] = groups[ch] || { total: 0, done: 0, failed: 0 }).total++;
    setSendProgress({ groups, total: recips.length, done: 0, failed: 0, complete: false });
    setSending(true);
    await runPool(recips, async ({ p, ch }) => {
      let ok = false;
      try {
        const res = await authenticatedFetch("/host/room/message", { method: "POST", body: JSON.stringify({ personId: p.id, channel: ch, text, subject: subject.trim() || undefined, attachments: atts, eventId: evId, location: loc }) });
        const data = await res.json().catch(() => ({}));
        ok = res.ok && data.ok !== false;
      } catch { ok = false; }
      setSendProgress((s) => {
        if (!s) return s;
        const prev = s.groups[ch] || { total: 0, done: 0, failed: 0 };
        const g = { ...prev, done: prev.done + 1, failed: prev.failed + (ok ? 0 : 1) };
        return { ...s, groups: { ...s.groups, [ch]: g }, done: s.done + 1, failed: s.failed + (ok ? 0 : 1) };
      });
    }, 6);
    setSending(false);
    setSendProgress((s) => (s ? { ...s, complete: true } : s));
  }
  // Filtering builds an AUDIENCE — this lets the host act on it: write to the
  // whole filtered/searched set in one go, via the same one-to-many composer as
  // hand-picking (just seeded from the current filter instead of manual taps).
  // Without this, a filter only narrows the list with no way to message it —
  // the gap that made "where do I write?" unanswerable.
  function messageAudience() {
    if (!broadcastList.length) return;
    setSelected(broadcastList.map((p) => p.id));
    setDraft(""); setSubject(""); setAttachments([]); setSmartOpen(false); setSendProgress(null);
    setSelecting(false);
    setBroadcast(true);
  }

  // Leave the broadcast flow after a send — back to the message list, cleared.
  function finishBroadcast() {
    setDraft(""); setSubject(""); setAttachments([]); setAttachedEventId(null); setAttachedLocation(null); setSmartOpen(false);
    exitSelect();
  }

  const iconBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", border: "none", background: "none", cursor: "pointer", color: D.muted, padding: 6 };
  const pill = (on, col) => ({ padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", border: `1px solid ${on ? "transparent" : D.line}`, background: on ? D.pink : "transparent", color: on ? "#fff" : (col || D.muted) });
  const fLabel = { fontSize: 10.5, fontWeight: 800, color: D.faint, textTransform: "uppercase", letterSpacing: "0.05em", margin: "11px 2px 6px" };

  // Composer shared by single threads + the broadcast view. The sparkle opens
  // the event smart-insert (name/time/place/maps → draft).
  const smartChip = (label, onClick, primary) => (
    <button type="button" key={label} onClick={onClick}
      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 999, cursor: "pointer", border: `1px solid ${primary ? "transparent" : D.line}`, background: primary ? D.pink : D.raise, color: primary ? "#fff" : D.ink }}>
      {label}
    </button>
  );
  const renderComposer = (onSubmit, placeholder, opts = {}) => (
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
      {/* Subject — broadcast with ≥1 email recipient. Optional; falls back to
          "A note from {host}". */}
      {opts.showSubject && (
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)"
          name="pullup-subject" autoComplete="off" autoCorrect="off" data-lpignore="true" data-1p-ignore data-form-type="other"
          style={{ width: "100%", boxSizing: "border-box", marginBottom: 8, background: D.raise, border: `1px solid ${D.line}`, borderRadius: 12, padding: "8px 12px", fontSize: 13, fontWeight: 600, color: D.ink, outline: "none" }} />
      )}
      <form onSubmit={onSubmit} autoComplete="off" style={{ display: "flex", gap: 8, alignItems: "flex-end", background: D.raise, borderRadius: 20, padding: "5px 6px 5px 8px" }}>
        <button type="button" onClick={() => setSmartOpen((v) => !v)} disabled={!smartEvent} title="Insert event details"
          style={{ ...iconBtn, color: smartOpen ? D.pink : (smartEvent ? D.muted : D.faint), flexShrink: 0 }}><CalendarClock size={18} /></button>
        {/* A chat box that grows into a real note. Enter is a line break — sending
            is the button only (safer for longer emails). Autofill off: it's a
            message field, not a password/credit-card one. */}
        <textarea ref={taRef} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} rows={1}
          name="pullup-message" autoComplete="off" autoCorrect="off" data-lpignore="true" data-1p-ignore data-form-type="other"
          style={{ flex: 1, minWidth: 0, alignSelf: "stretch", background: "none", border: "none", outline: "none", resize: "none", color: D.ink, fontSize: 13.5, lineHeight: 1.4, fontFamily: "inherit", padding: "6px 0", maxHeight: 160, overflowY: "auto" }} />
        <input ref={fileRef} type="file" accept="image/*" onChange={onPickFile} style={{ display: "none" }} />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} style={{ ...iconBtn, color: uploading ? D.faint : D.muted, flexShrink: 0 }} aria-label="Attach"><Paperclip size={17} /></button>
        <button type="submit" disabled={sending || (!draft.trim() && !attachments.length && !attachedEventId && !attachedLocation)} aria-label="Send"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34, flexShrink: 0, borderRadius: "50%", border: "none", background: (draft.trim() || attachments.length) ? D.youGrad : D.them, color: (draft.trim() || attachments.length) ? "#fff" : D.faint, cursor: "pointer" }}><Send size={15} /></button>
      </form>
    </div>
  );

  // ── Conversation view ───────────────────────────────────────────────────
  const conversationView = (split = false) => {
    const reach = reachOf(open);
    const activeCh = resolveActiveCh(open, sendChannel);
    const ch = CH[activeCh] || CH.email;
    // Subtitle = their real contact details (the rails themselves are the row of
    // icons below, so repeating "also on …" there is dead weight). Show what we
    // actually hold: @handle, email, phone — whichever exist.
    const igHandle = open.instagram || open.external?.instagram?.username || null;
    const contactBits = [igHandle ? `@${igHandle}` : null, open.email || null, open.phone || null].filter(Boolean);
    // The active rail is normally open (resolveActiveCh prefers an open one); it's
    // only closed when EVERY reachable rail is closed and none can carry a DM now.
    const activeClosed = !chanOpen(open, activeCh);
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: `1px solid ${D.line}` }}>
          {!split && <button onClick={() => setOpenId(null)} style={{ ...iconBtn, color: D.ink }} aria-label="Back"><ChevronLeft size={20} /></button>}
          <button onClick={() => { navigate(`/r/${open.id}`); onClose?.(); }} title="Open their room" style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "inherit", fontFamily: "inherit" }}>
            <Avatar name={open.name} src={open.avatarUrl} size={34} system={isSystemPerson(open)} dot={open.channel === "whatsapp" && open.windowOpen ? D.green : null} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isSystemPerson(open) ? D.pink : "inherit" }}>{dispName(open)}</div>
              <div style={{ fontSize: 11.5, color: D.muted, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {isSystemPerson(open) ? "Official · " + (open.email || "PullUp") : contactBits.length > 0 ? contactBits.join("  ·  ") : (open.relationship || "Tap to open their room")}
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
                {!mine && <Avatar name={open.name} src={open.avatarUrl} size={22} system={isSystemPerson(open)} />}
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
                      {/* System-voiced sends (concierge) went out as PullUp, not a plain host note. */}
                      {m.sentAs && (
                        <span title={`Sent as ${m.sentAs}`} style={{ display: "inline-flex", alignItems: "center", gap: 3, color: D.pink, fontWeight: 700 }}>
                          <img src="/pullup-smalleyes.svg" alt="" style={{ width: 12, display: "block" }} /> PullUp
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

        {renderComposer(send, `Message on ${ch.label}…`)}
      </div>
    );
  };

  // ── Broadcast view — compose once, send one-to-many, watch it land ────────
  const broadcastView = (split = false) => {
    const sp = sendProgress;
    // Per-channel progress rows — the "did they get it?" answer. Each rail fills
    // pending → sent on its own bar, with a tick when its group completes.
    const channelRows = (s) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        {Object.entries(s.groups).map(([c, g]) => {
          const meta = CH[c] || CH.email; const Icon = CH_ICON[c] || MessageCircle;
          const pct = g.total ? Math.round((g.done / g.total) * 100) : 100;
          const done = g.done >= g.total;
          return (
            <div key={c}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Icon size={15} color={meta.color} strokeWidth={2.25} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>{meta.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: D.muted }}>{g.done}/{g.total}</span>
                {done ? <Check size={14} color={D.green} strokeWidth={3} /> : <Loader2 size={13} color={meta.color} style={{ animation: "spin 0.9s linear infinite" }} />}
              </div>
              <div style={{ height: 6, borderRadius: 999, background: D.raise, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: meta.color, borderRadius: 999, transition: "width 0.35s ease" }} />
              </div>
              {g.failed > 0 && <div style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>{g.failed} couldn’t send — they’ll have no open rail</div>}
            </div>
          );
        })}
      </div>
    );
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: `1px solid ${D.line}` }}>
          {!sp && <button onClick={() => setBroadcast(false)} style={{ ...iconBtn, color: D.ink }} aria-label="Back"><ChevronLeft size={20} /></button>}
          <div style={{ display: "flex" }}>
            {selectedPeople.slice(0, 5).map((p, i) => (
              <div key={p.id} style={{ marginLeft: i === 0 ? 0 : -9, borderRadius: "50%", boxShadow: `0 0 0 2px ${D.bg}` }}><Avatar name={p.name} src={p.avatarUrl} size={30} /></div>
            ))}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedPeople.length} {selectedPeople.length === 1 ? "person" : "people"}</div>
            <div style={{ fontSize: 11, color: D.muted }}>{sp?.complete ? "sent" : sp ? "sending…" : "each gets it on their own channel"}</div>
          </div>
          {!split && onClose && <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={18} /></button>}
        </div>

        {/* Recipients — a compact scrollable bar so the message area breathes. */}
        {!sp?.complete && (
          <div style={{ flexShrink: 0, display: "flex", gap: 6, overflowX: "auto", padding: "9px 12px", borderBottom: `1px solid ${D.line}`, whiteSpace: "nowrap" }}>
            {selectedPeople.map((p) => {
              const pch = CH[resolveActiveCh(p, null)] || CH.email;
              return (
                <span key={p.id} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 9px 5px 5px", borderRadius: 999, background: D.raise, color: D.ink }}>
                  <Avatar name={p.name} src={p.avatarUrl} size={20} />{(p.name || "").split(" ")[0]}
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: pch.color }}>{pch.label.slice(0, 2).toUpperCase()}</span>
                  {!sp && <button type="button" onClick={() => toggleSel(p.id)} style={{ ...iconBtn, padding: 0, color: D.faint }}><X size={12} /></button>}
                </span>
              );
            })}
          </div>
        )}

        {/* Composing → a roomy message area; sending → live per-channel progress;
            done → "Send complete" + a clear way back (there's no group thread). */}
        {!sp && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div style={{ fontSize: 12.5, color: D.faint, textAlign: "center", lineHeight: 1.5 }}>One message, delivered to each person individually on their own channel — not a group thread. Replies come back to their own thread in your inbox.</div>
            </div>
            {renderComposer(sendBroadcast, `Message ${selectedPeople.length} ${selectedPeople.length === 1 ? "person" : "people"}…`, { broadcast: true, showSubject: selectedPeople.some((p) => resolveActiveCh(p, null) === "email") })}
          </>
        )}

        {sp && !sp.complete && (
          <div style={{ flex: 1, overflowY: "auto", padding: "18px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <Loader2 size={16} color={D.pink} style={{ animation: "spin 0.9s linear infinite" }} />
              <span style={{ fontSize: 14, fontWeight: 700 }}>Sending to {sp.total}…</span>
              <span style={{ marginLeft: "auto", fontSize: 12.5, color: D.muted }}>{sp.done}/{sp.total}</span>
            </div>
            {channelRows(sp)}
          </div>
        )}

        {sp?.complete && (
          <div style={{ flex: 1, overflowY: "auto", padding: "22px 18px 18px", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 20 }}>
              <CheckCircle2 size={46} color={D.green} strokeWidth={2} />
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 10 }}>Send complete</div>
              <div style={{ fontSize: 13, color: D.muted, marginTop: 4 }}>
                {sp.done - sp.failed} of {sp.total} delivered{sp.failed > 0 ? ` · ${sp.failed} couldn’t send` : ""}
              </div>
            </div>
            {channelRows(sp)}
            <div style={{ flex: 1, minHeight: 16 }} />
            <button onClick={finishBroadcast}
              style={{ width: "100%", padding: "13px", borderRadius: 12, border: "none", background: D.youGrad, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              Back to messages <ChevronRight size={16} />
            </button>
            <div style={{ fontSize: 11.5, color: D.faint, textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>Each reply lands in that person’s own thread in your inbox.</div>
          </div>
        )}
      </div>
    );
  };

  // ── List view ───────────────────────────────────────────────────────────
  const listView = (split = false) => (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: D.bg, color: D.ink }}>
      <div style={{ position: "relative", zIndex: 20 }}>
        <div style={{ position: "relative", zIndex: 3, display: "flex", alignItems: "center", gap: 6, padding: "13px 12px 11px 16px", borderBottom: `1px solid ${D.line}`, background: D.bg }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em", flex: 1 }}>Messages</div>
          {onToggleExpand && <button onClick={onToggleExpand} style={iconBtn} aria-label="Expand">{expanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>}
          {onClose && <button onClick={onClose} style={iconBtn} aria-label="Close"><X size={19} /></button>}
        </div>

      </div>

      <div style={{ padding: "10px 12px 8px" }}>
        <div style={{ position: "relative", marginBottom: filterSummary.length || selecting ? 9 : 0 }}>
          <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: D.faint }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" type="search"
            name="pullup-search" autoComplete="off" data-lpignore="true" data-1p-ignore data-form-type="other"
            style={{ width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 32px", borderRadius: 10, border: "none", background: D.raise, color: D.ink, fontSize: 13, outline: "none" }} />
        </div>

        {/* Active-filter line — only when something narrows the list (the count
            itself lives on the write bar at the bottom, once). */}
        {people && filterSummary.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: D.muted, flexWrap: "wrap" }}>
            <Users size={13} color={D.pink} style={{ flexShrink: 0 }} />
            <span>{filterSummary.join(" · ")}</span>
            <button onClick={clearFilters} style={{ ...iconBtn, fontSize: 11.5, fontWeight: 700, color: D.faint, padding: "0 4px", marginLeft: 2 }}>Clear</button>
          </div>
        )}

        {/* Select-all over the filtered set when in selection mode. */}
        {selecting && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: filterSummary.length ? 7 : 0 }}>
            <button onClick={toggleSelectAll} style={{ ...iconBtn, fontSize: 12.5, fontWeight: 700, color: D.pink, padding: "4px 6px", whiteSpace: "nowrap" }}>
              {allVisibleSelected ? "Clear" : `Select all · ${list.length}`}
            </button>
            <div style={{ flex: 1 }} />
            {selected.length > 0 && <span style={{ fontSize: 12, color: D.muted }}>{selected.length} selected</span>}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px" }}>
        {people === null && <div style={{ fontSize: 13, color: D.faint, padding: 14 }}>Loading…</div>}
        {people && list.length === 0 && <div style={{ fontSize: 13, color: D.faint, padding: 14 }}>No one here yet.</div>}
        {list.map((p) => {
          const line = p.lastMessage?.text || p.relationship || "";
          const sel = selected.includes(p.id);
          const baseBg = (selecting && sel) || (split && p.id === openId) ? D.hover : "none";
          return (
            <button key={p.id} onClick={() => (selecting ? toggleSel(p.id) : setOpenId(p.id))} onMouseEnter={(e) => (e.currentTarget.style.background = D.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = baseBg)}
              style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "9px 10px", border: "none", borderRadius: 12, background: baseBg, cursor: "pointer", textAlign: "left", transition: "background 0.12s" }}>
              <Avatar name={p.name} src={p.avatarUrl} size={44} system={isSystemPerson(p)} dot={p.channel === "whatsapp" && p.windowOpen ? D.green : null} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: isSystemPerson(p) ? D.pink : D.ink }}>{dispName(p)}</span>
                  {p.awaitingReply && <span style={{ width: 7, height: 7, borderRadius: 999, background: D.pink, flexShrink: 0 }} />}
                </div>
                {/* Preview · time — inline, Instagram-style: the preview truncates, the time stays. */}
                <div style={{ display: "flex", alignItems: "baseline", fontSize: 12.5, color: D.muted, minWidth: 0 }}>
                  <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line}</span>
                  {relTimeShort(p.lastActivityAt) && <span style={{ flexShrink: 0, color: p.awaitingReply ? D.pink : D.faint, fontWeight: p.awaitingReply ? 600 : 400 }}>{line ? " · " : ""}{relTimeShort(p.lastActivityAt)}</span>}
                </div>
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

      {/* The foot — audience controls live NEXT TO the action they shape. The
          filter sheet expands UP from here (anchored to this bar), the count
          on the write bar updates live underneath, nothing floats detached. */}
      {people && (
        <div style={{ position: "relative", zIndex: 20, borderTop: `1px solid ${D.line}`, background: D.bg, padding: "8px 12px 10px" }}>
        {filtersOpen && (
          <>
            <div onClick={() => setFiltersOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 1 }} />
            <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: 8, right: 8, zIndex: 2, background: D.bg, border: `1px solid ${D.line}`, borderRadius: 14, boxShadow: "0 -14px 40px rgba(10,10,10,0.18)", maxHeight: "min(470px, 62vh)", overflowY: "auto", display: "flex", flexDirection: "column" }}>
              {/* Clear close affordance — the panel is a sheet you can always get
                  out of (tap Done, the X, or anywhere outside). */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px 9px", borderBottom: `1px solid ${D.line}`, position: "sticky", top: 0, background: D.bg, zIndex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 800 }}>Choose who to message</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {activeFilterCount > 0 && <button onClick={clearFilters} style={{ ...iconBtn, fontSize: 12, fontWeight: 700, color: D.pink, padding: "2px 6px" }}>Reset</button>}
                  <button onClick={() => setFiltersOpen(false)} aria-label="Done" style={{ ...iconBtn, fontSize: 12.5, fontWeight: 800, color: D.muted, padding: "2px 6px" }}>Done</button>
                </div>
              </div>
              <div style={{ padding: "4px 14px 14px" }}>

              <div style={fLabel}>Channel</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={clearChannels} style={{ ...pill(channels.length === 0, D.muted), padding: "5px 11px" }}>Any</button>
                {["whatsapp", "instagram", "email"].map((c) => {
                  const Icon = CH_ICON[c];
                  return (
                    <button key={c} onClick={() => toggleChannel(c)} title={CH[c].label} aria-label={CH[c].label}
                      style={{ ...pill(channels.includes(c), CH[c].color), display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px" }}>
                      <Icon size={14} strokeWidth={2.25} />
                    </button>
                  );
                })}
              </div>

              <div style={fLabel}>People</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["all", "Everyone"], ["community", "Community"], ["guests", "Event guests"], ["customers", "Customers"], ["pulledup", "Pulled up"]].map(([v, label]) => (
                  <button key={v} onClick={() => setSegment(v)} style={pill(segment === v)}>{label}</button>
                ))}
              </div>

              {roomEvents.length > 0 && (
                <>
                  <div style={fLabel}>Events</div>
                  <button onClick={() => setEventPickerOpen((o) => !o)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, width: "100%", boxSizing: "border-box", padding: "8px 11px", borderRadius: 10, border: `1px solid ${eventIds.length ? D.pink : D.line}`, background: D.raise, color: eventIds.length ? D.pink : D.ink, fontWeight: eventIds.length ? 700 : 500, fontSize: 12.5, cursor: "pointer" }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {eventIds.length === 0 ? "All events" : eventIds.length === 1 ? (roomEvents.find((e) => e.id === eventIds[0])?.title || "1 event") : `${eventIds.length} events selected`}
                    </span>
                    <ChevronDown size={15} style={{ flexShrink: 0, transform: eventPickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
                  </button>
                  {eventPickerOpen && (
                    <div style={{ marginTop: 6, border: `1px solid ${D.line}`, borderRadius: 10, maxHeight: 176, overflowY: "auto", background: D.raise }}>
                      {eventIds.length > 0 && (
                        <button onClick={clearEvents} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 11px", border: "none", borderBottom: `1px solid ${D.line}`, background: "none", color: D.muted, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Clear selection</button>
                      )}
                      {roomEvents.map((ev) => {
                        const on = eventIds.includes(ev.id);
                        return (
                          <button key={ev.id} onClick={() => toggleEvent(ev.id)}
                            style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left", padding: "8px 11px", border: "none", background: on ? D.hover : "none", color: D.ink, fontSize: 12.5, cursor: "pointer" }}>
                            <span style={{ width: 17, height: 17, flexShrink: 0, borderRadius: 5, border: `2px solid ${on ? D.pink : D.line}`, background: on ? D.pink : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>{on && <Check size={11} color="#fff" strokeWidth={3.5} />}</span>
                            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ev.title}</span>
                            <span style={{ fontSize: 10.5, color: D.faint, textTransform: "capitalize", flexShrink: 0 }}>{ev.status}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {eventIds.length > 0 && (
                    <>
                      <div style={fLabel}>Attendance</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {[["all", "All"], ["going", "Going"], ["waitlist", "Waitlist"]].map(([v, label]) => (
                          <button key={v} onClick={() => setAttendance(v)} style={pill(attendance === v)}>{label}</button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              </div>
            </div>
          </>
        )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: list.length > 0 ? 8 : 0 }}>
            <button onClick={() => setFiltersOpen((o) => !o)}
              style={{ ...pill(filtersOpen || activeFilterCount > 0), display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 11px" }}>
              <SlidersHorizontal size={13} strokeWidth={2.4} />
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
            <div style={{ flex: 1 }} />
            <button onClick={() => (selecting ? exitSelect() : setSelecting(true))} style={{ ...iconBtn, fontSize: 12.5, fontWeight: 700, color: selecting ? D.pink : D.muted, padding: "4px 8px" }}>{selecting ? "Done" : "Select"}</button>
          </div>

          {broadcastList.length > 0 && !selecting && (
            <button onClick={messageAudience}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "11px", borderRadius: 12, border: "none", background: D.youGrad, color: "#fff", fontWeight: 800, fontSize: 13.5, cursor: "pointer", boxShadow: "0 6px 18px rgba(236,23,143,0.22)" }}>
              <PenLine size={16} /> {(activeFilterCount > 0 || q.trim())
                ? `Write to these ${broadcastList.length} ${broadcastList.length === 1 ? "person" : "people"}`
                : `Write to everyone · ${broadcastList.length}`}
            </button>
          )}

          {selecting && selected.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: D.muted, flex: 1 }}>{selected.length} selected</div>
              <button onClick={() => { setDraft(""); setSubject(""); setAttachments([]); setSmartOpen(false); setSendProgress(null); setBroadcast(true); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "9px 16px", borderRadius: 999, border: "none", background: D.youGrad, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: "pointer" }}>
                Write to {selected.length} <ChevronRight size={15} />
              </button>
            </div>
          )}
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
