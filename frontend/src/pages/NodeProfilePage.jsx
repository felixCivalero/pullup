// NodeProfilePage (/r/:id) — a node's profile, the room's public face. The Room
// IS the user: name + the two counts (events made · pull-ups) are the whole
// identity. Events render through the VIEWER's eyes — enterable if they pulled
// up, "going" if they RSVP'd, locked otherwise. Visible to anyone in the host's
// orbit (the invitation layer). Preview as a visitor with ?as=email.

import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { authenticatedFetch, publicFetch } from "../lib/api.js";

const INK = "#f5f4f7";
const MUTED = "rgba(245,244,247,0.55)";
const FAINT = "rgba(245,244,247,0.35)";
const PINK = "#ec178f";
const CARD = "rgba(255,255,255,0.04)";
const BORDER = "rgba(255,255,255,0.10)";

function initials(n = "") { return String(n).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?"; }
function whenLabel(iso) { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }

export default function NodeProfilePage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const asEmail = params.get("as"); // preview through a visitor's eyes
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

  if (err) return <Shell><div style={{ color: MUTED, textAlign: "center", marginTop: 40 }}>This room isn't available.</div></Shell>;
  if (!node) return <Shell><div style={{ color: FAINT, textAlign: "center", marginTop: 40 }}>Loading…</div></Shell>;

  const c = node.counts || {};
  return (
    <Shell>
      {/* Masthead — the node IS the user */}
      <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: 22 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", flexShrink: 0, overflow: "hidden", background: "linear-gradient(135deg,#ff45ad,#ec178f)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 800, color: "#fff" }}>
          {node.avatar ? <img src={node.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initials(node.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", margin: "0 0 6px", textTransform: "uppercase" }}>{node.name}</h1>
          <div style={{ display: "flex", gap: 16, fontSize: 13.5, color: MUTED }}>
            <span><b style={{ color: INK }}>{c.people ?? 0}</b> people</span>
            <span><b style={{ color: INK }}>{c.events ?? 0}</b> events</span>
            <span><b style={{ color: INK }}>{c.pullups ?? 0}</b> pullups</span>
          </div>
          {node.bio && <div style={{ fontSize: 13.5, color: FAINT, marginTop: 6, lineHeight: 1.5 }}>{node.bio}</div>}
        </div>
      </div>

      {asEmail && <div style={{ fontSize: 11.5, color: FAINT, marginBottom: 14, padding: "6px 10px", borderRadius: 8, border: `1px dashed ${BORDER}`, display: "inline-block" }}>Previewing as {asEmail}</div>}

      <div style={{ fontSize: 11, color: FAINT, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Events</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
        {events.map((e) => <EventCard key={e.id} e={e} navigate={navigate} />)}
        {events.length === 0 && <div style={{ fontSize: 13, color: FAINT }}>No events yet.</div>}
      </div>
    </Shell>
  );
}

function EventCard({ e, navigate }) {
  const pulledUp = e.viewer === "pulledup";
  const rsvped = e.viewer === "rsvped";
  const locked = e.viewer === "none";
  const go = () => {
    if (pulledUp) navigate(`/p/${e.id}`);          // enter the room you earned
    else navigate(`/e/${e.slug}`);                  // the public invitation (RSVP / view)
  };
  const tag = pulledUp ? { t: "You pulled up", c: PINK } : rsvped ? { t: "You're going", c: "#2ecc71" } : { t: e.ended ? "You missed it" : "Locked", c: FAINT };
  return (
    <button onClick={go} style={{ textAlign: "left", border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden", background: CARD, cursor: "pointer", padding: 0, color: INK }}>
      <div style={{ position: "relative", aspectRatio: "1.3", background: e.cover ? `center/cover no-repeat url(${e.cover})` : "linear-gradient(135deg,#2a2a33,#15151a)" }}>
        {locked && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(8,7,13,0.55)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#fff", border: `1px solid rgba(255,255,255,0.4)`, borderRadius: 999, padding: "5px 12px" }}>{e.ended ? "Missed" : "Pull up to unlock"}</span>
          </div>
        )}
        <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", color: tag.c, background: "rgba(8,7,13,0.6)", borderRadius: 999, padding: "3px 9px" }}>{tag.t}</span>
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
        <div style={{ fontSize: 11.5, color: FAINT, marginTop: 2 }}>{whenLabel(e.startsAt)}{pulledUp ? " · enter →" : rsvped ? " · view" : ""}</div>
      </div>
    </button>
  );
}

function Shell({ children }) {
  return (
    <div style={{ minHeight: "100dvh", background: "#08070d", color: INK, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 20px 60px" }}>{children}</div>
    </div>
  );
}
