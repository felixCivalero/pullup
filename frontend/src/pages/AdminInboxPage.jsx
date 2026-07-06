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
import { LandingOverview } from "./analytics/LandingOverview.jsx";
import { DateRangePicker } from "../components/DateRangePicker.jsx";

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
  const [ovNonce, setOvNonce] = useState(0); // bump to refetch (retry on failure, refresh button)
  const [mapEvents, setMapEvents] = useState([]);
  const [pulse, setPulse] = useState(null);
  const [journeys, setJourneys] = useState(null);
  // Sales window — resting state is always "since launch".
  const LAUNCH = "2026-07-06";
  const _n = new Date();
  const today = `${_n.getFullYear()}-${String(_n.getMonth() + 1).padStart(2, "0")}-${String(_n.getDate()).padStart(2, "0")}`;
  const [salesFrom, setSalesFrom] = useState(LAUNCH);
  const [salesTo, setSalesTo] = useState(today);

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
  useEffect(() => {
    if (tab === "pulse" && !pulse) {
      authenticatedFetch("/admin/pulse").then((r) => (r.ok ? r.json() : null)).then((d) => d && setPulse(d)).catch(() => {});
    }
    if (tab === "journeys" && !journeys) {
      authenticatedFetch("/admin/journeys").then((r) => (r.ok ? r.json() : null)).then((d) => d && setJourneys(d)).catch(() => {});
    }
  }, [tab, pulse, journeys]);
  useEffect(() => { if (tab === "admins" && me?.role === "super") loadAdmins(); }, [tab, me, loadAdmins]);
  useEffect(() => {
    if (tab !== "globe") return;
    let on = true;
    // One failed/slow fetch must never leave the strip blank forever — retry
    // in 5s until it lands (the Stripe round-trip can take a couple seconds).
    const retry = () => { if (on) setTimeout(() => on && setOvNonce((n) => n + 1), 5000); };
    authenticatedFetch(`/admin/overview?from=${salesFrom}&to=${salesTo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!on) return; if (d) setOverview(d); else retry(); })
      .catch(retry);
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, salesFrom, salesTo, ovNonce]);

  const TITLES = { globe: "The world", pulse: "The pulse", analytics: "The front door", journeys: "Journeys", requests: "Requests", admins: "Admins" };

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
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 24px 60px", color: C.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}>{TITLES[tab] || "PullUp HQ"}</h1>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {(tab === "globe" || tab === "analytics") && (
            <DateRangePicker
              startDate={new Date(`${salesFrom}T00:00:00`)}
              endDate={new Date(`${salesTo}T00:00:00`)}
              onChange={(sd, ed) => {
                const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                if (sd) setSalesFrom(day(sd));
                if (ed) setSalesTo(day(ed));
              }}
              onClear={() => { setSalesFrom(LAUNCH); setSalesTo(today); }}
              allowPast
              blockFuture
              quickRanges={[
                { label: "Since launch", getRange: () => [new Date(`${LAUNCH}T00:00:00`), new Date()] },
                { label: "Last 7 days", getRange: () => [new Date(Date.now() - 6 * 86400_000), new Date()] },
                { label: "Last 30 days", getRange: () => [new Date(Date.now() - 29 * 86400_000), new Date()] },
              ]}
            />
          )}
          <button onClick={() => { loadMapEvents(); if (tab === "requests") loadRequests(); if (tab === "globe") { setSalesTo(today); setOvNonce((n) => n + 1); } if (tab === "pulse") setPulse(null); if (tab === "journeys") setJourneys(null); }} title="Refresh" style={{ border: `1px solid ${C.line}`, background: "#fff", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: C.muted }}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>

      {tab === "globe" && (
        <div>
          {/* The numbers, riding above the world — compact twins of Overview. */}
          {overview && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 14 }}>
              {[
                [`${overview.subscriptions.mrrSek.toLocaleString()} kr`, "MRR"],
                [overview.subscriptions.active, "paying subscribers"],
                [overview.connectedAccounts.count, "connected accounts"],
                [overview.ticketSales.sek == null ? "—" : `${overview.ticketSales.sek.toLocaleString()} kr`,
                  `ticket sales · ${salesFrom === LAUNCH && salesTo === today ? "since launch" : `${salesFrom.slice(5)} → ${salesTo.slice(5)}`}`],
                [overview.ticketSales.count == null ? "—" : overview.ticketSales.count, "ticket payments · from Stripe"],
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

      {tab === "analytics" && (
        <div>
          <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>
            How the new landing page performs — where people come from, how far they scroll, what they click, who becomes a host.
          </div>
          <LandingOverview dateRange={{ startDate: new Date(`${salesFrom}T00:00:00`), endDate: new Date(`${salesTo}T23:59:59`) }} />
        </div>
      )}

      {tab === "pulse" && (
        <div>
          {!pulse && <div style={{ padding: 40, textAlign: "center", color: C.faint }}>Loading…</div>}
          {pulse && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 2 }}>
                Eight weeks of the platform's rhythm — is PullUp more alive than last week?
              </div>
              {[
                ["pullups", "Pull-ups", "real people who showed up", C.pink],
                ["rsvps", "RSVPs", "commitments made", "#7c3aed"],
                ["published", "Events published", "new rooms opened", "#0d9488"],
                ["activeHosts", "Hosts active", "did anything meaningful", "#b45309"],
                ["messages", "Messages sent", "hosts talking to their people", "#1478c8"],
              ].map(([key, label, sub, color]) => {
                const vals = pulse.weeks.map((w) => w[key]);
                const max = Math.max(1, ...vals);
                const thisWeek = vals[vals.length - 1];
                const lastWeek = vals[vals.length - 2] ?? 0;
                const delta = thisWeek - lastWeek;
                return (
                  <div key={key} style={{ display: "flex", alignItems: "center", gap: 18, border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", padding: "14px 18px" }}>
                    <div style={{ width: 190, flexShrink: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 800 }}>{label}</div>
                      <div style={{ fontSize: 11, color: C.faint }}>{sub}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 52, flex: 1 }}>
                      {vals.map((v, i) => (
                        <div key={i} title={`${pulse.weeks[i].week}: ${v}`} style={{ flex: 1, maxWidth: 46, borderRadius: "6px 6px 2px 2px", background: i === vals.length - 1 ? color : `${color}55`, height: `${Math.max(6, (v / max) * 100)}%`, transition: "height 0.3s ease" }} />
                      ))}
                    </div>
                    <div style={{ width: 110, flexShrink: 0, textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em" }}>{thisWeek}</div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: delta > 0 ? C.green : delta < 0 ? "#dc2626" : C.faint }}>
                        {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "— flat"} vs last week
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "journeys" && (
        <div>
          {!journeys && <div style={{ padding: 40, textAlign: "center", color: C.faint }}>Loading…</div>}
          {journeys && (
            <div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 12 }}>
                Every host on the activation ladder, stalled-first — each row is a nudge waiting to happen. The Message button speaks as PullUp.
              </div>
              <div style={{ border: `1px solid ${C.line}`, borderRadius: 16, background: "#fff", overflow: "hidden" }}>
                {journeys.hosts.map((h, i) => {
                  const STAGE_COLORS = { "signed up": C.faint, "drafting": "#b45309", "published, no guests": "#dc2626", "got RSVPs": "#7c3aed", "first pull-ups": C.pink, "repeat host": "#0d9488", "paying": C.green };
                  const col = STAGE_COLORS[h.stage] || C.muted;
                  return (
                    <div key={h.hostId} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", borderBottom: i < journeys.hosts.length - 1 ? `1px solid ${C.line}` : "none" }}>
                      <HostAvatar name={h.name} size={34} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.name}</span>
                          {h.founding && <span style={{ fontSize: 9.5, fontWeight: 800, color: "#b45309", background: "rgba(180,83,9,0.1)", borderRadius: 999, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>founding</span>}
                        </div>
                        <div style={{ fontSize: 12, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.detail}</div>
                      </div>
                      <span style={{ fontSize: 10.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: col, background: `${col}14`, borderRadius: 999, padding: "4px 10px", flexShrink: 0 }}>{h.stage}</span>
                      <span style={{ fontSize: 11.5, color: C.faint, width: 150, textAlign: "right", flexShrink: 0 }}>{h.published} ev · {h.rsvps} rsvp · {h.pullups} pu</span>
                      <button onClick={() => window.dispatchEvent(new CustomEvent("pullup:admin-open-thread", { detail: { hostId: h.hostId } }))}
                        style={{ border: "none", background: C.pink, color: "#fff", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                        Message
                      </button>
                    </div>
                  );
                })}
                {journeys.hosts.length === 0 && <div style={{ padding: 30, textAlign: "center", color: C.faint, fontSize: 13 }}>No hosts yet.</div>}
              </div>
            </div>
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
                  {r.kind === "instagram" ? `Instagram · ${r.label}` : r.kind === "product" ? "Products early access" : `Tier · ${r.label}`}{r.note ? ` — ${r.note}` : ""} · {relTime(r.updated_at || r.created_at)}
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
