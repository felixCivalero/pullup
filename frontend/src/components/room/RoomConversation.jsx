// RoomConversation — the event room's COLLECTIVE talk, organised into TOPICS
// (Slack-simple: a "Main" topic always on, plus host-curated subjects). Shared
// by the host view (EventRoomPage, light, can create topics) and the guest
// view (PullUpPage interior, dark, post-only). It's pure UI + state; each side
// passes an `api` adapter so it doesn't care about auth-vs-email plumbing.
//
//   api.loadChannels()            -> [{ id, name, isMain }]
//   api.loadMessages(channelId)   -> [{ id, body, authorName, isHost, at }]
//   api.post(channelId, body)     -> [{...messages}]  (returns fresh list)
//   api.createTopic(name)         -> [{...channels}]   (host only; optional)
//
// The conversation reads like a comment thread (Reddit-ish): each post can be
// replied to, replies nest under their parent with a connecting rail, threads
// collapse, and there's a light heart. NOTE: nesting + hearts are session-local
// for now — messages are real & persisted, but the parent/heart relationship
// lives in component state until the backend grows a `parent_id` column.

import { useEffect, useState, useCallback } from "react";

// "just now" / "12m" / "3h" / "2d" / "Jun 2"
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

export default function RoomConversation({ dark = false, canCreateTopic = false, canPost = true, sidebar = false, api }) {
  const C = dark
    ? { ink: "#f5f4f7", muted: "rgba(245,244,247,0.55)", faint: "rgba(245,244,247,0.35)", pink: "#ec178f", border: "rgba(255,255,255,0.12)", chip: "rgba(255,255,255,0.06)", field: "rgba(255,255,255,0.04)", fieldBg: "rgba(255,255,255,0.04)", rail: "rgba(255,255,255,0.14)" }
    : { ink: "#0a0a0a", muted: "rgba(10,10,10,0.55)", faint: "rgba(10,10,10,0.4)", pink: "#ec178f", border: "rgba(10,10,10,0.10)", chip: "rgba(10,10,10,0.04)", field: "#fff", fieldBg: "#fff", rail: "rgba(10,10,10,0.10)" };

  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState("");

  // Thread state (session-local until backend supports it):
  const [parentOf, setParentOf] = useState({});     // messageId -> parentMessageId
  const [hearts, setHearts] = useState({});          // messageId -> { n, mine }
  const [collapsed, setCollapsed] = useState({});    // messageId -> true
  const [replyTo, setReplyTo] = useState(null);      // messageId being replied to
  const [replyDraft, setReplyDraft] = useState("");

  const loadMsgs = useCallback(async (chId) => {
    setMessages(await api.loadMessages(chId).catch(() => []));
  }, [api]);

  useEffect(() => {
    let alive = true;
    api.loadChannels().then((chs) => {
      if (!alive) return;
      setChannels(chs || []);
      const main = (chs || []).find((c) => c.isMain) || (chs || [])[0] || null;
      setActive(main?.id || null);
      if (main) loadMsgs(main.id);
    }).catch(() => setChannels([]));
    return () => { alive = false; };
  }, [api, loadMsgs]);

  function pick(chId) {
    setActive(chId); setMessages(null); setReplyTo(null); loadMsgs(chId);
  }

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !active) return;
    setSending(true);
    try { const fresh = await api.post(active, body); setMessages(fresh || []); setDraft(""); }
    finally { setSending(false); }
  }

  // Post a reply: it's a real message; we just remember it hangs under `parentId`.
  async function sendReply(parentId) {
    const body = replyDraft.trim();
    if (!body || !active) return;
    const prevIds = new Set((messages || []).map((m) => m.id));
    setSending(true);
    try {
      const fresh = await api.post(active, body);
      setMessages(fresh || []);
      const added = (fresh || []).find((m) => !prevIds.has(m.id));
      if (added) setParentOf((p) => ({ ...p, [added.id]: parentId }));
      setReplyDraft(""); setReplyTo(null);
    } finally { setSending(false); }
  }

  async function addTopic(e) {
    e.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    const fresh = await api.createTopic(name).catch(() => null);
    if (fresh) { setChannels(fresh); const made = fresh.find((c) => c.name === name); setNewTopic(""); setAdding(false); if (made) pick(made.id); }
  }

  function toggleHeart(id) {
    setHearts((h) => {
      const cur = h[id] || { n: 0, mine: false };
      return { ...h, [id]: { n: cur.n + (cur.mine ? -1 : 1), mine: !cur.mine } };
    });
  }

  const tab = (on) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${on ? C.pink : C.border}`, whiteSpace: "nowrap",
    background: on ? C.pink : C.chip, color: on ? "#fff" : C.ink,
  });

  // Warm face on every message — the host glows pink, everyone else gets a
  // soft tint that stays the same for them. Makes the topic feel like a circle.
  const AV_TINTS = [
    { bg: "rgba(236,23,143,0.14)", fg: "#ec178f" },
    { bg: "rgba(13,148,136,0.14)", fg: "#0d9488" },
    { bg: "rgba(234,88,12,0.14)",  fg: "#ea580c" },
    { bg: "rgba(124,58,237,0.14)", fg: "#7c3aed" },
    { bg: "rgba(20,120,200,0.14)", fg: "#1478c8" },
  ];
  const Avatar = ({ name, host, size = 28 }) => {
    let h = 0;
    for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const t = host ? { bg: C.pink, fg: "#fff" } : AV_TINTS[h % AV_TINTS.length];
    const ini = String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.39), fontWeight: 800, background: t.bg, color: t.fg, letterSpacing: "-0.02em" }}>{ini}</div>
    );
  };

  // Build the tree from flat messages + the session parent map.
  const list = messages || [];
  const byId = Object.fromEntries(list.map((m) => [m.id, m]));
  const childrenOf = {};
  for (const m of list) {
    const p = parentOf[m.id];
    if (p && byId[p]) (childrenOf[p] = childrenOf[p] || []).push(m);
  }
  const roots = list.filter((m) => { const p = parentOf[m.id]; return !p || !byId[p]; });
  const countDescendants = (id) => {
    const kids = childrenOf[id] || [];
    return kids.reduce((acc, k) => acc + 1 + countDescendants(k.id), 0);
  };

  const metaBtn = { background: "none", border: "none", padding: 0, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };

  const Comment = ({ m, depth }) => {
    const kids = childrenOf[m.id] || [];
    const isCollapsed = !!collapsed[m.id];
    const hr = hearts[m.id] || { n: 0, mine: false };
    const showKids = kids.length > 0 && !isCollapsed;
    return (
      <div style={{ display: "flex", gap: 9, alignItems: "stretch" }}>
        {/* avatar column + the thread rail dropping to replies */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
          <Avatar name={m.authorName} host={m.isHost} />
          {showKids && <div style={{ flex: 1, width: 2, background: C.rail, marginTop: 6, borderRadius: 2 }} />}
        </div>

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: m.isHost ? C.pink : C.ink }}>{m.authorName}{m.isHost ? " · host" : ""}</span>
            {m.at && <span style={{ fontSize: 11.5, color: C.faint }}>{timeAgo(m.at)}</span>}
            {kids.length > 0 && (
              <button onClick={() => setCollapsed((c) => ({ ...c, [m.id]: !c[m.id] }))} style={{ ...metaBtn, color: C.faint, fontSize: 11.5 }}>
                {isCollapsed ? `[+${countDescendants(m.id)}]` : "[–]"}
              </button>
            )}
          </div>
          <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.45, marginTop: 1 }}>{m.body}</div>

          {/* action row */}
          <div style={{ display: "flex", gap: 16, marginTop: 5 }}>
            <button onClick={() => toggleHeart(m.id)} style={{ ...metaBtn, color: hr.mine ? C.pink : C.muted, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 13 }}>{hr.mine ? "♥" : "♡"}</span>{hr.n > 0 ? hr.n : ""}
            </button>
            {canPost && <button onClick={() => { setReplyTo(replyTo === m.id ? null : m.id); setReplyDraft(""); }} style={{ ...metaBtn, color: C.muted }}>Reply</button>}
          </div>

          {/* inline reply composer */}
          {canPost && replyTo === m.id && (
            <form onSubmit={(e) => { e.preventDefault(); sendReply(m.id); }} style={{ display: "flex", gap: 7, marginTop: 9 }}>
              <input autoFocus value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder={`Reply to ${String(m.authorName || "").split(/\s+/)[0]}…`}
                style={{ flex: 1, padding: "8px 11px", borderRadius: 10, border: `1px solid ${C.border}`, background: C.field, color: C.ink, fontSize: 13, outline: "none" }} />
              <button type="submit" disabled={sending || !replyDraft.trim()} style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: C.pink, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", opacity: replyDraft.trim() ? 1 : 0.5 }}>Reply</button>
            </form>
          )}

          {/* nested replies */}
          {showKids && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
              {kids.map((k) => <Comment key={k.id} m={k} depth={depth + 1} />)}
            </div>
          )}
        </div>
      </div>
    );
  };

  const activeChannel = channels.find((c) => c.id === active) || null;
  const activeName = activeChannel ? (activeChannel.isMain ? "Main" : activeChannel.name) : "";

  // ── Composer (top, forum-style) + the thread (newest-first) ──
  // When the viewer's state can't post (e.g. a waitlist peek, or a read-only
  // lobby the host locked), we show a quiet note instead of an input that 403s.
  const composer = canPost ? (
    <form onSubmit={send} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={sidebar && activeName ? `Message #${activeName.toLowerCase().replace(/\s+/g, "-")}…` : "Add to this topic…"}
        style={{ flex: 1, padding: "11px 13px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.field, color: C.ink, fontSize: 14, outline: "none" }} />
      <button type="submit" disabled={sending || !draft.trim()} style={{ padding: "11px 18px", borderRadius: 12, border: "none", background: C.pink, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: draft.trim() ? 1 : 0.5 }}>Post</button>
    </form>
  ) : (
    <div style={{ fontSize: 13, color: C.muted, padding: "11px 13px", borderRadius: 12, border: `1px dashed ${C.border}`, marginBottom: 16, textAlign: "center" }}>
      You can see the room — posting isn't open to you yet.
    </div>
  );
  const thread = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxHeight: sidebar ? 420 : 360, overflowY: "auto" }}>
      {[...roots].reverse().map((m) => <Comment key={m.id} m={m} depth={0} />)}
      {messages && roots.length === 0 && (
        <div style={{ fontSize: 13, color: C.faint }}>Nothing in #{activeName ? activeName.toLowerCase().replace(/\s+/g, "-") : "this"} yet. Start it off.</div>
      )}
      {messages === null && <div style={{ fontSize: 13, color: C.faint }}>Loading…</div>}
    </div>
  );

  // ── Channels as horizontal pills (guest / stacked view) ──
  if (!sidebar) {
    return (
      <div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
          {channels.map((c) => (
            <button key={c.id} onClick={() => pick(c.id)} style={tab(c.id === active)}>
              {c.isMain ? "Main" : c.name}
            </button>
          ))}
          {canCreateTopic && !adding && (
            <button onClick={() => setAdding(true)} style={{ ...tab(false), borderStyle: "dashed", color: C.muted }}>+ topic</button>
          )}
          {canCreateTopic && adding && (
            <form onSubmit={addTopic} style={{ display: "inline-flex", gap: 6 }}>
              <input autoFocus value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Group shot…"
                onBlur={() => { if (!newTopic.trim()) setAdding(false); }}
                style={{ padding: "6px 10px", borderRadius: 999, border: `1px solid ${C.pink}`, background: C.fieldBg, color: C.ink, fontSize: 13, outline: "none", width: 130 }} />
            </form>
          )}
        </div>
        {composer}
        {thread}
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
    <div style={{ display: "flex", gap: 18, alignItems: "stretch" }}>
      {/* Channel rail — a soft pink-tinted panel so it reads as a channel list */}
      <aside style={{ width: 162, flexShrink: 0, background: dark ? "rgba(255,255,255,0.04)" : "rgba(236,23,143,0.05)", border: `1px solid ${dark ? C.border : "rgba(236,23,143,0.13)"}`, borderRadius: 12, padding: 10, alignSelf: "flex-start", display: "flex", flexDirection: "column", gap: 2 }}>
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
        {canCreateTopic && !adding && (
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

      {/* Active channel */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {activeName && (
          <div style={{ fontSize: 15.5, fontWeight: 750, color: C.ink, marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "baseline", gap: 5, letterSpacing: "-0.01em" }}>
            <span style={{ color: C.pink, fontWeight: 800 }}>#</span>{activeName.toLowerCase().replace(/\s+/g, "-")}
          </div>
        )}
        {composer}
        {thread}
      </div>
    </div>
  );
}
