// AdminInboxPage — PullUp HQ, the admin world's home.
//
// Landing = the globe: the world PullUp-styled, every located event a dot.
// Messages = the same floating blob hosts have (AdminMessagesDock), speaking
// as PullUp into any host's dock. Around it: the Requests queue, the
// Overview (our own Stripe-webhook ledger), the flat filterable Map, and
// (super only) admin grants. The deep tools (CRM / Matches / Analytics)
// live in the gold shell tabs above.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw, Check, X as XIcon } from "lucide-react";
import { authenticatedFetch } from "../lib/api.js";
import { AdminGlobe } from "../components/AdminGlobe.jsx";

const C = {
  ink: "#0a0a0a",
  muted: "rgba(10,10,10,0.55)",
  faint: "rgba(10,10,10,0.35)",
  line: "rgba(10,10,10,0.09)",
  raise: "#f5f5f7",
  pink: "#ec178f",
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

function StatCard({ label, value, sub }) {
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", padding: "16px 18px" }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function AdminInboxPage() {
  // The AdminShell sidebar drives the section via ?tab= — this page is the
  // content pane of the dashboard, no chrome of its own.
  const [params] = useSearchParams();
  const tab = params.get("tab") || "globe";
  const [me, setMe] = useState(null);
  const [requests, setRequests] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [grantEmail, setGrantEmail] = useState("");
  const [overview, setOverview] = useState(null);
  const [mapEvents, setMapEvents] = useState([]);

  useEffect(() => {
    authenticatedFetch("/admin/me").then((r) => r.json()).then(setMe).catch(() => setMe({ isAdmin: false }));
  }, []);

  const loadRequests = useCallback(() => {
    authenticatedFetch("/admin/requests").then((r) => (r.ok ? r.json() : null)).then((d) => d && setRequests(d.items || [])).catch(() => {});
  }, []);
  const loadAdmins = useCallback(() => {
    authenticatedFetch("/admin/admins").then((r) => (r.ok ? r.json() : null)).then((d) => d && setAdmins(d.admins || [])).catch(() => {});
  }, []);
  const loadMapEvents = useCallback(() => {
    authenticatedFetch("/admin/events-map").then((r) => (r.ok ? r.json() : null)).then((d) => d && setMapEvents(d.events || [])).catch(() => {});
  }, []);

  // The globe is the landing — its pins load immediately.
  useEffect(() => { loadMapEvents(); }, [loadMapEvents]);
  useEffect(() => { if (tab === "requests") loadRequests(); }, [tab, loadRequests]);
  useEffect(() => { if (tab === "admins" && me?.role === "super") loadAdmins(); }, [tab, me, loadAdmins]);
  useEffect(() => {
    if ((tab === "overview" || tab === "globe") && !overview) {
      authenticatedFetch("/admin/overview").then((r) => (r.ok ? r.json() : null)).then((d) => d && setOverview(d)).catch(() => {});
    }
  }, [tab, overview]);

  const TITLES = { globe: "The world", overview: "Overview", requests: "Requests", admins: "Admins" };

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 24px 60px", color: C.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}>{TITLES[tab] || "PullUp HQ"}</h1>
        <button onClick={() => { loadMapEvents(); if (tab === "requests") loadRequests(); if (tab === "overview") setOverview(null); }} title="Refresh" style={{ marginLeft: "auto", border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: C.muted }}>
          <RefreshCw size={15} />
        </button>
      </div>

      {tab === "globe" && (
        <div>
          {/* The numbers, riding above the world — compact twins of Overview. */}
          {overview && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: 10, marginBottom: 14 }}>
              {[
                [`${overview.subscriptions.mrrSek.toLocaleString()} kr`, "MRR"],
                [overview.subscriptions.active, "subscribers"],
                [overview.subscriptions.founding, "founding hosts"],
                [`${overview.ticketSales.last30Sek.toLocaleString()} kr`, "sales · 30d"],
                [overview.events.upcoming, "upcoming events"],
                [overview.hosts.total ?? "—", "hosts"],
              ].map(([v, l]) => (
                <div key={l} style={{ border: `1px solid ${C.line}`, borderRadius: 14, background: "#fff", padding: "11px 14px" }}>
                  <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.02em" }}>{v}</div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</div>
                </div>
              ))}
            </div>
          )}
          <AdminGlobe events={mapEvents} />
        </div>
      )}

      {tab === "overview" && (
        <div>
          {!overview && <div style={{ padding: 40, textAlign: "center", color: C.faint }}>Loading…</div>}
          {overview && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 12 }}>
                <StatCard label="MRR" value={`${overview.subscriptions.mrrSek.toLocaleString()} kr`} sub={`${overview.subscriptions.active} active subscription${overview.subscriptions.active === 1 ? "" : "s"}`} />
                <StatCard label="Subscribers" value={overview.subscriptions.active} sub={Object.entries(overview.subscriptions.byPlan).map(([p, n]) => `${n} ${p}`).join(" · ") || "—"} />
                <StatCard label="Founding hosts" value={overview.subscriptions.founding} sub="early tier, free forever" />
                <StatCard label="Past due" value={overview.subscriptions.pastDue} sub={overview.subscriptions.cancelling ? `${overview.subscriptions.cancelling} cancelling at period end` : "grace-period watch"} />
                <StatCard label="Ticket sales · 30d" value={`${overview.ticketSales.last30Sek.toLocaleString()} kr`} sub={`${overview.ticketSales.last30Count} payments`} />
                <StatCard label="Ticket sales · all time" value={`${overview.ticketSales.allTimeSek.toLocaleString()} kr`} sub={`${overview.ticketSales.count} payments · ~${overview.ticketSales.estFeesSek.toLocaleString()} kr fees (3%)`} />
                <StatCard label="Connected accounts" value={overview.connectedAccounts.count} sub={overview.connectedAccounts.hosts.slice(0, 3).map((h) => h.name).join(", ") || "Stripe Connect"} />
                <StatCard label="Events" value={overview.events.total} sub={`${overview.events.upcoming} upcoming · ${overview.events.drafts} drafts`} />
                <StatCard label="Hosts" value={overview.hosts.total ?? "—"} sub="accounts on the platform" />
              </div>
              <div style={{ fontSize: 11.5, color: C.faint, marginTop: 12 }}>
                Subscriptions and payments mirror Stripe via webhooks — this is our own ledger, no API round-trip.
              </div>
            </>
          )}
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
                  <button onClick={() => setRequestStatus(r, "onboarded")} title="Mark onboarded" style={{ border: "1px solid rgba(22,163,74,0.35)", background: "rgba(22,163,74,0.06)", color: C.green, borderRadius: 9, padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700 }}>
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
