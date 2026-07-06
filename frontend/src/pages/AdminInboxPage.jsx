// AdminInboxPage — the operator seat of the system chat.
//
// Hosts talk to "PullUp" in their Messages; this is where the humans behind
// @pullup.se answer. Three panels: the System inbox (threads across all
// hosts), the early-access Requests queue, and (super only) Admins.
// Everything is internal rows — no email in the conversation.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send, Sparkles, RefreshCw, Check, X as XIcon } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";

const C = {
  ink: "#0a0a0a",
  muted: "rgba(10,10,10,0.55)",
  faint: "rgba(10,10,10,0.35)",
  line: "rgba(10,10,10,0.09)",
  raise: "#f5f5f7",
  pink: "#ec178f",
  youGrad: "linear-gradient(135deg, #ff45ad 0%, #ec178f 55%, #c2127a 100%)",
  them: "#f1f1f3",
  green: "#16a34a",
  amber: "#b45309",
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

function Eyes({ size = 34 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#fff", border: `2px solid ${C.pink}`, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <img src="/pullup-smalleyes.svg" alt="PullUp" style={{ width: "68%", display: "block" }} />
    </div>
  );
}

function HostAvatar({ name, src, size = 40 }) {
  if (src) return <img src={src} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: C.raise, color: C.muted, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: size * 0.34, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

export default function AdminInboxPage() {
  const [me, setMe] = useState(null); // { isAdmin, role }
  const [tab, setTab] = useState("inbox");
  const [threads, setThreads] = useState([]);
  const [openHost, setOpenHost] = useState(null); // hostId
  const [thread, setThread] = useState(null); // { host, thread }
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [requests, setRequests] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [grantEmail, setGrantEmail] = useState("");
  const scroller = useRef(null);

  useEffect(() => {
    authenticatedFetch("/admin/me").then((r) => r.json()).then(setMe).catch(() => setMe({ isAdmin: false }));
  }, []);

  const loadInbox = useCallback(() => {
    authenticatedFetch("/admin/system-inbox").then((r) => (r.ok ? r.json() : null)).then((d) => d && setThreads(d.threads || [])).catch(() => {});
  }, []);
  const loadThread = useCallback((hostId) => {
    authenticatedFetch(`/admin/system-inbox/${hostId}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setThread(d)).catch(() => {});
  }, []);
  const loadRequests = useCallback(() => {
    authenticatedFetch("/admin/requests").then((r) => (r.ok ? r.json() : null)).then((d) => d && setRequests(d.items || [])).catch(() => {});
  }, []);
  const loadAdmins = useCallback(() => {
    authenticatedFetch("/admin/admins").then((r) => (r.ok ? r.json() : null)).then((d) => d && setAdmins(d.admins || [])).catch(() => {});
  }, []);

  // Live-enough: poll the inbox + open thread. Internal traffic is light; a
  // 12s tick keeps the seat fresh without a dedicated realtime channel.
  useEffect(() => {
    loadInbox();
    const t = setInterval(loadInbox, 12000);
    return () => clearInterval(t);
  }, [loadInbox]);
  useEffect(() => {
    if (!openHost) return;
    loadThread(openHost);
    const t = setInterval(() => loadThread(openHost), 12000);
    return () => clearInterval(t);
  }, [openHost, loadThread]);
  useEffect(() => { if (tab === "requests") loadRequests(); }, [tab, loadRequests]);
  useEffect(() => { if (tab === "admins" && me?.role === "super") loadAdmins(); }, [tab, me, loadAdmins]);
  useEffect(() => { scroller.current?.scrollTo(0, 1e9); }, [thread]);

  async function send() {
    const text = draft.trim();
    if (!text || !openHost || sending) return;
    setSending(true);
    try {
      const r = await authenticatedFetch(`/admin/system-inbox/${openHost}/message`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      if (r.ok) {
        setDraft("");
        loadThread(openHost);
        loadInbox();
      }
    } finally {
      setSending(false);
    }
  }

  async function setRequestStatus(item, status) {
    await authenticatedFetch(`/admin/requests/${item.kind === "instagram" ? "instagram" : item.kind}/${item.host_id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).catch(() => {});
    loadRequests();
  }

  const tabs = useMemo(() => {
    const t = [
      { key: "inbox", label: "System inbox" },
      { key: "requests", label: "Requests" },
    ];
    if (me?.role === "super") t.push({ key: "admins", label: "Admins" });
    return t;
  }, [me]);

  if (me && !me.isAdmin) {
    return <div style={{ padding: 60, textAlign: "center", color: C.muted, fontSize: 15 }}>Admin access required.</div>;
  }

  const statusChip = (s) => (
    <span style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "3px 9px", borderRadius: 999, background: s === "onboarded" ? "rgba(22,163,74,0.1)" : s === "declined" ? "rgba(10,10,10,0.06)" : "rgba(180,83,9,0.1)", color: s === "onboarded" ? C.green : s === "declined" ? C.muted : C.amber }}>{s}</span>
  );

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "28px 20px 60px", color: C.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <Eyes size={38} />
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>PullUp HQ</h1>
          <div style={{ fontSize: 12.5, color: C.muted }}>The system speaks from here — every reply lands in the host's Messages instantly.</div>
        </div>
        <button onClick={() => { loadInbox(); if (openHost) loadThread(openHost); if (tab === "requests") loadRequests(); }} title="Refresh" style={{ marginLeft: "auto", border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: C.muted }}>
          <RefreshCw size={15} />
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 999, cursor: "pointer", border: `1px solid ${tab === t.key ? "transparent" : C.line}`, background: tab === t.key ? C.ink : "#fff", color: tab === t.key ? "#fff" : C.muted }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "inbox" && (
        <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16, minHeight: 560 }}>
          {/* Thread list */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, overflow: "hidden", background: "#fff" }}>
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.line}`, fontSize: 12, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Conversations · {threads.length}
            </div>
            <div style={{ overflowY: "auto", maxHeight: 620 }}>
              {threads.map((t) => (
                <button key={t.hostId} onClick={() => { setOpenHost(t.hostId); setThread(null); }}
                  style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", padding: "11px 14px", border: "none", borderBottom: `1px solid ${C.line}`, background: openHost === t.hostId ? C.raise : "#fff", cursor: "pointer", textAlign: "left" }}>
                  <HostAvatar name={t.name} src={t.avatarUrl} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                      {t.needsReply && <span style={{ width: 7, height: 7, borderRadius: 999, background: C.pink, flexShrink: 0 }} />}
                    </div>
                    <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {t.lastFrom === "pullup" ? "PullUp: " : ""}{t.lastBody} · {relTime(t.lastAt)}
                    </div>
                  </div>
                </button>
              ))}
              {threads.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 13 }}>No system conversations yet.</div>}
            </div>
          </div>

          {/* Chat pane — we ARE PullUp here: our bubbles right/pink. */}
          <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", display: "flex", flexDirection: "column", minHeight: 560 }}>
            {!openHost && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: C.faint, fontSize: 14 }}>Pick a conversation.</div>}
            {openHost && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.line}` }}>
                  <HostAvatar name={thread?.host?.name} src={thread?.host?.avatarUrl} size={32} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{thread?.host?.name || "…"}</div>
                    {thread?.host?.email && <div style={{ fontSize: 11.5, color: C.muted }}>{thread.host.email}</div>}
                  </div>
                </div>
                <div ref={scroller} style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {(thread?.thread || []).map((m) => {
                    if (m.from === "system") {
                      return (
                        <div key={m.id} style={{ display: "flex", justifyContent: "center" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: C.muted, background: C.raise, borderRadius: 999, padding: "4px 11px", maxWidth: "88%" }}>
                            <Sparkles size={12} color="#7c3aed" />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.text}</span>
                            <span style={{ color: C.faint }}>· {relTime(m.at)}</span>
                          </span>
                        </div>
                      );
                    }
                    const mine = m.from === "you";
                    return (
                      <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                        <div style={{ maxWidth: "70%" }}>
                          <div style={{ padding: "9px 13px", borderRadius: mine ? "18px 18px 5px 18px" : "18px 18px 18px 5px", background: mine ? C.youGrad : C.them, color: mine ? "#fff" : C.ink, fontSize: 13.5, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{m.text}</div>
                          <div style={{ fontSize: 10, color: C.faint, marginTop: 3, textAlign: mine ? "right" : "left" }}>
                            {mine ? `PullUp${m.admin ? ` · ${m.admin}` : ""} · ` : ""}{relTime(m.at)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 8, padding: 12, borderTop: `1px solid ${C.line}` }}>
                  <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
                    placeholder="Reply as PullUp…" style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 999, padding: "11px 16px", fontSize: 13.5, outline: "none" }} />
                  <button onClick={send} disabled={sending || !draft.trim()} style={{ border: "none", background: C.youGrad, color: "#fff", borderRadius: 999, width: 42, height: 42, cursor: "pointer", opacity: sending || !draft.trim() ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Send size={16} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "requests" && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", overflow: "hidden" }}>
          {requests.map((r, i) => (
            <div key={`${r.kind}:${r.host_id}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: i < requests.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <HostAvatar name={r.host?.name || r.name} src={r.host?.avatarUrl} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{r.host?.name || r.name || r.email || r.host_id}</div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  {r.kind === "instagram" ? `Instagram · ${r.label}` : `Tier · ${r.label}`}{r.note ? ` — ${r.note}` : ""} · {relTime(r.updated_at || r.created_at)}
                </div>
              </div>
              {statusChip(r.status)}
              {r.status === "pending" && (
                <>
                  <button onClick={() => setRequestStatus(r, "onboarded")} title="Mark onboarded" style={{ border: `1px solid rgba(22,163,74,0.35)`, background: "rgba(22,163,74,0.06)", color: C.green, borderRadius: 9, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
                    <Check size={13} /> Onboarded
                  </button>
                  <button onClick={() => setRequestStatus(r, "declined")} title="Decline" style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.muted, borderRadius: 9, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
                    <XIcon size={13} /> Decline
                  </button>
                </>
              )}
            </div>
          ))}
          {requests.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 13 }}>No requests yet.</div>}
        </div>
      )}

      {tab === "admins" && me?.role === "super" && (
        <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", overflow: "hidden" }}>
          <div style={{ display: "flex", gap: 8, padding: 14, borderBottom: `1px solid ${C.line}` }}>
            <input value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="name@pullup.se"
              style={{ flex: 1, border: `1px solid ${C.line}`, borderRadius: 10, padding: "9px 13px", fontSize: 13.5, outline: "none" }} />
            <button onClick={async () => {
              const email = grantEmail.trim().toLowerCase();
              if (!email.endsWith("@pullup.se")) return;
              await authenticatedFetch("/admin/admins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }).catch(() => {});
              setGrantEmail(""); loadAdmins();
            }} style={{ border: "none", background: C.ink, color: "#fff", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Grant access
            </button>
          </div>
          {admins.map((a, i) => (
            <div key={a.email} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: i < admins.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <Eyes size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{a.email}</div>
                <div style={{ fontSize: 11.5, color: C.muted }}>{a.role}{a.user_id ? " · signed in" : " · never signed in"}</div>
              </div>
              {a.email !== me?.email && (
                <button onClick={async () => { await authenticatedFetch(`/admin/admins/${encodeURIComponent(a.email)}`, { method: "DELETE" }).catch(() => {}); loadAdmins(); }}
                  style={{ border: `1px solid ${C.line}`, background: "#fff", color: C.muted, borderRadius: 9, padding: "6px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700 }}>
                  Revoke
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
