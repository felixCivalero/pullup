// RoomConversation — the event room's COLLECTIVE talk, organised into TOPICS
// (Slack-simple: a "Main" topic always on, plus host-curated subjects). Shared
// by the host view (EventRoomPage, light, can create topics) and the guest
// view (PullUpPage interior, dark, post-only). It's pure UI + state; each side
// passes an `api` adapter so it doesn't care about auth-vs-email plumbing.
//
//   api.loadChannels()            -> [{ id, name, isMain }]
//   api.loadMessages(channelId)   -> [{ id, body, authorName, isHost }]
//   api.post(channelId, body)     -> [{...messages}]  (returns fresh list)
//   api.createTopic(name)         -> [{...channels}]   (host only; optional)

import { useEffect, useState, useCallback } from "react";

export default function RoomConversation({ dark = false, canCreateTopic = false, api }) {
  const C = dark
    ? { ink: "#f5f4f7", muted: "rgba(245,244,247,0.55)", faint: "rgba(245,244,247,0.35)", pink: "#ec178f", border: "rgba(255,255,255,0.12)", chip: "rgba(255,255,255,0.06)", field: "rgba(255,255,255,0.04)", fieldBg: "rgba(255,255,255,0.04)" }
    : { ink: "#0a0a0a", muted: "rgba(10,10,10,0.55)", faint: "rgba(10,10,10,0.4)", pink: "#ec178f", border: "rgba(10,10,10,0.10)", chip: "rgba(10,10,10,0.04)", field: "#fff", fieldBg: "#fff" };

  const [channels, setChannels] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTopic, setNewTopic] = useState("");

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

  function pick(chId) { setActive(chId); setMessages(null); loadMsgs(chId); }

  async function send(e) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || !active) return;
    setSending(true);
    try { const fresh = await api.post(active, body); setMessages(fresh || []); setDraft(""); }
    finally { setSending(false); }
  }

  async function addTopic(e) {
    e.preventDefault();
    const name = newTopic.trim();
    if (!name) return;
    const fresh = await api.createTopic(name).catch(() => null);
    if (fresh) { setChannels(fresh); const made = fresh.find((c) => c.name === name); setNewTopic(""); setAdding(false); if (made) pick(made.id); }
  }

  const tab = (on) => ({
    padding: "6px 12px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer",
    border: `1px solid ${on ? C.pink : C.border}`, whiteSpace: "nowrap",
    background: on ? C.pink : C.chip, color: on ? "#fff" : C.ink,
  });

  return (
    <div>
      {/* Topic tabs */}
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

      {/* Messages in the active topic */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 260, overflowY: "auto", marginBottom: 12 }}>
        {(messages || []).map((m) => (
          <div key={m.id}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: m.isHost ? C.pink : C.ink }}>{m.authorName}{m.isHost ? " · host" : ""}</span>
            <div style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.45 }}>{m.body}</div>
          </div>
        ))}
        {messages && messages.length === 0 && (
          <div style={{ fontSize: 13, color: C.faint }}>Nothing in this topic yet. Start it off.</div>
        )}
        {messages === null && <div style={{ fontSize: 13, color: C.faint }}>Loading…</div>}
      </div>

      {/* Composer */}
      <form onSubmit={send} style={{ display: "flex", gap: 8 }}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message this topic…"
          style={{ flex: 1, padding: "11px 13px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.field, color: C.ink, fontSize: 14, outline: "none" }} />
        <button type="submit" disabled={sending || !draft.trim()} style={{ padding: "11px 18px", borderRadius: 12, border: "none", background: C.pink, color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: draft.trim() ? 1 : 0.5 }}>Send</button>
      </form>
    </div>
  );
}
