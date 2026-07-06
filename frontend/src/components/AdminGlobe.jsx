// AdminGlobe — the pulse of PullUp, on a globe.
//
// White earth, ink borders, neon-pink dots breathing where events are coming,
// ink dust where they happened. Around it: real controls — search, time
// filters, a city lens — and a pulse rail listing what's live. Click a dot
// (or a row) and the globe flies there and opens the event's card.
// Data: /admin/events-map (lat/lng + status + coming counts).

import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Search, X } from "lucide-react";
import Globe from "globe.gl";
import * as topojson from "topojson-client";

const PINK = "#ec178f";
const NEON = "#ff2da0";
const INK = "#0a0a0a";
const LINE = "rgba(10,10,10,0.09)";
const MUTED = "rgba(10,10,10,0.55)";
const FAINT = "rgba(10,10,10,0.35)";

// Location strings are Google-shaped: "Venue, Street 12, 116 45 Stockholm,
// Sverige". The CITY is the last segment that isn't a country, with any
// postal-code prefix stripped — not the country, which is what a naive
// last-segment read returns (the "Sverige, Sverige, Sverige" globe).
const COUNTRIES = new Set([
  "sverige", "sweden", "norge", "norway", "danmark", "denmark", "finland", "suomi",
  "kenya", "germany", "deutschland", "tyskland", "spain", "españa", "espana", "spanien",
  "france", "frankrike", "italy", "italia", "italien", "uk", "united kingdom", "england",
  "usa", "united states", "netherlands", "nederland", "nederländerna", "belgium", "belgien",
  "portugal", "poland", "polen", "estonia", "estland", "iceland", "island", "schweiz",
  "switzerland", "austria", "österrike", "greece", "grekland",
]);
export function cityOf(location) {
  const parts = String(location || "").split(",").map((s) => s.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    if (COUNTRIES.has(parts[i].toLowerCase())) continue;
    const city = parts[i].replace(/^[\d\s-]+/, "").trim(); // "116 45 Stockholm" → "Stockholm"
    if (city) return city;
  }
  return parts[parts.length - 1] || "Unknown";
}
export function countryOf(location) {
  const parts = String(location || "").split(",").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] || "";
  return COUNTRIES.has(last.toLowerCase()) ? last : null;
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined });
}

const chipStyle = (on, color = INK) => ({
  fontSize: 12.5, fontWeight: 700, padding: "6px 12px", borderRadius: 999, cursor: "pointer",
  border: `1px solid ${on ? "transparent" : LINE}`, background: on ? color : "#fff", color: on ? "#fff" : MUTED,
});

export function AdminGlobe({ events }) {
  const el = useRef(null);
  const globeRef = useRef(null);
  const [land, setLand] = useState(null);
  const [when, setWhen] = useState("upcoming"); // upcoming | past | all
  const [city, setCity] = useState("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  // Camera altitude — dots/labels/rings are sized in world degrees, so they
  // must shrink as you fly in or a "small dot" becomes a black continent.
  const [alt, setAlt] = useState(1.9);
  const altRef = useRef(1.9);

  useEffect(() => {
    let on = true;
    fetch("https://unpkg.com/world-atlas@2.0.2/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => on && setLand(topojson.feature(topo, topo.objects.countries).features))
      .catch(() => {});
    return () => { on = false; };
  }, []);

  const now = Date.now();
  const all = useMemo(
    () => (events || []).filter((e) => e.lat != null && e.lng != null).map((e) => ({
      ...e,
      city: cityOf(e.location),
      country: countryOf(e.location),
      upcoming: !!(e.startsAt && new Date(e.startsAt).getTime() > now),
    })),
    [events, now],
  );

  const cities = useMemo(() => {
    const m = new Map();
    for (const e of all) m.set(e.city, (m.get(e.city) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const points = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((e) => {
      if (when === "upcoming" && !e.upcoming) return false;
      if (when === "past" && e.upcoming) return false;
      if (city !== "all" && e.city !== city) return false;
      if (needle && !`${e.title} ${e.host || ""} ${e.city} ${e.location}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [all, when, city, q]);

  // ── Globe boot (once) ──
  useEffect(() => {
    if (!el.current || globeRef.current) return;
    const g = Globe()(el.current)
      .backgroundColor("rgba(0,0,0,0)")
      .showGlobe(true)
      .showGraticules(false)
      .showAtmosphere(true)
      .atmosphereColor(PINK)
      .atmosphereAltitude(0.12)
      .width(el.current.clientWidth)
      .height(el.current.clientHeight);
    g.globeMaterial().color.set("#ffffff");
    g.controls().autoRotate = true;
    g.controls().autoRotateSpeed = 0.5;
    g.controls().enableZoom = true;
    g.pointOfView({ lat: 45, lng: 18, altitude: 1.9 }, 0);
    g.onZoom((pov) => {
      // Re-render sizes only on meaningful altitude change (rotation keeps
      // altitude constant — don't churn state 60×/s while it spins).
      if (Math.abs(pov.altitude - altRef.current) / altRef.current > 0.08) {
        altRef.current = pov.altitude;
        setAlt(pov.altitude);
      }
    });
    globeRef.current = g;
    const onResize = () => g.width(el.current?.clientWidth || 800).height(el.current?.clientHeight || 560);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); g._destructor?.(); globeRef.current = null; };
  }, []);

  useEffect(() => {
    const g = globeRef.current;
    if (!g || !land) return;
    g.polygonsData(land)
      .polygonCapColor(() => "#ffffff")
      .polygonSideColor(() => "rgba(0,0,0,0)")
      .polygonStrokeColor(() => "#0a0a0a")
      .polygonAltitude(0.001);
  }, [land]);

  // ── Data → globe (re-runs on every filter change) ──
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    // Proportional to zoom: full size at the opening view (alt 1.9), shrinking
    // linearly as you fly in, floored so dots never vanish.
    const k = Math.max(0.045, Math.min(1, alt / 1.9));
    g.pointsData(points)
      .pointResolution(24)
      .pointLat((d) => d.lat)
      .pointLng((d) => d.lng)
      .pointColor((d) => (selected && d.id === selected.id ? "#c2127a" : d.upcoming ? NEON : "rgba(10,10,10,0.35)"))
      .pointAltitude(() => 0.01)
      .pointRadius((d) => (selected && d.id === selected.id ? 0.4 : d.upcoming ? 0.28 : 0.16) * k)
      .pointLabel((d) => `<div style="font-family:-apple-system,sans-serif;font-size:12px;background:#fff;color:${INK};border:1px solid rgba(10,10,10,0.12);border-radius:10px;padding:8px 10px;box-shadow:0 8px 24px rgba(10,10,10,0.14);">
          <b>${String(d.title).replace(/</g, "&lt;")}</b><br/>
          ${d.city} · ${fmtDate(d.startsAt)}${d.coming ? ` · ${d.coming} coming` : ""}
        </div>`)
      .onPointClick((d) => select(d));
    g.ringsData(points.filter((p) => p.upcoming))
      .ringLat((d) => d.lat)
      .ringLng((d) => d.lng)
      .ringColor(() => (t) => `rgba(255,45,160,${Math.max(0, 0.65 * (1 - t))})`)
      .ringMaxRadius(2.6 * k)
      .ringPropagationSpeed(1.6 * k)
      .ringRepeatPeriod(1300)
      .ringAltitude(0.011);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, selected, alt]);

  function select(e) {
    setSelected(e);
    const g = globeRef.current;
    if (g && e) {
      g.controls().autoRotate = false;
      g.pointOfView({ lat: e.lat - 0.1, lng: e.lng, altitude: 0.35 }, 900);
    }
  }
  function clearSelected() {
    setSelected(null);
    const g = globeRef.current;
    if (g) g.controls().autoRotate = true;
  }

  const rail = useMemo(() => {
    const up = points.filter((p) => p.upcoming).sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt));
    const past = points.filter((p) => !p.upcoming).sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt));
    return [...up, ...past];
  }, [points]);

  return (
    <div>
      {/* Controls — the lens over the world. */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        {[["upcoming", "Upcoming"], ["past", "History"], ["all", "All"]].map(([k, label]) => (
          <button key={k} onClick={() => { setWhen(k); clearSelected(); }} style={chipStyle(when === k, PINK)}>{label}</button>
        ))}
        <div style={{ width: 1, height: 18, background: LINE, margin: "0 4px" }} />
        <select value={city} onChange={(e) => { setCity(e.target.value); clearSelected(); }}
          style={{ fontSize: 12.5, fontWeight: 600, padding: "6px 10px", borderRadius: 10, border: `1px solid ${LINE}`, background: "#fff", color: INK }}>
          <option value="all">Everywhere</option>
          {cities.map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: `1px solid ${LINE}`, borderRadius: 999, padding: "6px 12px", minWidth: 180 }}>
          <Search size={13} color={FAINT} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, hosts…"
            style={{ border: "none", outline: "none", background: "none", fontSize: 12.5, color: INK, width: "100%" }} />
          {q && <button onClick={() => setQ("")} style={{ border: "none", background: "none", cursor: "pointer", color: FAINT, padding: 0, display: "flex" }}><X size={13} /></button>}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: MUTED }}>{points.length} event{points.length === 1 ? "" : "s"} in view</span>
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        {/* The globe */}
        <div style={{ position: "relative", flex: 1, minWidth: 0, borderRadius: 20, border: `1px solid ${LINE}`, overflow: "hidden", background: "radial-gradient(ellipse at 50% 40%, #ffffff 55%, #fdf1f7 100%)" }}>
          <div ref={el} style={{ height: "min(68vh, 680px)", cursor: "grab" }} />
          <div style={{ position: "absolute", bottom: 12, right: 16, fontSize: 10.5, color: FAINT, pointerEvents: "none" }}>
            <span style={{ color: NEON, fontWeight: 700 }}>●</span> upcoming &nbsp; <span style={{ fontWeight: 700 }}>●</span> happened · drag to spin · click a dot
          </div>
        </div>

        {/* The pulse rail — selected card on top, then everything in view. */}
        <div style={{ width: 316, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10, maxHeight: "min(68vh, 680px)" }}>
          {selected && (
            <div style={{ border: `1.5px solid ${PINK}`, borderRadius: 16, background: "#fff", padding: "14px 15px", boxShadow: "0 10px 34px rgba(236,23,143,0.14)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.07em", color: selected.upcoming ? PINK : MUTED }}>
                    {selected.upcoming ? "Upcoming" : "Happened"}{selected.status ? ` · ${String(selected.status).toLowerCase()}` : ""}
                  </span>
                  <div style={{ fontSize: 15.5, fontWeight: 800, letterSpacing: "-0.01em", lineHeight: 1.25, marginTop: 3 }}>{selected.title}</div>
                </div>
                <button onClick={clearSelected} aria-label="Close" style={{ border: "none", background: "none", cursor: "pointer", color: FAINT, padding: 2 }}><X size={16} /></button>
              </div>
              <div style={{ fontSize: 12.5, color: MUTED, marginTop: 8, lineHeight: 1.55 }}>
                {selected.host && <div><b style={{ color: INK }}>{selected.host}</b> hosts</div>}
                <div>{fmtDate(selected.startsAt)}{selected.city ? ` · ${selected.city}` : ""}{selected.country ? `, ${selected.country}` : ""}</div>
                {selected.location && <div style={{ color: FAINT }}>{selected.location}</div>}
                <div style={{ marginTop: 4, fontWeight: 700, color: INK }}>{selected.coming || 0}{selected.capacity ? ` / ${selected.capacity}` : ""} coming</div>
              </div>
              {selected.slug && (
                <a href={`/e/${selected.slug}`} target="_blank" rel="noreferrer"
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: 12.5, fontWeight: 700, color: "#fff", background: PINK, borderRadius: 999, padding: "8px 14px", textDecoration: "none" }}>
                  Open event page <ExternalLink size={12} />
                </a>
              )}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, border: `1px solid ${LINE}`, borderRadius: 16, background: "#fff", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 14px", borderBottom: `1px solid ${LINE}`, fontSize: 11, fontWeight: 700, color: FAINT, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              The pulse · {points.length}
            </div>
            <div style={{ overflowY: "auto" }}>
              {rail.map((e) => (
                <button key={e.id} onClick={() => select(e)}
                  style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", border: "none", borderBottom: `1px solid ${LINE}`, background: selected?.id === e.id ? "rgba(236,23,143,0.05)" : "#fff", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, flexShrink: 0, background: e.upcoming ? NEON : "rgba(10,10,10,0.25)", boxShadow: e.upcoming ? "0 0 8px rgba(255,45,160,0.7)" : "none" }} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</div>
                    <div style={{ fontSize: 11.5, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[e.city, fmtDate(e.startsAt), e.host].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: e.upcoming ? PINK : FAINT, flexShrink: 0 }}>{e.coming || 0}{e.capacity ? `/${e.capacity}` : ""}</span>
                </button>
              ))}
              {rail.length === 0 && <div style={{ padding: 30, textAlign: "center", color: FAINT, fontSize: 13 }}>Nothing matches — widen the lens.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
