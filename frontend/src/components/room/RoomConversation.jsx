// RoomConversation — the event room's COLLECTIVE talk, organised into CHANNELS
// (Slack-simple: a "Main" channel always on, plus host-curated topics). Shared
// by the host view (EventRoomPage) and the guest view, both light. It's pure
// UI + state; each side passes an `api` adapter so it doesn't care about the
// auth-vs-email plumbing underneath.
//
//   api.loadChannels()            -> [{ id, name, isMain }]
//   api.loadMessages(channelId)   -> [{ id, body, authorName, isHost, at }]   (oldest → newest)
//   api.post(channelId, body)     -> [{...messages}]   (returns the fresh list)
//   api.createTopic(name)         -> [{...channels}]    (host only; optional)
//
// This is a real chat surface, Slack/Discord-grade:
//   • bottom composer, messages run oldest→newest, autoscroll to newest
//   • OPTIMISTIC send — your message appears the instant you hit enter, then
//     reconciles with the server; a failed send shows "Failed · Retry"
//   • Enter sends, Shift+Enter is a newline
//   • live polling so other people's posts appear without a reload
//   • consecutive posts from the same person group together (Slack-style)
//   • channels are de-duped (no accidental twin "#group-shot")
//
// Honesty note: there are no fake reactions/threads here. Reactions and real
// reply-threads need a backend column; until then "Reply" just @mentions the
// author into the composer. Better an honest chat than mocked engagement.

import { useEffect, useState, useCallback, useRef } from "react";

let TEMP_SEQ = 0;

// "just now" / "12m" / "3h" — used in the lightweight inline timestamp.
function timeAgo(at) {
  if (!at) return "";
  const t = new Date(at).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}w`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function channelKey(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, "-");
}
function firstName(name) {
  return String(name || "").trim().split(/\s+/)[0] || "";
}

// Drop accidental twins: same id, or same display name (the bug behind the
// duplicate "#group-shot"). Keep the first occurrence.
function dedupeChannels(list) {
  const seenId = new Set();
  const seenName = new Set();
  const out = [];
  for (const c of list || []) {
    if (!c || c.id == null) continue;
    if (seenId.has(c.id)) continue;
    const nm = c.isMain ? "main" : String(c.name || "").trim().toLowerCase();
    if (nm && seenName.has(nm)) continue;
    seenId.add(c.id);
    if (nm) seenName.add(nm);
    out.push(c);
  }
  return out;
}

export default function RoomConversation({
  dark = false,
  canCreateTopic = false,
  canPost = true,
  sidebar = false,
  api,
  meName = "",
  meIsHost = false,
}) {
  const C = dark
    ? { ink: "#f5f4f7", muted: "rgba(245,244,247,0.6)", faint: "rgba(245,244,247,0.4)", pink: "#ec178f", border: "rgba(255,255,255,0.12)", chip: "rgba(255,255,255,0.06)", field: "rgba(255,255,255,0.05)", fieldBg: "rgba(255,255,255,0.05)", hover: "rgba(255,255,255,0.04)", danger: "#fb7185" }
    : { ink: "#0a0a0a", muted: "rgba(10,10,10,0.6)", faint: "rgba(10,10,10,0.4)", pink: "#ec178f", border: "rgba(10,10,10,0.10)", chip: "rgba(10,10,10,0.04)", field: "#fff", fieldBg: "#fff", hover: "rgba(236,23,143,0.04)", danger: "#e11d48" };

  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState(null);  // server-authoritative (oldest→newest)
  const [pending, setPending] = useState([]);       // optimistic, not yet acked
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState("");

  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  // Track whether the viewer is parked at the bottom, so a background poll
  // never yanks them up while they're reading history.
  const atBottomRef = useRef(true);

  // Mobile gets the native STACKED layout (channel strip on top, full-width
  // messages, composer at the bottom) instead of the desktop rail+chat split.
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const stacked = !sidebar || isMobile;

  const scrollToBottom = useCallback(() => {
    // Mobile uses the page scroll (single, native scroll); desktop scrolls the
    // chat's own region.
    if (isMobile) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
      return;
    }
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [isMobile]);

  // On mobile the page is the scroll container, so track bottom-ness off the
  // window to avoid auto-yanking someone who's scrolled up to read history.
  useEffect(() => {
    if (!isMobile) return;
    const onWin = () => {
      atBottomRef.current =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;
    };
    window.addEventListener("scroll", onWin, { passive: true });
    return () => window.removeEventListener("scroll", onWin);
  }, [isMobile]);

  const loadMsgs = useCallback(async (chId) => {
    const fresh = await api.loadMessages(chId).catch(() => null);
    if (activeRef.current !== chId) return;
    if (Array.isArray(fresh)) {
      setMessages(fresh);
      // Clear any optimistic temp the server has now echoed back.
      setPending((p) => p.filter((t) => !fresh.some((m) => m.body === t.body && (m.isHost === t.isHost))));
    } else {
      setMessages((m) => m || []);
    }
  }, [api]);

  // Load channel list once.
  useEffect(() => {
    let alive = true;
    api.loadChannels().then((chs) => {
      if (!alive) return;
      const dd = dedupeChannels(chs);
      setChannels(dd);
      const main = dd.find((c) => c.isMain) || dd[0] || null;
      setActive(main?.id || null);
    }).catch(() => setChannels([]));
    return () => { alive = false; };
  }, [api]);

  // Load + poll the active channel.
  useEffect(() => {
    if (!active) return;
    setMessages(null);
    setPending([]);
    atBottomRef.current = true;
    loadMsgs(active);
    const iv = setInterval(() => loadMsgs(active), 5000);
    return () => clearInterval(iv);
  }, [active, loadMsgs]);

  // Autoscroll: on first paint of a channel + whenever new content arrives and
  // the viewer is already at the bottom.
  useEffect(() => {
    if (atBottomRef.current) scrollToBottom();
  }, [messages, pending, active, scrollToBottom]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  }

  function pick(chId) {
    if (chId !== active) setActive(chId);
  }

  async function doSend(body, fromTemp) {
    const text = (body || "").trim();
    if (!text || !active) return;
    const temp = fromTemp || {
      tempId: `t${++TEMP_SEQ}`,
      body: text,
      authorName: meName || "You",
      isHost: meIsHost,
      at: new Date().toISOString(),
      status: "sending",
    };
    atBottomRef.current = true;
    setPending((p) => (fromTemp ? p.map((t) => (t.tempId === temp.tempId ? { ...t, status: "sending" } : t)) : [...p, temp]));
    setSending(true);
    try {
      const fresh = await api.post(active, text);
      if (Array.isArray(fresh)) {
        setMessages(fresh);
        setPending((p) => p.filter((t) => t.tempId !== temp.tempId));
      } else {
        setPending((p) => p.map((t) => (t.tempId === temp.tempId ? { ...t, status: "failed" } : t)));
      }
    } catch {
      setPending((p) => p.map((t) => (t.tempId === temp.tempId ? { ...t, status: "failed" } : t)));
    } finally {
      setSending(false);
    }
  }

  function submit() {
    const b = draft;
    if (!b.trim()) return;
    setDraft("");
    if (taRef.current) taRef.current.style.height = "auto";
    doSend(b);
  }
  function onKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }
  function onInput(e) {
    setDraft(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }
  function mention(name) {
    const tag = `@${firstName(name)} `;
    setDraft((d) => (d.startsWith(tag) ? d : tag + d));
    taRef.current?.focus();
  }

  async function addTopic(e) {
    e.preventDefault();
    const name = newTopic.trim();
    if (!name || !api.createTopic) return;
    const fresh = await api.createTopic(name).catch(() => null);
    if (fresh) {
      const dd = dedupeChannels(fresh);
      setChannels(dd);
      const made = dd.find((c) => channelKey(c.name) === channelKey(name));
      setNewTopic(""); setAdding(false);
      if (made) pick(made.id);
    }
  }

  // ── Avatar — host glows pink, everyone else a stable soft tint. ──
  const AV_TINTS = [
    { bg: "rgba(236,23,143,0.14)", fg: "#ec178f" },
    { bg: "rgba(13,148,136,0.14)", fg: "#0d9488" },
    { bg: "rgba(234,88,12,0.14)",  fg: "#ea580c" },
    { bg: "rgba(124,58,237,0.14)", fg: "#7c3aed" },
    { bg: "rgba(20,120,200,0.14)", fg: "#1478c8" },
  ];
  const Avatar = ({ name, host, size = 36 }) => {
    let h = 0;
    for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const t = host ? { bg: C.pink, fg: "#fff" } : AV_TINTS[h % AV_TINTS.length];
    const ini = String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.38), fontWeight: 800, background: t.bg, color: t.fg, letterSpacing: "-0.02em" }}>{ini}</div>
    );
  };

  const activeChannel = channels.find((c) => c.id === active) || null;
  const activeName = activeChannel ? (activeChannel.isMain ? "Main" : activeChannel.name) : "";

  // Combined render stream: server messages then optimistic temps, all
  // chronological, with consecutive same-author posts grouped.
  const stream = [
    ...(messages || []).map((m) => ({ ...m, key: `m${m.id}` })),
    ...pending.map((t) => ({ ...t, id: t.tempId, key: t.tempId, optimistic: true })),
  ];

  const Row = ({ m, grouped }) => (
    <div
      style={{ display: "flex", gap: 10, padding: "2px 6px", borderRadius: 8, alignItems: "flex-start", opacity: m.status === "sending" ? 0.55 : 1 }}
      onMouseEnter={(e) => { e.currentTarget.style.background = C.hover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ width: 36, flexShrink: 0, display: "flex", justifyContent: "center", paddingTop: grouped ? 0 : 2 }}>
        {grouped ? null : <Avatar name={m.authorName} host={m.isHost} />}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        {!grouped && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: m.isHost ? C.pink : C.ink }}>
              {m.authorName}{m.isHost ? " · host" : ""}
            </span>
            {m.at && <span style={{ fontSize: 11, color: C.faint }}>{timeAgo(m.at)}</span>}
          </div>
        )}
        <div style={{ fontSize: 14, color: C.ink, lineHeight: 1.5, marginTop: grouped ? 0 : 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {m.body}
        </div>
        {m.status === "failed" && (
          <div style={{ fontSize: 11.5, color: C.danger, marginTop: 2, display: "inline-flex", gap: 8, alignItems: "center" }}>
            Couldn't send
            <button onClick={() => doSend(m.body, m)} style={{ background: "none", border: "none", padding: 0, color: C.pink, fontWeight: 700, fontSize: 11.5, cursor: "pointer" }}>Retry</button>
          </div>
        )}
        {!m.optimistic && canPost && (
          <button
            onClick={() => mention(m.authorName)}
            className="rc-reply"
            style={{ background: "none", border: "none", padding: 0, marginTop: 2, color: C.faint, fontSize: 11.5, fontWeight: 600, cursor: "pointer", opacity: 0, transition: "opacity 0.12s" }}
          >
            Reply
          </button>
        )}
      </div>
    </div>
  );

  const messagesPane = (
    <div
      ref={scrollRef}
      onScroll={onScroll}
      style={{ flex: isMobile ? "none" : 1, minHeight: 0, overflowY: isMobile ? "visible" : "auto", display: "flex", flexDirection: "column", gap: 2, padding: "4px 0" }}
    >
      <style>{`.rc-row-wrap:hover .rc-reply{opacity:1 !important;}`}</style>
      {messages === null && <div style={{ fontSize: 13, color: C.faint, padding: "8px 6px" }}>Loading…</div>}
      {messages !== null && stream.length === 0 && (
        <div style={{ fontSize: 13, color: C.faint, padding: "8px 6px" }}>
          Nothing in #{channelKey(activeName) || "this"} yet. {canPost ? "Start it off." : ""}
        </div>
      )}
      {stream.map((m, i) => {
        const prev = stream[i - 1];
        const grouped = !!prev
          && prev.isHost === m.isHost
          && (prev.authorName || "") === (m.authorName || "")
          && Math.abs(new Date(m.at).getTime() - new Date(prev.at).getTime()) < 5 * 60 * 1000;
        return (
          <div key={m.key} className="rc-row-wrap" style={{ marginTop: grouped ? 0 : 8 }}>
            <Row m={m} grouped={grouped} />
          </div>
        );
      })}
    </div>
  );

  const composer = canPost ? (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingTop: 12, borderTop: `1px solid ${C.border}`, ...(isMobile ? { position: "sticky", bottom: 0, marginTop: "auto", paddingBottom: 10, background: dark ? "#15101a" : "#ffffff", zIndex: 5 } : {}) }}>
      <textarea
        ref={taRef}
        value={draft}
        onChange={onInput}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder={activeName ? `Message #${channelKey(activeName)}` : "Message…"}
        style={{ flex: 1, resize: "none", maxHeight: 120, padding: "11px 13px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.field, color: C.ink, fontSize: isMobile ? 16 : 14, lineHeight: 1.4, outline: "none", fontFamily: "inherit" }}
      />
      <button
        onClick={submit}
        disabled={!draft.trim()}
        style={{ padding: "11px 18px", borderRadius: 12, border: "none", background: draft.trim() ? C.pink : C.chip, color: draft.trim() ? "#fff" : C.faint, fontWeight: 700, fontSize: 14, cursor: draft.trim() ? "pointer" : "default", flexShrink: 0, height: "fit-content" }}
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  ) : (
    <div style={{ fontSize: 13, color: C.muted, padding: "11px 13px", borderRadius: 12, border: `1px dashed ${C.border}`, textAlign: "center", marginTop: 12 }}>
      You can see the room — posting isn't open to you yet.
    </div>
  );

  // ── Channels as horizontal pills (guest / stacked view) ──
  const tab = (on) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${on ? C.pink : C.border}`, whiteSpace: "nowrap",
    background: on ? C.pink : C.chip, color: on ? "#fff" : C.ink,
  });

  if (stacked) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: isMobile ? "60vh" : undefined, height: isMobile ? "auto" : 440 }}>
        {/* Channel strip — horizontal scroll on mobile, the native channel switcher. */}
        <div style={{ display: "flex", gap: 8, flexWrap: isMobile ? "nowrap" : "wrap", overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling: "touch", alignItems: "center", marginBottom: 12, flexShrink: 0, paddingBottom: isMobile ? 2 : 0 }}>
          {channels.map((c) => (
            <button key={c.id} onClick={() => pick(c.id)} style={tab(c.id === active)}>
              {c.isMain ? "Main" : c.name}
            </button>
          ))}
          {canCreateTopic && api.createTopic && !adding && (
            <button onClick={() => setAdding(true)} style={{ ...tab(false), borderStyle: "dashed", color: C.muted }}>+ topic</button>
          )}
          {canCreateTopic && adding && (
            <form onSubmit={addTopic} style={{ display: "inline-flex", gap: 6 }}>
              <input autoFocus value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="group-shot…"
                onBlur={() => { if (!newTopic.trim()) setAdding(false); }}
                style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${C.pink}`, background: C.fieldBg, color: C.ink, fontSize: 13, outline: "none", width: 130 }} />
            </form>
          )}
        </div>
        {messagesPane}
        {composer}
      </div>
    );
  }

  // ── Slack-style: channel rail on the left, the active channel on the right ──
  const chanRow = (on) => ({
    display: "flex", alignItems: "center", gap: 7, padding: "7px 9px", borderRadius: 8,
    fontSize: 13.5, fontWeight: on ? 700 : 600, cursor: "pointer", width: "100%", textAlign: "left",
    border: "none", background: on ? C.pink : "transparent", color: on ? "#fff" : C.ink,
  });
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "stretch", height: 460 }}>
      <aside style={{ width: 162, flexShrink: 0, background: dark ? "rgba(255,255,255,0.04)" : "rgba(236,23,143,0.05)", border: `1px solid ${dark ? C.border : "rgba(236,23,143,0.13)"}`, borderRadius: 12, padding: 10, alignSelf: "stretch", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", padding: "0 9px", marginBottom: 6 }}>Channels</div>
        {channels.map((c) => {
          const on = c.id === active;
          const nm = c.isMain ? "Main" : c.name;
          return (
            <button key={c.id} onClick={() => pick(c.id)} style={chanRow(on)}>
              <span style={{ color: on ? "rgba(255,255,255,0.65)" : C.faint, fontWeight: 700 }}>#</span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nm}</span>
            </button>
          );
        })}
        {canCreateTopic && api.createTopic && !adding && (
          <button onClick={() => setAdding(true)} style={{ ...chanRow(false), color: C.muted, marginTop: 2 }}>
            <span style={{ fontWeight: 700 }}>+</span><span>Add channel</span>
          </button>
        )}
        {canCreateTopic && adding && (
          <form onSubmit={addTopic} style={{ padding: "2px 4px" }}>
            <input autoFocus value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="group-shot…"
              onBlur={() => { if (!newTopic.trim()) setAdding(false); }}
              style={{ width: "100%", boxSizing: "border-box", padding: "7px 9px", borderRadius: 8, border: `1px solid ${C.pink}`, background: C.fieldBg, color: C.ink, fontSize: 13, outline: "none" }} />
          </form>
        )}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {activeName && (
          <div style={{ fontSize: 15.5, fontWeight: 750, color: C.ink, marginBottom: 12, paddingBottom: 12, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 5, letterSpacing: "-0.01em", flexShrink: 0 }}>
            <span style={{ color: C.pink, fontWeight: 800 }}>#</span>{channelKey(activeName)}
          </div>
        )}
        {messagesPane}
        {composer}
      </div>
    </div>
  );
}
