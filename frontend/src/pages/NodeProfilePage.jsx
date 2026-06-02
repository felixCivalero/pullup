// NodeProfilePage (/r/:id) — a node's profile, the room's public face. The Room
// IS the user: name + the two counts (events made · pull-ups) are the whole
// identity. Events render through the VIEWER's eyes — enterable if they pulled
// up, "going" if they RSVP'd, locked otherwise. Clean PullUp brand (light,
// pink, the eyes), visible to anyone in the host's orbit. Preview with ?as=email.

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { authenticatedFetch, publicFetch } from "../lib/api.js";
import { colors } from "../theme/colors.js";
import { PullupEyes } from "../components/PullupEyes.jsx";

const SF = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

function initials(n = "") { return String(n).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }
function whenLabel(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

export default function NodeProfilePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const asEmail = params.get("as");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const p = asEmail
      ? publicFetch(`/r/${id}?email=${encodeURIComponent(asEmail)}`)
      : authenticatedFetch(`/r/${id}`).catch(() => publicFetch(`/r/${id}`));
    Promise.resolve(p)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr(true));
    return () => { alive = false; };
  }, [id, asEmail]);

  const node = data?.node;
  const events = useMemo(() => data?.events || [], [data]);

  if (err) return <Shell><div style={{ color: colors.textMuted, textAlign: "center", marginTop: 40 }}>This room isn't available.</div></Shell>;
  if (!node) return <Shell><div style={{ color: colors.textFaded, textAlign: "center", marginTop: 40 }}>Loading…</div></Shell>;

  const c = node.counts || {};
  return (
    <Shell>
      {/* Masthead — the node IS the user */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 24 }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "linear-gradient(135deg,#ff45ad,#ec178f)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", border: `1px solid ${colors.borderFaint}` }}>
          {node.avatar ? <img src={node.avatar} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(node.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 27, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px", textTransform: "uppercase", color: colors.text }}>{node.name}</h1>
          <div style={{ display: "flex", gap: 16, fontSize: 13.5, color: colors.textMuted }}>
            <span><b style={{ color: colors.text }}>{c.people ?? 0}</b> people</span>
            <span><b style={{ color: colors.text }}>{c.events ?? 0}</b> events</span>
            <span><b style={{ color: colors.text }}>{c.pullups ?? 0}</b> pullups</span>
          </div>
          {node.bio && <div style={{ fontSize: 13.5, color: colors.textSubtle, marginTop: 6, lineHeight: 1.5 }}>{node.bio}</div>}
        </div>
      </div>

      {asEmail && <div style={{ fontSize: 11.5, color: colors.textFaded, marginBottom: 16, padding: "6px 10px", borderRadius: 8, border: `1px dashed ${colors.border}`, display: "inline-block" }}>Previewing as {asEmail}</div>}

      <div style={{ fontSize: 11, color: colors.textSubtle, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12, fontWeight: 700 }}>Events</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {events.map((e) => <EventCard key={e.id} e={e} navigate={navigate} />)}
        {events.length === 0 && <div style={{ fontSize: 13, color: colors.textFaded }}>No events yet.</div>}
      </div>

      {/* Branding — the eyes */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 40, color: colors.textFaded }}>
        <PullupEyes variant="small" style={{ width: 26, height: 22, display: "block", opacity: 0.55 }} />
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" }}>PullUp</span>
      </div>
    </Shell>
  );
}

function EventCard({ e, navigate }) {
  const pulledUp = e.viewer === "pulledup";
  const rsvped = e.viewer === "rsvped";
  const locked = e.viewer === "none";
  const go = () => (pulledUp ? navigate(`/p/${e.id}`) : navigate(`/e/${e.slug}`));
  const tag = pulledUp ? { t: "You pulled up", c: colors.accent } : rsvped ? { t: "You're going", c: colors.secondary } : { t: e.ended ? "You missed it" : "Locked", c: colors.textSubtle };
  return (
    <button onClick={go} style={{ textAlign: "left", border: `1px solid ${colors.border}`, borderRadius: 16, overflow: "hidden", background: colors.surface, cursor: "pointer", padding: 0, color: colors.text, fontFamily: SF }}>
      <div style={{ position: "relative", aspectRatio: "1.3", background: "linear-gradient(135deg, #fde7f3, #f4f4f5)" }}>
        {e.cover && <img src={e.cover} alt="" onError={(ev) => { ev.currentTarget.style.display = "none"; }} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        {locked && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: colors.text, border: `1px solid ${colors.borderStrong}`, borderRadius: 999, padding: "5px 12px", background: "rgba(255,255,255,0.7)" }}>{e.ended ? "Missed" : "Pull up to unlock"}</span>
          </div>
        )}
        <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", color: "#fff", background: tag.c, borderRadius: 999, padding: "3px 9px" }}>{tag.t}</span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
        <div style={{ fontSize: 11.5, color: colors.textFaded, marginTop: 2 }}>{whenLabel(e.startsAt)}{pulledUp ? " · enter →" : rsvped ? " · view" : ""}</div>
      </div>
    </button>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100dvh", background: colors.background, color: colors.text, fontFamily: SF }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px 60px" }}>
        <div style={{ marginBottom: 24 }}><PullupEyes variant="small" style={{ width: 30, height: 24, display: "block", opacity: 0.9 }} /></div>
        {children}
      </div>
    </div>
  );
}
