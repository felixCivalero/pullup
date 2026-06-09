// RoomConversation — the event room as ONE FLOWING FEED.
//
// You land and you're *in it*: a single stream you can drop anything into — a
// thought, a photo, a clip, a voice note, a gif — and every post is repliable.
// Replies tuck under their post (collapsed "N replies", tap to open), and you
// can reply with media too. Any post can be ATTACHED TO THE TOP (pinned), which
// lifts it into a slim strip above the feed.
//
// Media is uploaded DIRECT to storage from the browser (signed URL), so any
// file type and any reasonable size just works — images, video, audio, gifs,
// whatever. Gifs come from the Giphy picker as ready URLs (no upload).
//
// Pure UI + state. Each side passes an `api` adapter:
//   api.loadMessages()                          -> [{ id, body, authorName, isHost, personId, parentId, media:[{url,type}], pinned, at }]
//   api.post({ body, parentId, media, pinned }) -> fresh message list   (media = [{url,type}], already hosted)
//   api.pin(messageId, pinned)                  -> fresh message list
//   api.uploadMedia(file)                       -> { url, type }         (signed upload)
//   api.searchGifs(query)                       -> { disabled, gifs:[{id,preview,url}] }

import { useEffect, useState, useCallback, useRef } from "react";
import { Paperclip, Pin, PinOff, X, File as FileIcon, Search } from "lucide-react";

// "just now" / "12m" / "3h"
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
function firstName(name) { return String(name || "").trim().split(/\s+/)[0] || ""; }
function fileType(file) {
  const t = file.type || "";
  if (t.startsWith("image/")) return t.includes("gif") ? "gif" : "image";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("audio/")) return "audio";
  return "file";
}

const AV_TINTS = [
  { bg: "rgba(236,23,143,0.14)", fg: "#ec178f" },
  { bg: "rgba(13,148,136,0.14)", fg: "#0d9488" },
  { bg: "rgba(234,88,12,0.14)",  fg: "#ea580c" },
  { bg: "rgba(124,58,237,0.14)", fg: "#7c3aed" },
  { bg: "rgba(20,120,200,0.14)", fg: "#1478c8" },
];

// A cheap fingerprint of the server feed — id + the fields that change what's on
// screen (pin, body, media count, time). If two polls fingerprint the same, the
// view is already correct and we skip the state update entirely: no re-render,
// no scroll nudge. The room sits perfectly still until something actually moves.
function feedSig(list) {
  return (list || [])
    .map((m) => `${m.id}:${m.pinned ? 1 : 0}:${(m.media || []).length}:${(m.body || "").length}:${m.at || ""}:${m.editedAt || ""}:${m.deleted ? "x" : ""}`)
    .join("|");
}

export default function RoomConversation({
  dark = false,
  channelId = null,
  canRead = true,
  canPost = true,
  canUpload = false,
  canDownload = true,
  canPinAny = false,
  api,
  meName = "",
  meIsHost = false,
}) {
  const C = dark
    ? { ink: "#f5f4f7", muted: "rgba(245,244,247,0.6)", faint: "rgba(245,244,247,0.4)", pink: "#ec178f", border: "rgba(255,255,255,0.12)", chip: "rgba(255,255,255,0.06)", field: "rgba(255,255,255,0.05)", hover: "rgba(255,255,255,0.04)", thread: "rgba(255,255,255,0.10)", danger: "#fb7185", panel: "#15101a" }
    : { ink: "#0a0a0a", muted: "rgba(10,10,10,0.6)", faint: "rgba(10,10,10,0.4)", pink: "#ec178f", border: "rgba(10,10,10,0.10)", chip: "rgba(10,10,10,0.04)", field: "#fff", hover: "rgba(236,23,143,0.04)", thread: "rgba(10,10,10,0.10)", danger: "#e11d48", panel: "#ffffff" };

  const [messages, setMessages] = useState(null);
  const [openThreads, setOpenThreads] = useState(() => new Set());
  const [replySeed, setReplySeed] = useState(null); // { rootId, name } — reply ON a reply
  const [gifEnabled, setGifEnabled] = useState(false);
  const atBottomRef = useRef(true);
  const serverSigRef = useRef(""); // last applied server fingerprint (poll skip)

  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const scrollToBottom = useCallback(() => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  }, []);
  useEffect(() => {
    const onWin = () => { atBottomRef.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 180; };
    window.addEventListener("scroll", onWin, { passive: true });
    return () => window.removeEventListener("scroll", onWin);
  }, []);

  const load = useCallback(async () => {
    const fresh = await api.loadMessages(channelId).catch(() => null);
    if (!Array.isArray(fresh)) { setMessages((m) => m || []); return; }
    const sig = feedSig(fresh);
    // Server unchanged since the last applied poll → leave the view untouched
    // (no re-render, no scroll). Optimistic locals already on screen stay put.
    if (sig === serverSigRef.current) return;
    serverSigRef.current = sig;
    // Preserve any local optimistic posts still in flight (or failed, awaiting
    // retry) so a poll mid-send never makes them flicker away.
    setMessages((prev) => {
      const locals = (prev || []).filter((m) => m._pending || m._failed);
      return locals.length ? [...fresh, ...locals] : fresh;
    });
  }, [api, channelId]);

  useEffect(() => {
    let alive = true;
    serverSigRef.current = ""; // new channel → forget the old fingerprint
    (async () => {
      const f = await api.loadMessages(channelId).catch(() => null);
      if (!alive) return;
      const fresh = Array.isArray(f) ? f : [];
      serverSigRef.current = feedSig(fresh);
      setMessages(fresh);
    })();
    const iv = setInterval(load, 5000);
    return () => { alive = false; clearInterval(iv); };
  }, [api, channelId, load]);

  // Probe the GIF picker once — only show it if a provider key is configured.
  useEffect(() => {
    if (!canUpload || !api.searchGifs) return;
    let alive = true;
    api.searchGifs("").then((d) => { if (alive) setGifEnabled(!d?.disabled); }).catch(() => {});
    return () => { alive = false; };
  }, [api, canUpload]);

  useEffect(() => { if (atBottomRef.current) scrollToBottom(); }, [messages, scrollToBottom]);

  function toggleThread(rootId) {
    setOpenThreads((s) => { const n = new Set(s); n.has(rootId) ? n.delete(rootId) : n.add(rootId); return n; });
  }
  function openThread(rootId) { setOpenThreads((s) => new Set(s).add(rootId)); }

  // Send like a chat: drop the post in INSTANTLY with its local previews
  // (status pending), then upload media + POST in the background and reconcile
  // with the server list. A failure leaves the post in place, marked so the
  // author can tap to retry — nothing is silently lost.
  const sendPost = useCallback(async ({ body, staged, pinned, parentId }) => {
    atBottomRef.current = true;
    const clientId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const localMedia = (staged || []).map((s) => ({ url: s.url, type: s.type, _local: !s.remote }));
    const optimistic = {
      id: clientId, clientId, body: body || "", media: localMedia,
      parentId: parentId || null, pinned: !!pinned,
      authorName: meName || "You", isHost: meIsHost,
      at: new Date().toISOString(), _pending: true,
      _payload: { body, staged, pinned, parentId },
    };
    setMessages((list) => [...(list || []), optimistic]);
    try {
      const media = [];
      for (const s of (staged || [])) {
        if (s.remote) media.push({ url: s.url, type: s.type });
        else media.push(await api.uploadMedia(s.file));
      }
      const fresh = await api.post({ body, parentId: parentId || null, media, pinned: !!pinned, channelId });
      if (!Array.isArray(fresh)) throw new Error("post_failed");
      (staged || []).forEach((s) => { if (!s.remote) URL.revokeObjectURL(s.url); });
      serverSigRef.current = feedSig(fresh); // next poll sees no change → no redundant re-render
      // Server list is the truth; keep any OTHER in-flight/failed locals.
      setMessages((prev) => {
        const keep = (prev || []).filter((m) => (m._pending || m._failed) && m.clientId !== clientId);
        return [...fresh, ...keep];
      });
    } catch {
      setMessages((list) => (list || []).map((x) => (x.id === clientId ? { ...x, _pending: false, _failed: true } : x)));
    }
  }, [api, channelId, meName, meIsHost]);

  const postTop = ({ body, staged, pinned }) => sendPost({ body, staged, pinned, parentId: null });
  const postReply = (rootId) => ({ body, staged }) => sendPost({ body, staged, parentId: rootId });
  const retrySend = (m) => {
    setMessages((list) => (list || []).filter((x) => x.id !== m.id));
    sendPost(m._payload);
  };

  async function togglePin(m) {
    const next = !m.pinned;
    setMessages((list) => (list || []).map((x) => (x.id === m.id ? { ...x, pinned: next } : x)));
    const fresh = await api.pin(m.id, next).catch(() => null);
    if (Array.isArray(fresh)) { serverSigRef.current = feedSig(fresh); setMessages(fresh); }
  }

  // Managing your OWN content. "Mine" for a host viewer = the host's own posts;
  // for a guest = their own non-host posts (the server is the real gate — this is
  // just which affordances to show). Edit is author-only; delete is author OR the
  // host (moderation). Never on a pending/failed/already-deleted post.
  const isMine = (m) => (meIsHost ? !!m.isHost : (!m.isHost && m.authorName === meName));
  const liveOwn = (m) => !m.deleted && !m._pending && !m._failed;
  const canEditMsg = (m) => liveOwn(m) && !!api.editMessage && isMine(m);
  const canDeleteMsg = (m) => liveOwn(m) && !!api.deleteMessage && (isMine(m) || meIsHost);

  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState("");
  function beginEdit(m) { setEditingId(m.id); setEditDraft(m.body || ""); }
  function cancelEdit() { setEditingId(null); setEditDraft(""); }
  async function saveEdit(m) {
    const text = editDraft.trim();
    if (!text && (m.media || []).length === 0) return; // can't blank a text-only post
    if (text === (m.body || "")) { cancelEdit(); return; }
    setEditingId(null); setEditDraft("");
    setMessages((list) => (list || []).map((x) => (x.id === m.id ? { ...x, body: text, editedAt: new Date().toISOString() } : x)));
    const fresh = await api.editMessage(m.id, text).catch(() => null);
    if (Array.isArray(fresh)) { serverSigRef.current = feedSig(fresh); setMessages(fresh); }
  }
  async function removeMessage(m) {
    if (typeof window !== "undefined" && !window.confirm("Delete this message? This can't be undone.")) return;
    if (editingId === m.id) cancelEdit();
    // Optimistically tombstone it: a leaf vanishes on reconcile, a post with
    // replies stays as a "deleted" placeholder so the thread doesn't jump.
    setMessages((list) => (list || []).map((x) => (x.id === m.id ? { ...x, deleted: true, pinned: false, body: "", media: [] } : x)));
    const fresh = await api.deleteMessage(m.id).catch(() => null);
    if (Array.isArray(fresh)) { serverSigRef.current = feedSig(fresh); setMessages(fresh); }
  }

  const Avatar = ({ name, host, size = 36 }) => {
    let h = 0;
    for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const t = host ? { bg: C.pink, fg: "#fff" } : AV_TINTS[h % AV_TINTS.length];
    const ini = String(name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.round(size * 0.38), fontWeight: 800, background: t.bg, color: t.fg, letterSpacing: "-0.02em" }}>{ini}</div>;
  };

  // Render a post's media: visual (image/gif/video) in a grid, audio/file stacked.
  const PostMedia = ({ media }) => {
    if (!media || !media.length) return null;
    const visual = media.filter((m) => m.type === "image" || m.type === "gif" || m.type === "video");
    const audio = media.filter((m) => m.type === "audio");
    const files = media.filter((m) => m.type === "file");
    const cols = visual.length === 1 ? 1 : 2;
    return (
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8, maxWidth: 440 }}>
        {visual.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 4, borderRadius: 12, overflow: "hidden" }}>
            {visual.slice(0, 4).map((mm, i) => {
              const noSave = !canDownload ? { onContextMenu: (e) => e.preventDefault(), draggable: false } : {};
              const imgStyle = { width: "100%", height: "100%", objectFit: "cover", display: "block", maxHeight: visual.length === 1 ? 360 : undefined };
              return (
                <div key={i} style={{ position: "relative", aspectRatio: visual.length === 1 ? "auto" : "1", background: C.chip, borderRadius: visual.length === 1 ? 12 : 0, overflow: "hidden" }}>
                  {mm.type === "video"
                    ? <video src={mm.url} controls playsInline controlsList={canDownload ? undefined : "nodownload"} disablePictureInPicture={!canDownload} {...noSave} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", maxHeight: 360 }} />
                    // Download ON → click opens the full-res file (saveable). OFF →
                    // a plain image, no open-link + save/drag suppressed (UI-level;
                    // the host said no downloads for this state).
                    : canDownload
                      ? <a href={mm.url} target="_blank" rel="noreferrer" style={{ display: "block", width: "100%", height: "100%" }}>
                          <img src={mm.url} alt="" style={imgStyle} />
                        </a>
                      : <img src={mm.url} alt="" {...noSave} style={imgStyle} />}
                </div>
              );
            })}
          </div>
        )}
        {audio.map((mm, i) => (
          <audio key={`a${i}`} src={mm.url} controls controlsList={canDownload ? undefined : "nodownload"} style={{ width: "100%", maxWidth: 360, height: 38 }} />
        ))}
        {files.map((mm, i) => (
          <a key={`f${i}`} href={mm.url} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 11, border: `1px solid ${C.border}`, background: C.field, color: C.ink, textDecoration: "none", fontSize: 13, fontWeight: 600, width: "fit-content", maxWidth: 320 }}>
            <FileIcon size={16} color={C.muted} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Attachment</span>
          </a>
        ))}
      </div>
    );
  };

  // ── Assemble feed ──────────────────────────────────────────────────────
  const server = messages || [];
  const byId = new Map(server.map((m) => [m.id, m]));
  const topLevel = server.filter((m) => !m.parentId || !byId.has(m.parentId)).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
  const repliesByRoot = new Map();
  for (const m of server) {
    if (m.parentId && byId.has(m.parentId)) {
      if (!repliesByRoot.has(m.parentId)) repliesByRoot.set(m.parentId, []);
      repliesByRoot.get(m.parentId).push(m);
    }
  }
  const pinned = server.filter((m) => m.pinned);
  const canPinThis = (m) => canPinAny || m.authorName === meName;

  const pinnedStrip = pinned.length > 0 && (
    <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
        <Pin size={11} /> Pinned to the top
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
        {pinned.map((m) => {
          const v = (m.media || []).find((x) => x.type === "image" || x.type === "gif" || x.type === "video");
          return (
            <div key={`pin${m.id}`} style={{ flexShrink: 0, width: v ? 140 : 200, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", background: C.field }}>
              {v
                ? (v.type === "video"
                    ? <video src={v.url} style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} muted />
                    : <img src={v.url} alt="" style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />)
                : <div style={{ padding: 12, fontSize: 13, color: C.ink, lineHeight: 1.45, maxHeight: 120, overflow: "hidden" }}>{m.body || "Attachment"}</div>}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", gap: 6 }}>
                <span style={{ fontSize: 11.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firstName(m.authorName)}</span>
                {canPinThis(m) && (
                  <button onClick={() => togglePin(m)} title="Unpin" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: C.faint, display: "inline-flex" }}><PinOff size={13} /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const Post = ({ m }) => {
    const replies = repliesByRoot.get(m.id) || [];
    const open = openThreads.has(m.id);
    return (
      <div className="rc-post" style={{ display: "flex", gap: 11, padding: "10px 8px", borderRadius: 14 }}>
        <Avatar name={m.authorName} host={m.isHost} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span style={{ fontSize: 13.5, fontWeight: 750, color: m.isHost ? C.pink : C.ink }}>{m.authorName}{m.isHost ? " · host" : ""}</span>
            {m.at && <span style={{ fontSize: 11, color: C.faint }}>{timeAgo(m.at)}</span>}
            {m.editedAt && !m.deleted && <span style={{ fontSize: 11, color: C.faint }}>· edited</span>}
            {m.pinned && <Pin size={11} color={C.pink} style={{ marginLeft: -1 }} />}
          </div>
          {editingId === m.id ? (
            <EditBox value={editDraft} onChange={setEditDraft} onSave={() => saveEdit(m)} onCancel={cancelEdit} C={C} fontSize={14.5} />
          ) : m.deleted ? (
            <div style={{ fontSize: 14, color: C.faint, fontStyle: "italic", marginTop: 2 }}>This message was deleted</div>
          ) : (
            <>
              {m.body && <div style={{ fontSize: 14.5, color: C.ink, lineHeight: 1.5, marginTop: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>}
              <PostMedia media={m.media} />
            </>
          )}
          {m._pending && <div style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>Sending…</div>}
          {m._failed && <button onClick={() => retrySend(m)} style={{ ...actionBtn(C), color: C.danger, marginTop: 4 }}>Couldn't send · tap to retry</button>}

          {editingId !== m.id && (
            <div className="rc-actions" style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
              {canPost && !m._pending && !m._failed && <button onClick={() => openThread(m.id)} style={actionBtn(C)}>Reply</button>}
              {replies.length > 0 && (
                <button onClick={() => toggleThread(m.id)} style={{ ...actionBtn(C), color: C.pink }}>
                  {open ? "Hide" : `${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
                </button>
              )}
              {!m.deleted && canPinThis(m) && (
                <button onClick={() => togglePin(m)} title={m.pinned ? "Unpin" : "Attach to top"} style={{ ...actionBtn(C), display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {m.pinned ? <><PinOff size={12} /> Unpin</> : <><Pin size={12} /> Pin</>}
                </button>
              )}
              {canEditMsg(m) && <button onClick={() => beginEdit(m)} style={actionBtn(C)}>Edit</button>}
              {canDeleteMsg(m) && <button onClick={() => removeMessage(m)} style={{ ...actionBtn(C), color: C.danger }}>Delete</button>}
            </div>
          )}

          {open && (
            <div style={{ marginTop: 10, paddingLeft: 12, borderLeft: `2px solid ${C.thread}`, display: "flex", flexDirection: "column", gap: 10 }}>
              {replies.map((r) => (
                <div key={r.id} style={{ display: "flex", gap: 9 }}>
                  <Avatar name={r.authorName} host={r.isHost} size={26} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: r.isHost ? C.pink : C.ink }}>{r.authorName}{r.isHost ? " · host" : ""}</span>
                      {r.at && <span style={{ fontSize: 10.5, color: C.faint }}>{timeAgo(r.at)}</span>}
                      {r.editedAt && !r.deleted && <span style={{ fontSize: 10.5, color: C.faint }}>· edited</span>}
                    </div>
                    {editingId === r.id ? (
                      <EditBox value={editDraft} onChange={setEditDraft} onSave={() => saveEdit(r)} onCancel={cancelEdit} C={C} fontSize={13.5} />
                    ) : r.deleted ? (
                      <div style={{ fontSize: 13, color: C.faint, fontStyle: "italic", marginTop: 1 }}>This message was deleted</div>
                    ) : (
                      <>
                        {r.body && <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.45, marginTop: 1, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{r.body}</div>}
                        <PostMedia media={r.media} />
                      </>
                    )}
                    {editingId !== r.id && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 3 }}>
                        {/* Reply ON a reply — content on content. Stays in the same
                            thread (one flowing feed), seeded with their @name. */}
                        {canPost && !r._pending && !r._failed && !r.deleted && (
                          <button onClick={() => { openThread(m.id); setReplySeed({ rootId: m.id, name: firstName(r.authorName) }); }} style={actionBtn(C)}>Reply</button>
                        )}
                        {canEditMsg(r) && <button onClick={() => beginEdit(r)} style={actionBtn(C)}>Edit</button>}
                        {canDeleteMsg(r) && <button onClick={() => removeMessage(r)} style={{ ...actionBtn(C), color: C.danger }}>Delete</button>}
                        {r._pending && <span style={{ fontSize: 10.5, color: C.faint }}>Sending…</span>}
                        {r._failed && <button onClick={() => retrySend(r)} style={{ ...actionBtn(C), color: C.danger }}>Couldn't send · retry</button>}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {canPost && (
                <Composer
                  key={`reply-${m.id}-${replySeed?.rootId === m.id ? replySeed.name : ""}`}
                  C={C} isMobile={isMobile} variant="reply" canUpload={canUpload} gifEnabled={gifEnabled}
                  searchGifs={api.searchGifs} onSubmit={postReply(m.id)}
                  seedMention={replySeed?.rootId === m.id ? replySeed.name : null}
                  placeholder={`Reply to ${firstName(m.authorName)}…`}
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const empty = messages !== null && topLevel.length === 0 && (
    <div style={{ textAlign: "center", padding: "34px 16px 26px", color: C.muted }}>
      <div style={{ fontSize: 16, fontWeight: 750, color: C.ink, marginBottom: 5 }}>You're in.</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, maxWidth: 320, margin: "0 auto" }}>
        Nothing here yet — that's fine. Drop the first thing whenever you feel like it. A photo from the night, a clip, a thought, anything.
      </div>
    </div>
  );

  // The host can close the conversation to a state ("See the room" off). Pulled-
  // up read is inviolable, so this only ever hits waitlist/lobby when the host
  // turns it off — show it plainly instead of an empty, broken-looking feed.
  if (!canRead) {
    return (
      <div style={{ textAlign: "center", padding: "30px 16px", color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>
        The conversation isn't open to your spot yet — pull up at the event to join in.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <style>{`.rc-post:hover{background:${C.hover};}`}</style>
      {pinnedStrip}
      {messages === null && <div style={{ fontSize: 13, color: C.faint, padding: "8px 6px" }}>Opening the room…</div>}
      {empty}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {topLevel.map((m) => <Post key={`m${m.id}`} m={m} />)}
      </div>
      {canPost ? (
        <Composer
          C={C} isMobile={isMobile} variant="main" allowPin canUpload={canUpload} gifEnabled={gifEnabled}
          searchGifs={api.searchGifs} onSubmit={postTop}
          placeholder="Drop anything — a photo, a clip, a thought…"
        />
      ) : (
        <div style={{ fontSize: 13, color: C.muted, padding: "11px 13px", borderRadius: 12, border: `1px dashed ${C.border}`, textAlign: "center", marginTop: 12 }}>
          You can see the room — posting isn't open to you yet.
        </div>
      )}
    </div>
  );
}

// ── The composer — text + any media (upload) + gif picker, optional pin. ──
function Composer({ C, isMobile, variant, allowPin = false, canUpload, gifEnabled, searchGifs, onSubmit, placeholder, seedMention = null }) {
  const main = variant === "main";
  // Seed from a reply target (@name) as the INITIAL value; the parent remounts
  // this composer via `key` when the target changes, so no setState-in-effect.
  const [draft, setDraft] = useState(seedMention ? `@${seedMention} ` : "");
  const [staged, setStaged] = useState([]);   // { file?, url, type, remote? }
  const [pinNext, setPinNext] = useState(false);
  const [gifOpen, setGifOpen] = useState(false);
  const [gifQ, setGifQ] = useState("");
  const [gifs, setGifs] = useState([]);
  const [gifLoading, setGifLoading] = useState(false);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  function onPick(e) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    setStaged((s) => [...s, ...picked.map((file) => ({ file, url: URL.createObjectURL(file), type: fileType(file) }))].slice(0, 10));
    if (fileRef.current) fileRef.current.value = "";
  }
  function dropStaged(idx) {
    setStaged((s) => { const n = s.slice(); const [g] = n.splice(idx, 1); if (g && !g.remote) URL.revokeObjectURL(g.url); return n; });
  }

  const runGifSearch = useCallback(async (q) => {
    setGifLoading(true);
    const d = await searchGifs(q).catch(() => ({ gifs: [] }));
    setGifs(d?.gifs || []);
    setGifLoading(false);
  }, [searchGifs]);
  function openGifPanel() { setGifOpen(true); runGifSearch(""); }
  function pickGif(g) { setStaged((s) => [...s, { url: g.url, type: "gif", remote: true }].slice(0, 10)); setGifOpen(false); setGifQ(""); }

  // When seeded (a reply ON a reply), focus the box on mount. Focus isn't
  // state, so this stays clear of cascading-render lint.
  useEffect(() => {
    if (seedMention) taRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    const text = draft.trim();
    if (!text && staged.length === 0) return;
    // Hand the staged items (with their local previews) straight to the parent
    // and clear instantly — the parent drops in an optimistic post and uploads
    // in the background, so sending feels immediate like a chat. We do NOT
    // revoke the object URLs here; the optimistic post owns them until it
    // reconciles with the server.
    onSubmit({ body: text, staged, pinned: pinNext });
    setDraft(""); setStaged([]); setPinNext(false);
    if (taRef.current) taRef.current.style.height = "auto";
  }
  function onKeyDown(e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }
  function onInput(e) { setDraft(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }

  const wrap = main
    ? { position: "sticky", bottom: 0, marginTop: 8, paddingTop: 12, paddingBottom: isMobile ? 10 : 4, background: C.panel, borderTop: `1px solid ${C.border}`, zIndex: 5 }
    : { marginTop: 2 };

  return (
    <div style={wrap}>
      {/* GIF picker */}
      {gifOpen && (
        <div style={{ marginBottom: 10, border: `1px solid ${C.border}`, borderRadius: 14, padding: 10, background: C.field }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Search size={15} color={C.faint} />
            <input
              autoFocus value={gifQ}
              onChange={(e) => setGifQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runGifSearch(gifQ); } }}
              placeholder="Search GIFs…"
              style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: C.ink, fontSize: 14, fontFamily: "inherit" }}
            />
            <button onClick={() => setGifOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 0, display: "inline-flex" }}><X size={16} /></button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, maxHeight: 240, overflowY: "auto" }}>
            {gifLoading && <div style={{ fontSize: 12.5, color: C.faint, gridColumn: "1 / -1", padding: 8 }}>Loading…</div>}
            {!gifLoading && gifs.length === 0 && <div style={{ fontSize: 12.5, color: C.faint, gridColumn: "1 / -1", padding: 8 }}>No GIFs found.</div>}
            {gifs.map((g) => (
              <button key={g.id} onClick={() => pickGif(g)} style={{ border: "none", padding: 0, borderRadius: 8, overflow: "hidden", cursor: "pointer", background: C.chip, aspectRatio: "1" }}>
                <img src={g.preview} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: C.faint, marginTop: 6, textAlign: "right" }}>via GIPHY</div>
        </div>
      )}

      {/* Staged media */}
      {staged.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {staged.map((f, i) => (
            <div key={i} style={{ position: "relative", width: 64, height: 64, borderRadius: 10, overflow: "hidden", background: C.chip, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {f.type === "video" ? <video src={f.url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                : f.type === "audio" ? <span style={{ fontSize: 10, fontWeight: 700, color: C.muted }}>AUDIO</span>
                : f.type === "file" ? <FileIcon size={22} color={C.muted} />
                : <img src={f.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              <button onClick={() => dropStaged(i)} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(0,0,0,0.6)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}><X size={11} /></button>
            </div>
          ))}
          {allowPin && (
            <button onClick={() => setPinNext((p) => !p)} title="Attach this to the top of the room" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "0 12px", height: 64, borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: "pointer", border: `1px solid ${pinNext ? C.pink : C.border}`, background: pinNext ? "rgba(236,23,143,0.08)" : "transparent", color: pinNext ? C.pink : C.muted }}>
              <Pin size={13} /> {pinNext ? "Pinned to top" : "Pin to top"}
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        {canUpload && (
          <>
            <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={onPick} />
            <button onClick={() => fileRef.current?.click()} title="Attach a file" style={iconBtn(C, main)}><Paperclip size={main ? 19 : 16} /></button>
            {gifEnabled && (
              <button onClick={openGifPanel} title="Add a GIF" style={{ ...iconBtn(C, main), width: "auto", padding: main ? "0 12px" : "0 10px", fontSize: main ? 13 : 12, fontWeight: 800 }}>GIF</button>
            )}
          </>
        )}
        <textarea
          ref={taRef} value={draft} onChange={onInput} onKeyDown={onKeyDown} rows={1}
          placeholder={placeholder}
          style={{ flex: 1, resize: "none", maxHeight: 140, padding: main ? "11px 14px" : "8px 11px", borderRadius: main ? 13 : 11, border: `1px solid ${C.border}`, background: C.field, color: C.ink, fontSize: isMobile ? 16 : (main ? 14.5 : 13.5), lineHeight: 1.4, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={submit} disabled={!draft.trim() && staged.length === 0} style={sendBtn(C, !!(draft.trim() || staged.length), !main)}>
          {main ? "Share" : "Send"}
        </button>
      </div>
    </div>
  );
}

// Inline editor for your own post — a small autogrowing box with Save/Cancel.
// Enter saves, Esc cancels, Shift+Enter makes a newline.
function EditBox({ value, onChange, onSave, onCancel, C, fontSize = 14 }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.focus(); el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; el.setSelectionRange(el.value.length, el.value.length); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ marginTop: 4 }}>
      <textarea
        ref={ref} value={value} rows={1}
        onChange={(e) => { onChange(e.target.value); const el = e.target; el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 140)}px`; }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSave(); } if (e.key === "Escape") { e.preventDefault(); onCancel(); } }}
        style={{ width: "100%", boxSizing: "border-box", resize: "none", maxHeight: 140, padding: "8px 11px", borderRadius: 11, border: `1px solid ${C.pink}`, background: C.field, color: C.ink, fontSize, lineHeight: 1.4, outline: "none", fontFamily: "inherit" }}
      />
      <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
        <button onClick={onSave} style={{ ...actionBtn(C), color: C.pink }}>Save</button>
        <button onClick={onCancel} style={actionBtn(C)}>Cancel</button>
      </div>
    </div>
  );
}

function actionBtn(C) {
  return { background: "none", border: "none", padding: 0, color: C.faint, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
}
function iconBtn(C, big) {
  const s = big ? 42 : 34;
  return { flexShrink: 0, width: s, height: s, borderRadius: big ? 12 : 10, border: `1px solid ${C.border}`, background: C.field, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };
}
function sendBtn(C, active, small = false) {
  return { padding: small ? "8px 14px" : "11px 18px", borderRadius: small ? 11 : 13, border: "none", background: active ? C.pink : C.chip, color: active ? "#fff" : C.faint, fontWeight: 700, fontSize: small ? 13 : 14, cursor: active ? "pointer" : "default", flexShrink: 0, height: "fit-content" };
}
