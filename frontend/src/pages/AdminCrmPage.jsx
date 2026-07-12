// Admin Ecosystem CRM — the person-anchored god view of PullUp's whole human
// graph. Every row is a human; roles (waitlist / host / guest / pulled up /
// community / lead) are facets layered on where they appear. Replaces the old
// host-only sales pipeline. Backed by /admin/crm/funnel + /admin/crm/people.
// See services/adminEcosystem.js + [[project_the_room_is_pullup]].

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Users,
  Calendar,
  Crown,
  Sparkles,
  UserCheck,
  Heart,
  Clock,
  Instagram,
  Music2,
  X,
  GitMerge,
  Send,
  Upload,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { authenticatedFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";

const STATUS_OPTIONS = ["new", "contacted", "qualified", "proposal", "won", "lost", "churned"];
const PRIORITY_OPTIONS = ["low", "normal", "high", "vip"];

// ── Role facets — the badge palette. Each human can wear several. ──────────
const ROLE_META = {
  waitlist: { label: "Waitlist", color: "#7c3aed" },
  host: { label: "Host", color: colors.accent },
  activated: { label: "Activated", color: "#0891b2" },
  lead: { label: "Lead", color: "#b45309" },
  guest: { label: "Guest", color: colors.secondary },
  pulledup: { label: "Pulled up", color: "#16a34a" },
  community: { label: "Community", color: "#2563eb" },
  imported: { label: "Imported", color: "#64748b" },
};

// Segment chips / filters — the order the list offers. `all` is implicit.
const SEGMENTS = [
  { key: "waitlist", label: "Waitlist" },
  { key: "host", label: "Hosts" },
  { key: "activated", label: "Activated" },
  { key: "lead", label: "Leads" },
  { key: "guest", label: "Guests" },
  { key: "pulledup", label: "Pulled up" },
  { key: "community", label: "Community" },
  { key: "imported", label: "Imported" },
];

const PAGE_SIZE = 50;

function timeAgo(iso) {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function RoleBadge({ role }) {
  const m = ROLE_META[role];
  if (!m) return null;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 600,
        color: m.color,
        background: `${m.color}14`,
        border: `1px solid ${m.color}33`,
        whiteSpace: "nowrap",
        letterSpacing: "0.02em",
      }}
    >
      {m.label}
    </span>
  );
}

// One stage in the funnel header — a clickable count that filters the list.
function FunnelStage({ label, value, accent, active, onClick, hint }) {
  return (
    <button
      onClick={onClick}
      title={hint}
      style={{
        flex: "1 1 0",
        minWidth: 92,
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: 14,
        cursor: "pointer",
        background: active ? `${accent}12` : "#fff",
        border: active ? `1px solid ${accent}66` : `1px solid ${colors.border}`,
        boxShadow: active ? "none" : "0 2px 8px rgba(10,10,10,0.04)",
        transition: "background 120ms, border-color 120ms",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 700, color: accent, lineHeight: 1.05 }}>
        {value?.toLocaleString?.() ?? value ?? "—"}
      </div>
      <div style={{ fontSize: 11, color: colors.textSubtle, marginTop: 3 }}>{label}</div>
    </button>
  );
}

function FunnelArrow() {
  return (
    <span style={{ color: colors.textFaded, fontSize: 16, alignSelf: "center", flexShrink: 0 }}>→</span>
  );
}

// The one signal that matters for a person, by their strongest facet.
function PersonSignal({ p }) {
  const bits = [];
  if (p.host) {
    bits.push(
      <span key="h" style={sigStyle}>
        <Calendar size={11} /> {p.host.eventsTotal} event{p.host.eventsTotal === 1 ? "" : "s"}
      </span>,
    );
    if (p.host.sales?.status) {
      bits.push(
        <span key="s" style={sigStyle}>
          <Crown size={11} /> {p.host.sales.status}
        </span>,
      );
    }
  }
  if (p.guest) {
    bits.push(
      <span key="g" style={sigStyle}>
        <UserCheck size={11} /> {p.guest.rsvpCount} RSVP{p.guest.rsvpCount === 1 ? "" : "s"}
        {p.guest.pulledUpCount > 0 ? ` · ${p.guest.pulledUpCount} pulled up` : ""}
      </span>,
    );
  }
  if (p.community) {
    bits.push(
      <span key="c" style={sigStyle}>
        <Heart size={11} /> in {p.community.count} communit{p.community.count === 1 ? "y" : "ies"}
      </span>,
    );
  }
  if (p.waitlist) {
    bits.push(
      <span key="w" style={sigStyle}>
        <Clock size={11} /> waitlist · {p.waitlist.status}
      </span>,
    );
  }
  if (p.imported) {
    bits.push(
      <span key="i" style={sigStyle}>
        <Upload size={11} /> imported{typeof p.imported === "string" ? ` · ${p.imported}` : ""}
      </span>,
    );
  }
  if (!bits.length) {
    bits.push(
      <span key="n" style={{ ...sigStyle, color: colors.textFaded }}>
        contact only
      </span>,
    );
  }
  return <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>{bits}</div>;
}

const sigStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  fontSize: 12,
  color: colors.textSubtle,
};

export function AdminCrmPage() {
  const { loading } = useAuth();

  const [funnel, setFunnel] = useState(null);
  const [segment, setSegment] = useState("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  const [people, setPeople] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqIdRef = useRef(0);

  const [selectedId, setSelectedId] = useState(null);

  // Patch one list row in place after a drawer action, so the list reflects a
  // sales/waitlist change without a full refetch (which would reset paging).
  function patchRow(personId, updater) {
    setPeople((prev) => prev.map((p) => (p.personId === personId ? updater(p) : p)));
  }

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(t);
  }, [query]);

  // Funnel header — once.
  useEffect(() => {
    authenticatedFetch("/admin/crm/funnel")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setFunnel(d))
      .catch(() => {});
  }, []);

  // People list — refetches (from offset 0) on segment / search change.
  useEffect(() => {
    const myReq = ++reqIdRef.current;
    setListLoading(true);
    setOffset(0);
    const params = new URLSearchParams({ segment, limit: String(PAGE_SIZE), offset: "0" });
    if (debounced) params.set("q", debounced);
    authenticatedFetch(`/admin/crm/people?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (myReq !== reqIdRef.current) return; // a newer request superseded us
        if (d) {
          setPeople(d.items || []);
          setCounts(d.counts || {});
          setTotal(d.total || 0);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (myReq === reqIdRef.current) setListLoading(false);
      });
  }, [segment, debounced]);

  async function loadMore() {
    const next = offset + PAGE_SIZE;
    setLoadingMore(true);
    const params = new URLSearchParams({ segment, limit: String(PAGE_SIZE), offset: String(next) });
    if (debounced) params.set("q", debounced);
    try {
      const res = await authenticatedFetch(`/admin/crm/people?${params}`);
      const d = res.ok ? await res.json() : null;
      if (d) {
        setPeople((prev) => [...prev, ...(d.items || [])]);
        setOffset(next);
      }
    } catch {
      /* keep what we have */
    } finally {
      setLoadingMore(false);
    }
  }

  const segCount = useMemo(() => (k) => (k === "all" ? counts.all ?? total : counts[k] ?? 0), [counts, total]);

  if (loading) return null;

  return (
    <div
      className="page-with-header"
      style={{
        minHeight: "100vh",
        padding: "72px clamp(12px, 3vw, 24px) 60px",
        background: "#fff",
        boxSizing: "border-box",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: 18 }}>
          <h1 style={{ margin: 0, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 700, color: colors.text }}>
            Ecosystem
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: colors.textSubtle }}>
            Every human in PullUp's world — waitlist, hosts, guests, pull-ups, community and imports, one person per row.
          </p>
        </div>

        {/* The two funnels */}
        {funnel && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
            <FunnelRow
              icon={<Sparkles size={13} />}
              title="Creators — the people PullUp builds for"
              stages={[
                { key: "waitlist", label: "Waitlist", value: funnel.creators.waitlist, accent: ROLE_META.waitlist.color },
                { key: "host", label: "Registered hosts", value: funnel.creators.hosts, accent: ROLE_META.host.color },
                { key: "activated", label: "Activated", value: funnel.creators.activated, accent: ROLE_META.activated.color, hint: "Made at least one event" },
              ]}
              extra={{ key: "lead", label: "Leads", value: funnel.creators.leads, accent: ROLE_META.lead.color, hint: `${funnel.creators.leadsOpen ?? 0} open in pipeline` }}
              segment={segment}
              onPick={setSegment}
            />
            <FunnelRow
              icon={<Users size={13} />}
              title="Audience — the people in their rooms"
              stages={[
                { key: "all", label: "People", value: funnel.audience.people, accent: colors.text },
                { key: "guest", label: "Guests", value: funnel.audience.guests, accent: ROLE_META.guest.color, hint: "Ever RSVP'd" },
                { key: "pulledup", label: "Pulled up", value: funnel.audience.pulledUp, accent: ROLE_META.pulledup.color },
                { key: "community", label: "Community", value: funnel.audience.community, accent: ROLE_META.community.color },
              ]}
              extra={{ key: "imported", label: "Imported", value: funnel.audience.imported, accent: ROLE_META.imported.color, hint: "Added via contact import" }}
              segment={segment}
              onPick={setSegment}
            />
          </div>
        )}

        {/* Search */}
        <div style={{ position: "relative", marginBottom: 12 }}>
          <Search
            size={15}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: colors.textFaded }}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, Instagram or phone…"
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "10px 12px 10px 34px",
              borderRadius: 12,
              border: `1px solid ${colors.border}`,
              fontSize: 14,
              color: colors.text,
              outline: "none",
              background: "#fff",
            }}
          />
        </div>

        {/* Segment chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          <SegChip label="Everyone" count={segCount("all")} active={segment === "all"} onClick={() => setSegment("all")} accent={colors.text} />
          {SEGMENTS.map((s) => (
            <SegChip
              key={s.key}
              label={s.label}
              count={segCount(s.key)}
              active={segment === s.key}
              onClick={() => setSegment(s.key)}
              accent={ROLE_META[s.key].color}
            />
          ))}
        </div>

        {/* List */}
        {listLoading ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: colors.textFaded, fontSize: 13 }}>Loading…</div>
        ) : people.length === 0 ? (
          <div style={{ textAlign: "center", padding: "48px 0", color: colors.textFaded, fontSize: 13 }}>
            No one here yet.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: colors.textFaded, marginBottom: 8 }}>
              {total.toLocaleString()} {total === 1 ? "person" : "people"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {people.map((p) => (
                <PersonRow key={p.personId} p={p} onClick={() => setSelectedId(p.personId)} />
              ))}
            </div>
            {people.length < total && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                style={{
                  marginTop: 12,
                  padding: "10px 16px",
                  borderRadius: 12,
                  border: `1px solid ${colors.border}`,
                  background: "#fff",
                  color: loadingMore ? colors.textFaded : colors.textMuted,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: loadingMore ? "default" : "pointer",
                }}
              >
                {loadingMore ? "Loading…" : `Load more (${(total - people.length).toLocaleString()} left)`}
              </button>
            )}
          </>
        )}
      </div>

      {selectedId && (
        <PersonDrawer
          key={selectedId}
          personId={selectedId}
          onClose={() => setSelectedId(null)}
          onSalesChange={(sales, roles) =>
            patchRow(selectedId, (p) => ({
              ...p,
              roles: roles || p.roles,
              host: p.host ? { ...p.host, sales } : { profileId: null, brand: null, eventsTotal: 0, lastEventAt: null, lastLoginAt: null, sales },
            }))
          }
          onWaitlistChange={(status) =>
            patchRow(selectedId, (p) => ({ ...p, waitlist: p.waitlist ? { ...p.waitlist, status } : p.waitlist }))
          }
        />
      )}
    </div>
  );
}

function FunnelRow({ icon, title, stages, extra, segment, onPick }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, color: colors.textSubtle, fontSize: 12, fontWeight: 500 }}>
        {icon} {title}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap" }}>
        {stages.map((s, i) => (
          <FunnelStageWithArrow
            key={s.key}
            stage={s}
            last={i === stages.length - 1}
            segment={segment}
            onPick={onPick}
          />
        ))}
        {extra && (
          <>
            <span style={{ width: 1, alignSelf: "stretch", background: colors.border, margin: "0 2px" }} />
            <FunnelStage
              label={extra.label}
              value={extra.value}
              accent={extra.accent}
              hint={extra.hint}
              active={segment === extra.key}
              onClick={() => onPick(extra.key)}
            />
          </>
        )}
      </div>
    </div>
  );
}

function FunnelStageWithArrow({ stage, last, segment, onPick }) {
  return (
    <>
      <FunnelStage
        label={stage.label}
        value={stage.value}
        accent={stage.accent}
        hint={stage.hint}
        active={segment === stage.key}
        onClick={() => onPick(stage.key)}
      />
      {!last && <FunnelArrow />}
    </>
  );
}

function SegChip({ label, count, active, onClick, accent }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 12px",
        borderRadius: 999,
        border: active ? `1px solid ${accent}` : `1px solid ${colors.border}`,
        background: active ? `${accent}14` : "#fff",
        color: active ? accent : colors.textSubtle,
        fontSize: 12.5,
        fontWeight: active ? 600 : 500,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {label}
      <span style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}>{count?.toLocaleString?.() ?? count}</span>
    </button>
  );
}

function PersonRow({ p, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      style={{
        background: "#fff",
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        padding: "12px 16px",
        boxShadow: "0 2px 8px rgba(10,10,10,0.04)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: colors.text }}>{p.name}</span>
            {p.roles.map((r) => (
              <RoleBadge key={r} role={r} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 3, fontSize: 12, color: colors.textSubtle }}>
            {p.email && <span>{p.email}</span>}
            {p.instagram && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Instagram size={11} /> {p.instagram.replace(/^@/, "")}
              </span>
            )}
            {p.tiktok && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <Music2 size={11} /> {p.tiktok.replace(/^@/, "")}
              </span>
            )}
            {p.company && <span>{p.company}</span>}
          </div>
          <PersonSignal p={p} />
        </div>
        <div style={{ flexShrink: 0, fontSize: 11, color: colors.textFaded, textAlign: "right" }}>
          {timeAgo(p.host?.lastEventAt || p.guest?.lastRsvpAt || p.community?.joinedAt || p.createdAt)}
        </div>
      </div>
    </div>
  );
}

// ── Person detail drawer — every facet + the inline actions. ───────────────
const TIMELINE_LABEL = {
  page_view: "viewed a page",
  rsvp: "RSVP'd",
  rsvp_cancel: "cancelled an RSVP",
  waitlist_join: "joined a waitlist",
  attended: "pulled up",
  payment: "paid",
  message_in: "messaged in",
  message_out: "was messaged",
  auto_dm_sent: "got an auto-DM",
  host_logged: "logged by host",
  identity_linked: "identity linked",
  acquired: "acquired",
  note: "note",
  import: "imported",
  community_join: "joined a community",
};

function PersonDrawer({ personId, onClose, onSalesChange, onWaitlistChange }) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    authenticatedFetch(`/admin/crm/people/${encodeURIComponent(personId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [personId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const p = detail?.person;

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(10,10,10,0.28)", zIndex: 60 }}
      />
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(460px, 100vw)",
          background: "#fff",
          borderLeft: `1px solid ${colors.border}`,
          boxShadow: "-12px 0 40px rgba(10,10,10,0.12)",
          zIndex: 61,
          overflowY: "auto",
          boxSizing: "border-box",
        }}
      >
        {/* Header */}
        <div style={{ position: "sticky", top: 0, background: "#fff", borderBottom: `1px solid ${colors.border}`, padding: "16px 20px", zIndex: 1 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: colors.text }}>{p?.name || "…"}</div>
              {detail && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                  {detail.roles.map((r) => <RoleBadge key={r} role={r} />)}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: colors.textSubtle, padding: 4 }}>
              <X size={20} />
            </button>
          </div>
        </div>

        {loading || !detail ? (
          <div style={{ padding: 40, textAlign: "center", color: colors.textFaded, fontSize: 13 }}>Loading…</div>
        ) : (
          <div style={{ padding: "16px 20px 60px", display: "flex", flexDirection: "column", gap: 22 }}>
            {/* Identity */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: colors.textMuted }}>
              {p.email && <Field label="Email" value={p.email} />}
              {p.phone && <Field label="Phone" value={p.phone} />}
              {p.instagram && <Field label="Instagram" value={`@${p.instagram.replace(/^@/, "")}`} />}
              {p.tiktok && <Field label="TikTok" value={`@${p.tiktok.replace(/^@/, "")}`} />}
              {p.company && <Field label="Company" value={p.company} />}
              {p.acquisition && <Field label="Acquired via" value={p.acquisition} />}
              <Field label="First seen" value={timeAgo(p.createdAt)} />
            </div>

            {/* Identity cockpit link (real people only) */}
            {detail.matchPersonId && (
              <button
                onClick={() => navigate(`/admin/matches?focus=${detail.matchPersonId}`)}
                style={ghostBtn}
              >
                <GitMerge size={13} /> Open in identity cockpit
              </button>
            )}

            {/* Waitlist action */}
            {detail.waitlist && (
              <Section title="Creator waitlist">
                <div style={{ fontSize: 12, color: colors.textSubtle, marginBottom: 8 }}>
                  {detail.waitlist.role || "creator"} · {detail.waitlist.handle ? `@${detail.waitlist.handle.replace(/^@/, "")} · ` : ""}status: <b>{detail.waitlist.status}</b>
                </div>
                {detail.waitlist.note && (
                  <div style={{ fontSize: 13, color: colors.textMuted, background: colors.surface, borderRadius: 10, padding: "8px 10px", marginBottom: 8 }}>
                    {detail.waitlist.note}
                  </div>
                )}
                <WaitlistActions detail={detail} setDetail={setDetail} onWaitlistChange={onWaitlistChange} />
              </Section>
            )}

            {/* Sales pipeline (hosts / leads) */}
            {(detail.sales || detail.host?.profileId || detail.kind === "lead") && (
              <Section title="Sales pipeline">
                <SalesEditor detail={detail} setDetail={setDetail} onSalesChange={onSalesChange} />
              </Section>
            )}

            {/* Host events */}
            {detail.hostEvents.length > 0 && (
              <Section title={`Hosts ${detail.hostEvents.length} event${detail.hostEvents.length === 1 ? "" : "s"}`}>
                <EventList events={detail.hostEvents} showGuests />
              </Section>
            )}

            {/* Attended / RSVP'd */}
            {detail.attended.length > 0 && (
              <Section title={`Guest at ${detail.attended.length} event${detail.attended.length === 1 ? "" : "s"}`}>
                <EventList events={detail.attended} showPulled />
              </Section>
            )}

            {/* Communities */}
            {detail.communities.length > 0 && (
              <Section title="Communities">
                {detail.communities.map((c) => (
                  <div key={c.id} style={{ fontSize: 13, color: colors.textMuted, padding: "4px 0" }}>
                    {c.title} <span style={{ color: colors.textFaded, fontSize: 11 }}>· joined {timeAgo(c.joinedAt)}</span>
                  </div>
                ))}
              </Section>
            )}

            {/* Timeline */}
            {detail.timeline.length > 0 && (
              <Section title="Timeline">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {detail.timeline.map((t, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, color: colors.textMuted }}>
                      <span style={{ color: colors.textFaded, flexShrink: 0, width: 64 }}>{timeAgo(t.occurredAt)}</span>
                      <span style={{ flex: 1 }}>
                        <b style={{ fontWeight: 600, color: colors.text }}>{TIMELINE_LABEL[t.type] || t.type}</b>
                        {t.channel ? <span style={{ color: colors.textFaded }}> · {t.channel}</span> : ""}
                        {t.body ? <div style={{ color: colors.textSubtle, marginTop: 1 }}>{t.body}</div> : null}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Field({ label, value }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span style={{ color: colors.textFaded, width: 84, flexShrink: 0 }}>{label}</span>
      <span style={{ color: colors.text, wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: colors.textFaded, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function EventList({ events, showGuests, showPulled }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {events.slice(0, 12).map((e) => (
        <div key={e.eventId || e.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <Calendar size={11} style={{ color: colors.textFaded, flexShrink: 0 }} />
          <span style={{ flex: 1, color: colors.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
          {showGuests && <span style={{ color: colors.textSubtle, fontSize: 12, flexShrink: 0 }}>{e.confirmedGuests} in</span>}
          {showPulled && e.pulledUp && <span style={{ color: "#16a34a", fontSize: 11, fontWeight: 600, flexShrink: 0 }}>pulled up</span>}
          <span style={{ color: colors.textFaded, fontSize: 11, flexShrink: 0 }}>{e.startsAt ? timeAgo(e.startsAt) : ""}</span>
        </div>
      ))}
      {events.length > 12 && <div style={{ fontSize: 11, color: colors.textFaded }}>+{events.length - 12} more</div>}
    </div>
  );
}

function WaitlistActions({ detail, setDetail, onWaitlistChange }) {
  const [saving, setSaving] = useState(false);
  async function setStatus(status) {
    setSaving(true);
    try {
      const res = await authenticatedFetch(`/admin/crm/waitlist/${detail.waitlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setDetail((d) => ({ ...d, waitlist: { ...d.waitlist, status } }));
        onWaitlistChange?.(status);
      }
    } finally {
      setSaving(false);
    }
  }
  const steps = [
    { key: "invited", label: "Invite", icon: Send },
    { key: "joined", label: "Mark joined", icon: UserCheck },
  ];
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {steps.map((s) => (
        <button
          key={s.key}
          disabled={saving || detail.waitlist.status === s.key}
          onClick={() => setStatus(s.key)}
          style={{
            ...ghostBtn,
            opacity: detail.waitlist.status === s.key ? 0.45 : 1,
            cursor: detail.waitlist.status === s.key ? "default" : "pointer",
          }}
        >
          <s.icon size={13} /> {s.label}
        </button>
      ))}
    </div>
  );
}

function SalesEditor({ detail, setDetail, onSalesChange }) {
  const sales = detail.sales || {};
  const [status, setStatus] = useState(sales.status || "new");
  const [priority, setPriority] = useState(sales.priority || "normal");
  const [notes, setNotes] = useState(sales.notes || "");
  const [saving, setSaving] = useState(false);
  const dirty = status !== (sales.status || "new") || priority !== (sales.priority || "normal") || notes !== (sales.notes || "");

  async function save() {
    // Real lead row → its id; host without a lead yet → user:<profileId> lazily
    // creates the sales_leads row tied to the profile.
    const target = sales.leadId || (detail.host?.profileId ? `user:${detail.host.profileId}` : null);
    if (!target) return;
    setSaving(true);
    try {
      const res = await authenticatedFetch(`/admin/sales/leads/${target}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, priority, notes }),
      });
      if (res.ok) {
        const row = await res.json();
        const newSales = { leadId: row.id, status: row.status, priority: row.priority || "normal", source: row.source || null, notes: row.notes || "" };
        setDetail((d) => ({ ...d, sales: newSales, roles: d.roles.includes("lead") ? d.roles : [...d.roles, "lead"] }));
        onSalesChange?.(newSales, detail.roles.includes("lead") ? detail.roles : [...detail.roles, "lead"]);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <PickRow label="Status" options={STATUS_OPTIONS} value={status} onPick={setStatus} />
      <PickRow label="Priority" options={PRIORITY_OPTIONS} value={priority} onPick={setPriority} />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Internal notes…"
        rows={3}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 10px",
          borderRadius: 10,
          border: `1px solid ${colors.border}`,
          fontSize: 13,
          color: colors.text,
          resize: "vertical",
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      <button
        onClick={save}
        disabled={!dirty || saving}
        style={{
          alignSelf: "flex-start",
          padding: "7px 16px",
          borderRadius: 999,
          border: "none",
          background: dirty ? colors.accent : colors.surface,
          color: dirty ? "#fff" : colors.textFaded,
          fontSize: 13,
          fontWeight: 600,
          cursor: dirty && !saving ? "pointer" : "default",
        }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

function PickRow({ label, options, value, onPick }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: colors.textFaded, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {options.map((o) => (
          <button
            key={o}
            onClick={() => onPick(o)}
            style={{
              padding: "4px 11px",
              borderRadius: 999,
              border: value === o ? `1px solid ${colors.accent}` : `1px solid ${colors.border}`,
              background: value === o ? colors.accentSoft : "#fff",
              color: value === o ? colors.accent : colors.textSubtle,
              fontSize: 12,
              fontWeight: value === o ? 600 : 500,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

const ghostBtn = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 13px",
  borderRadius: 999,
  border: `1px solid ${colors.border}`,
  background: "#fff",
  color: colors.textMuted,
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
};
