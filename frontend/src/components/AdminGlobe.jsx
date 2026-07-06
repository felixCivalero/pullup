// AdminGlobe — the landing view of PullUp HQ: the world, PullUp-styled.
// White earth, ink country borders, a soft pink atmosphere, and every located
// event as a dot — pink pillars for what's coming, ink dust for what happened.
// Auto-rotates until you grab it. Data: /admin/events-map (lat/lng + status).

import { useEffect, useMemo, useRef, useState } from "react";
import Globe from "globe.gl";
import * as topojson from "topojson-client";

const PINK = "#ec178f";
const INK = "#0a0a0a";

function cityOf(location) {
  const parts = String(location || "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "Unknown";
}

export function AdminGlobe({ events }) {
  const el = useRef(null);
  const globeRef = useRef(null);
  const [land, setLand] = useState(null);

  // Country borders once per session (110m — light and crisp at globe scale).
  useEffect(() => {
    let on = true;
    fetch("https://unpkg.com/world-atlas@2.0.2/countries-110m.json")
      .then((r) => r.json())
      .then((topo) => on && setLand(topojson.feature(topo, topo.objects.countries).features))
      .catch(() => {});
    return () => { on = false; };
  }, []);

  const now = Date.now();
  const points = useMemo(
    () => (events || []).filter((e) => e.lat != null && e.lng != null).map((e) => ({
      ...e,
      upcoming: !!(e.startsAt && new Date(e.startsAt).getTime() > now),
    })),
    [events, now],
  );
  // One label per city, so names read like a route map, not noise.
  const labels = useMemo(() => {
    const seen = new Map();
    for (const p of points) {
      const c = cityOf(p.location);
      if (!seen.has(c)) seen.set(c, { city: c, lat: p.lat, lng: p.lng, n: 0, upcoming: false });
      const s = seen.get(c);
      s.n += 1;
      s.upcoming = s.upcoming || p.upcoming;
    }
    return [...seen.values()];
  }, [points]);

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
    g.controls().autoRotateSpeed = 0.55;
    g.controls().enableZoom = true;
    g.pointOfView({ lat: 45, lng: 18, altitude: 1.9 }, 0); // Europe first — where the events are
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
      .polygonStrokeColor(() => "rgba(10,10,10,0.55)")
      .polygonAltitude(0.004);
  }, [land]);

  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    g.pointsData(points)
      .pointLat((d) => d.lat)
      .pointLng((d) => d.lng)
      .pointColor((d) => (d.upcoming ? PINK : "rgba(10,10,10,0.45)"))
      .pointAltitude((d) => (d.upcoming ? 0.09 : 0.015))
      .pointRadius((d) => (d.upcoming ? 0.55 : 0.3))
      .pointLabel((d) => `<div style="font-family:-apple-system,sans-serif;font-size:12px;background:#fff;color:${INK};border:1px solid rgba(10,10,10,0.12);border-radius:10px;padding:8px 10px;box-shadow:0 8px 24px rgba(10,10,10,0.14);">
          <b>${String(d.title).replace(/</g, "&lt;")}</b><br/>
          ${cityOf(d.location)} · ${d.startsAt ? new Date(d.startsAt).toLocaleDateString() : ""}${d.coming ? ` · ${d.coming} coming` : ""}${d.host ? `<br/><span style=\"color:rgba(10,10,10,0.5)\">${String(d.host).replace(/</g, "&lt;")}</span>` : ""}
        </div>`)
      .onPointClick((d) => { if (d.slug) window.open(`/e/${d.slug}`, "_blank"); });
    g.labelsData(labels)
      .labelLat((d) => d.lat)
      .labelLng((d) => d.lng)
      .labelText((d) => d.city)
      .labelSize(0.55)
      .labelDotRadius(0)
      .labelColor((d) => (d.upcoming ? PINK : "rgba(10,10,10,0.65)"))
      .labelAltitude(0.012)
      .labelResolution(2);
  }, [points, labels]);

  const upcoming = points.filter((p) => p.upcoming);
  const cities = new Set(points.map((p) => cityOf(p.location)));
  const nextUp = upcoming.slice().sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))[0];

  return (
    <div style={{ position: "relative", borderRadius: 20, border: "1px solid rgba(10,10,10,0.09)", overflow: "hidden", background: "radial-gradient(ellipse at 50% 40%, #ffffff 55%, #fdf1f7 100%)" }}>
      <div ref={el} style={{ height: "min(72vh, 720px)", cursor: "grab" }} />
      {/* Floating facts — the expansion read at a glance. */}
      <div style={{ position: "absolute", top: 18, left: 18, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", border: "1px solid rgba(10,10,10,0.08)", borderRadius: 14, padding: "10px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: INK }}>{upcoming.length}<span style={{ color: PINK }}>.</span></div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(10,10,10,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>upcoming events</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", border: "1px solid rgba(10,10,10,0.08)", borderRadius: 14, padding: "10px 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.02em", color: INK }}>{cities.size}</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(10,10,10,0.45)", textTransform: "uppercase", letterSpacing: "0.06em" }}>cities reached</div>
        </div>
        {nextUp && (
          <div style={{ background: "rgba(255,255,255,0.9)", backdropFilter: "blur(8px)", border: "1px solid rgba(10,10,10,0.08)", borderRadius: 14, padding: "10px 14px", maxWidth: 220 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{nextUp.title}</div>
            <div style={{ fontSize: 11, color: "rgba(10,10,10,0.5)" }}>next · {cityOf(nextUp.location)} · {new Date(nextUp.startsAt).toLocaleDateString()}</div>
          </div>
        )}
      </div>
      <div style={{ position: "absolute", bottom: 14, right: 18, fontSize: 10.5, color: "rgba(10,10,10,0.35)", pointerEvents: "none" }}>
        <span style={{ color: PINK, fontWeight: 700 }}>●</span> upcoming &nbsp; <span style={{ fontWeight: 700 }}>●</span> happened · drag to spin
      </div>
    </div>
  );
}
