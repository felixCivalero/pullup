// AdminMessagesDock — the hosts' Messages blob, worn by the system.
//
// Same shape as the host dock (floating pill bottom-right → popup panel with
// an inbox list and a chat thread), but the content is the SYSTEM inbox:
// every PullUp conversation across all hosts. We are PullUp here — our
// bubbles sit right in pink; the host's words sit left in gray. Rows +
// Realtime-ish polling; no email anywhere.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, ChevronLeft, X, Search, Sparkles } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";

const D = {
  bg: "#ffffff",
  ink: "#0a0a0a",
  muted: "rgba(10,10,10,0.55)",
  faint: "rgba(10,10,10,0.35)",
  line: "rgba(10,10,10,0.09)",
  raise: "#f5f5f7",
  hover: "#f6f6f8",
  pink: "#ec178f",
  youGrad: "linear-gradient(135deg, #ff45ad 0%, #ec178f 55%, #c2127a 100%)",
  them: "#f1f1f3",
};

function relTime(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
function initials(n = "") {
  return String(n).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";
}

function HostAvatar({ name, src, size = 44 }) {
  const [broken, setBroken] = useState(false);
  if (src && !broken) return <img src={src} alt="" onError={() => setBroken(true)} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed 0%, #7c3aed99 100%)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.36, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

function Eyes({ size = 26 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#fff", border: `2px solid ${D.pink}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <img src="/pullup-smalleyes.svg" alt="PullUp" style={{ width: "68%", display: "block" }} />
    </div>
  );
}

export function AdminMessagesDock() {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [openHost, setOpenHost] = useState(null);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [q, setQ] = useState("");
  const scroller = useRef(null);

  const loadInbox = useCallback(() => {
    authenticatedFetch("/admin/system-inbox").then((r) => (r.ok ? r.json() : null)).then((d) => d && setThreads(d.threads || [])).catch(() => {});
  }, []);
  const loadThread = useCallback((hostId) => {
    authenticatedFetch(`/admin/system-inbox/${hostId}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setThread(d)).catch(() => {});
  }, []);

  // Badge stays honest even while closed; open panels poll faster.
  useEffect(() => {
    loadInbox();
    const t = setInterval(loadInbox, open ? 10000 : 30000);
    return () => clearInterval(t);
  }, [loadInbox, open]);
  useEffect(() => {
    if (!openHost || !open) return;
    loadThread(openHost);
    const t = setInterval(() => loadThread(openHost), 10000);
    return () => clearInterval(t);
  }, [openHost, open, loadThread]);
  useEffect(() => { scroller.current?.scrollTo(0, 1e9); }, [thread]);

  const unread = threads.filter((t) => t.needsReply).length;
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((t) => `${t.name} ${t.email || ""} ${t.lastBody}`.toLowerCase().includes(needle));
  }, [threads, q]);

  async function send() {
    const text = draft.trim();
    if (!text || !openHost || sending) return;
    setSending(true);
    try {
      const r = await authenticatedFetch(`/admin/system-inbox/${openHost}/message`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      if (r.ok) { setDraft(""); loadThread(openHost); loadInbox(); }
    } finally {
      setSending(false);
    }
  }

  const panel = open && (
    <div style={{ position: "fixed", bottom: 92, right: 24, zIndex: 60, width: 390, maxWidth: "calc(100vw - 32px)", height: 580, maxHeight: "calc(100vh - 130px)", background: D.bg, borderRadius: 24, boxShadow: "0 24px 80px rgba(10,10,10,0.22)", border: `1px solid ${D.line}`, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: D.ink }}>
      {!openHost && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 16px 10px" }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>Messages</div>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: D.pink, background: "rgba(236,23,143,0.08)", borderRadius: 999, padding: "3px 9px" }}>as PullUp</span>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: D.muted }}><X size={18} /></button>
          </div>
          <div style={{ padding: "0 14px 10px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: D.raise, borderRadius: 999, padding: "8px 14px" }}>
              <Search size={14} color={D.faint} />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" style={{ flex: 1, border: "none", outline: "none", background: "none", fontSize: 13.5, color: D.ink }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "0 6px 8px" }}>
            {list.map((t) => (
              <button key={t.hostId} onClick={() => { setOpenHost(t.hostId); setThread(null); }}
                onMouseEnter={(e) => (e.currentTarget.style.background = D.hover)} onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                style={{ display: "flex", gap: 12, alignItems: "center", width: "100%", padding: "9px 10px", border: "none", borderRadius: 12, background: "none", cursor: "pointer", textAlign: "left" }}>
                <HostAvatar name={t.name} src={t.avatarUrl} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: D.ink }}>{t.name}</span>
                    {t.needsReply && <span style={{ width: 7, height: 7, borderRadius: 999, background: D.pink, flexShrink: 0 }} />}
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", fontSize: 12.5, color: D.muted, minWidth: 0 }}>
                    <span style={{ flex: "0 1 auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.lastFrom === "pullup" ? "You: " : ""}{t.lastBody}</span>
                    <span style={{ flexShrink: 0, color: t.needsReply ? D.pink : D.faint, fontWeight: t.needsReply ? 600 : 400 }}> · {relTime(t.lastAt)}</span>
                  </div>
                </div>
              </button>
            ))}
            {list.length === 0 && <div style={{ padding: 40, textAlign: "center", color: D.faint, fontSize: 13 }}>{threads.length ? "No matches." : "No conversations yet — they appear when hosts write to PullUp."}</div>}
          </div>
        </>
      )}

      {openHost && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 12px", borderBottom: `1px solid ${D.line}` }}>
            <button onClick={() => setOpenHost(null)} aria-label="Back" style={{ border: "none", background: "none", cursor: "pointer", color: D.ink, padding: 4 }}><ChevronLeft size={20} /></button>
            <HostAvatar name={thread?.host?.name} src={thread?.host?.avatarUrl} size={34} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{thread?.host?.name || "…"}</div>
              {thread?.host?.email && <div style={{ fontSize: 11.5, color: D.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{thread.host.email}</div>}
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: D.muted }}><X size={18} /></button>
          </div>
          <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: "14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
            {(thread?.thread || []).map((m) => {
              if (m.from === "system") {
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: "center", margin: "1px 0" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: D.muted, background: D.raise, borderRadius: 999, padding: "4px 11px", maxWidth: "88%", lineHeight: 1.35 }}>
                      <Sparkles size={12} color="#7c3aed" style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</span>
                      <span style={{ color: D.faint, flexShrink: 0 }}>· {relTime(m.at)}</span>
                    </span>
                  </div>
                );
              }
              const mine = m.from === "you";
              return (
                <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", alignItems: "flex-end", gap: 7 }}>
                  {!mine && <HostAvatar name={thread?.host?.name} src={thread?.host?.avatarUrl} size={22} />}
                  <div style={{ maxWidth: "74%" }}>
                    <div style={{ padding: "9px 13px", borderRadius: mine ? "18px 18px 5px 18px" : "18px 18px 18px 5px", background: mine ? D.youGrad : D.them, color: mine ? "#fff" : D.ink, fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap", boxShadow: mine ? "0 4px 14px rgba(236,23,143,0.24)" : "none" }}>{m.text}</div>
                    <div style={{ fontSize: 10, color: D.faint, marginTop: 3, display: "flex", gap: 4, alignItems: "center", justifyContent: mine ? "flex-end" : "flex-start" }}>
                      {mine && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, color: D.pink, fontWeight: 700 }}>
                          <img src="/pullup-smalleyes.svg" alt="" style={{ width: 12, display: "block" }} /> PullUp{m.admin ? ` · ${m.admin.split("@")[0]}` : ""}
                        </span>
                      )}
                      <span>{relTime(m.at)}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${D.line}` }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
              placeholder="Reply as PullUp…" style={{ flex: 1, border: `1px solid ${D.line}`, borderRadius: 999, padding: "11px 16px", fontSize: 13.5, outline: "none", background: D.raise }} />
            <button onClick={send} disabled={sending || !draft.trim()} aria-label="Send" style={{ border: "none", background: D.youGrad, color: "#fff", borderRadius: 999, width: 42, height: 42, cursor: "pointer", opacity: sending || !draft.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Send size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {panel}
      {/* The blob — same silhouette as the host Messages pill. */}
      <button onClick={() => setOpen((o) => !o)}
        style={{ position: "fixed", bottom: 24, right: 24, zIndex: 59, display: "flex", alignItems: "center", gap: 9, padding: "10px 16px 10px 14px", borderRadius: 999, border: `1px solid ${D.line}`, background: "#fff", boxShadow: "0 10px 34px rgba(10,10,10,0.16)", cursor: "pointer", fontFamily: "inherit" }}>
        <Send size={16} color={D.pink} style={{ transform: "rotate(-12deg)" }} />
        <span style={{ fontSize: 14.5, fontWeight: 800, letterSpacing: "-0.01em", color: D.ink }}>Messages</span>
        <Eyes size={26} />
        {unread > 0 && (
          <span style={{ minWidth: 20, height: 20, borderRadius: 999, background: D.pink, color: "#fff", fontSize: 11.5, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 6px" }}>{unread}</span>
        )}
      </button>
    </>
  );
}
