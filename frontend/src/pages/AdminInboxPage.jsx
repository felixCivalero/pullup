// AdminInboxPage — PullUp HQ, the admin world's home.
//
// Landing = the globe: the world PullUp-styled, every located event a dot.
// Messages = the same floating blob hosts have (AdminMessagesDock), speaking
// as PullUp into any host's dock. Around it: the Requests queue, the
// Overview (our own Stripe-webhook ledger), the flat filterable Map, and
// (super only) admin grants. The deep tools (CRM / Matches / Analytics)
// live in the gold shell tabs above.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, Check, X as XIcon, LogOut } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useRef } from "react";
import { authenticatedFetch } from "../lib/api.js";
import { useAuth } from "../contexts/AuthContext";
import { AdminGlobe } from "../components/AdminGlobe.jsx";
import { AdminMessagesDock } from "../components/AdminMessagesDock.jsx";

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
function cityOf(location) {
  const parts = String(location || "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Unknown";
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

// The flat detail map — Leaflet + CARTO light, city filter, list under it.
function EventsMap({ events }) {
  const el = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  useEffect(() => {
    if (!el.current || mapRef.current) return;
    const map = L.map(el.current, { scrollWheelZoom: true, worldCopyJump: true }).setView([30, 15], 2);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: "&copy; OpenStreetMap &copy; CARTO", subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    return () => { map.remove(); mapRef.current = null; layerRef.current = null; };
  }, []);
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const now = Date.now();
    const pts = [];
    for (const e of events) {
      if (e.lat == null || e.lng == null) continue;
      const upcoming = e.startsAt && new Date(e.startsAt).getTime() > now;
      const m = L.circleMarker([e.lat, e.lng], {
        radius: upcoming ? 8 : 5, color: upcoming ? C.pink : C.ink, weight: 2,
        fillColor: upcoming ? C.pink : C.ink, fillOpacity: upcoming ? 0.55 : 0.25,
      });
      m.bindTooltip(`${e.title}${e.host ? ` — ${e.host}` : ""}<br/>${cityOf(e.location)} · ${e.startsAt ? new Date(e.startsAt).toLocaleDateString() : ""}${e.coming ? ` · ${e.coming} coming` : ""}`);
      m.addTo(layer);
      pts.push([e.lat, e.lng]);
    }
    if (pts.length && mapRef.current) mapRef.current.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 11 });
  }, [events]);
  return <div ref={el} style={{ height: 440, borderRadius: 16, overflow: "hidden", border: `1px solid ${C.line}` }} />;
}

export function AdminInboxPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("globe");
  const [requests, setRequests] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [grantEmail, setGrantEmail] = useState("");
  const [overview, setOverview] = useState(null);
  const [mapEvents, setMapEvents] = useState([]);
  const [mapWhen, setMapWhen] = useState("upcoming");
  const [mapCity, setMapCity] = useState("all");

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
    if (tab === "overview" && !overview) {
      authenticatedFetch("/admin/overview").then((r) => (r.ok ? r.json() : null)).then((d) => d && setOverview(d)).catch(() => {});
    }
  }, [tab, overview]);

  const cities = useMemo(() => {
    const set = new Map();
    for (const e of mapEvents) set.set(cityOf(e.location), (set.get(cityOf(e.location)) || 0) + 1);
    return [...set.entries()].sort((a, b) => b[1] - a[1]);
  }, [mapEvents]);
  const filteredMapEvents = useMemo(() => {
    const now = Date.now();
    return mapEvents.filter((e) => {
      const upcoming = e.startsAt && new Date(e.startsAt).getTime() > now;
      if (mapWhen === "upcoming" && !upcoming) return false;
      if (mapWhen === "past" && upcoming) return false;
      if (mapCity !== "all" && cityOf(e.location) !== mapCity) return false;
      return true;
    });
  }, [mapEvents, mapWhen, mapCity]);

  const tabs = useMemo(() => {
    const t = [
      { key: "globe", label: "World" },
      { key: "overview", label: "Overview" },
      { key: "requests", label: "Requests" },
      { key: "map", label: "Map" },
    ];
    if (me?.role === "super") t.push({ key: "admins", label: "Admins" });
    return t;
  }, [me]);

  if (me && !me.isAdmin) {
    return <div style={{ padding: 60, textAlign: "center", color: C.muted, fontSize: 15 }}>Admin access required.</div>;
  }

  async function setRequestStatus(item, status) {
    await authenticatedFetch(`/admin/requests/${item.kind === "instagram" ? "instagram" : item.kind}/${item.host_id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    }).catch(() => {});
    loadRequests();
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
          <div style={{ fontSize: 12.5, color: C.muted }}>How PullUp is actually going — and the system's voice, in Messages below right.</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => { loadMapEvents(); if (tab === "requests") loadRequests(); if (tab === "overview") setOverview(null); }} title="Refresh" style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: C.muted }}>
            <RefreshCw size={15} />
          </button>
          <button onClick={() => signOut()} title="Sign out" style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: C.muted }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ fontSize: 13, fontWeight: 700, padding: "7px 14px", borderRadius: 999, cursor: "pointer", border: `1px solid ${tab === t.key ? "transparent" : C.line}`, background: tab === t.key ? C.ink : "#fff", color: tab === t.key ? "#fff" : C.muted }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "globe" && <AdminGlobe events={mapEvents} />}

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

      {tab === "map" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            {[["upcoming", "Upcoming"], ["past", "History"], ["all", "All"]].map(([k, label]) => (
              <button key={k} onClick={() => setMapWhen(k)} style={{ fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${mapWhen === k ? "transparent" : C.line}`, background: mapWhen === k ? C.pink : "#fff", color: mapWhen === k ? "#fff" : C.muted }}>
                {label}
              </button>
            ))}
            <div style={{ width: 1, height: 18, background: C.line, margin: "0 4px" }} />
            <select value={mapCity} onChange={(e) => setMapCity(e.target.value)} style={{ fontSize: 12.5, fontWeight: 600, padding: "6px 10px", borderRadius: 10, border: `1px solid ${C.line}`, background: "#fff", color: C.ink }}>
              <option value="all">Everywhere</option>
              {cities.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
            </select>
            <span style={{ marginLeft: "auto", fontSize: 12, color: C.muted }}>{filteredMapEvents.length} event{filteredMapEvents.length === 1 ? "" : "s"} on the map</span>
          </div>
          <EventsMap events={filteredMapEvents} />
          <div style={{ marginTop: 14, border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", overflow: "hidden" }}>
            {filteredMapEvents.slice(0, 30).map((e, i) => (
              <a key={e.id} href={e.slug ? `/e/${e.slug}` : undefined} target="_blank" rel="noreferrer"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: i < Math.min(filteredMapEvents.length, 30) - 1 ? `1px solid ${C.line}` : "none", textDecoration: "none", color: C.ink }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, flexShrink: 0, background: e.startsAt && new Date(e.startsAt).getTime() > Date.now() ? C.pink : "rgba(10,10,10,0.25)" }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                  <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[e.host, cityOf(e.location), e.startsAt ? new Date(e.startsAt).toLocaleDateString() : null].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: C.muted, flexShrink: 0 }}>{e.coming}{e.capacity ? `/${e.capacity}` : ""} coming</span>
              </a>
            ))}
            {filteredMapEvents.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 13 }}>Nothing here yet — expansion pending.</div>}
          </div>
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

      {/* The system's voice — same blob as the hosts', bottom right. */}
      <AdminMessagesDock />
    </div>
  );
}
