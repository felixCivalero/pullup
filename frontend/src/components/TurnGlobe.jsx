// TurnGlobe — the ambient earth behind "pull up." on the landing page.
//
// A slow, dark globe with a pink dot glowing on every city where a PullUp room
// has actually happened. It lives BEHIND the word and the eyes: non-interactive,
// edge-faded, dimmed — atmosphere, not a chart. The literal picture of a
// follower becoming one of your people, everywhere it's already happened.
//
// Same globe.gl family as the admin globe, inverted for the dark stage. Heavy
// deps (three.js via globe.gl + topojson) are dynamically imported and the
// scene only boots once the section scrolls near view, so the landing's initial
// load never pays for it.

import { useEffect, useRef, useState } from "react";
import { publicFetch } from "../lib/api.js";

const NIGHT = "#08080e";
const PINK = "#ec178f";
const NEON = "#ff2da0";

// Verified snapshot of the real footprint (DB pydmumupoppgnopcegxq, 2026-07-21):
// the cities where PullUp rooms have actually happened. Rendered instantly so
// the beacons never depend on a reachable backend — the live /api/pullup-cities
// endpoint refreshes/extends this whenever it responds. weight = people||events.
const FALLBACK_CITIES = [
  { city: "Stockholm", country: "Sverige", lat: 59.322, lng: 18.058, events: 30, people: 180 },
  { city: "Visby", country: "Sverige", lat: 57.639, lng: 18.292, events: 1, people: 38 },
  { city: "Nairobi", country: "Kenya", lat: -1.337, lng: 36.841, events: 4, people: 0 },
  { city: "Göteborg", country: "Sverige", lat: 57.704, lng: 11.983, events: 2, people: 0 },
  { city: "Båstad", country: "Sverige", lat: 56.435, lng: 12.840, events: 1, people: 0 },
  { city: "Helsingborg", country: "Sverige", lat: 56.048, lng: 12.688, events: 1, people: 0 },
];

// Deliberate, aspirational pin — NOT a real room and NOT from the DB. Added on
// purpose ("just because"); merged on the client so it shows even though the
// live endpoint will never return it. Delete this array to remove.
const EXTRA_CITIES = [
  { city: "New York", country: "USA", lat: 40.7128, lng: -74.006, events: 1, people: 0 },
];

// Merge the aspirational pins onto whatever real list we have, skipping any that
// the real data already covers (by city name).
function withExtras(list) {
  const have = new Set((list || []).map((c) => (c.city || "").toLowerCase()));
  return [...(list || []), ...EXTRA_CITIES.filter((e) => !have.has(e.city.toLowerCase()))];
}

const prefersReduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// The camera's flight path, keyed to scroll progress (0→1). The Earth turns
// and flies between the cities as you scroll: an establishing wide shot over the
// Atlantic (New York), sweeping east and diving onto the Stockholm home cluster,
// tilting down to Nairobi, then pulling back to take in the whole lit network.
const CAM_KEYS = [
  { p: 0.0, lat: 34, lng: -64, altitude: 3.6 }, // wide — Atlantic, NY on the limb
  { p: 0.26, lat: 46, lng: -24, altitude: 2.8 }, // flying in, turning east
  { p: 0.52, lat: 55, lng: 16, altitude: 1.95 }, // dive onto the Sweden cluster
  { p: 0.76, lat: 10, lng: 33, altitude: 2.35 }, // tilt down to Nairobi
  { p: 1.0, lat: 27, lng: 6, altitude: 3.05 }, // pull back — the whole network lit
];
function cameraAt(p) {
  const t = Math.min(1, Math.max(0, p));
  for (let i = 1; i < CAM_KEYS.length; i++) {
    if (t <= CAM_KEYS[i].p) {
      const a = CAM_KEYS[i - 1], b = CAM_KEYS[i];
      const f = (t - a.p) / (b.p - a.p || 1);
      const e = f * f * (3 - 2 * f); // smoothstep — no camera jerk at keyframes
      return {
        lat: a.lat + (b.lat - a.lat) * e,
        lng: a.lng + (b.lng - a.lng) * e,
        altitude: a.altitude + (b.altitude - a.altitude) * e,
      };
    }
  }
  return CAM_KEYS[CAM_KEYS.length - 1];
}

export default function TurnGlobe({ progress = 0, active = false }) {
  const hostRef = useRef(null); // the positioned wrapper (owns the mask + fade)
  const elRef = useRef(null); // globe.gl mount target
  const globeRef = useRef(null);
  const labelRafRef = useRef(null); // cancels the label-reveal loop on teardown
  const [near, setNear] = useState(false); // section scrolled into range → boot
  const [cities, setCities] = useState(null);

  // Boot only when the section approaches the viewport — keeps three.js off the
  // critical path for visitors who never scroll this far.
  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true); // no observer support → just show it
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          obs.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // The real cities — aggregate, public, no PII. Falls back to the baked
  // snapshot whenever the endpoint is unreachable or empty (e.g. local dev with
  // no backend), so the beacons always render.
  useEffect(() => {
    if (!near) return;
    let on = true;
    publicFetch("/api/pullup-cities")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const c = d?.cities;
        if (on) setCities(withExtras(Array.isArray(c) && c.length ? c : FALLBACK_CITIES));
      })
      .catch(() => on && setCities(withExtras(FALLBACK_CITIES)));
    return () => {
      on = false;
    };
  }, [near]);

  // Boot the globe once (after deps + data land).
  useEffect(() => {
    if (!near || !cities || !elRef.current || globeRef.current) return;
    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const [{ default: Globe }, topojson] = await Promise.all([
        import("globe.gl"),
        import("topojson-client"),
      ]);
      if (disposed || !elRef.current) return;

      const reduced = prefersReduced();
      const w = elRef.current.clientWidth || 800;
      const h = elRef.current.clientHeight || 800;

      // Scroll drives the camera when we're on desktop with motion allowed;
      // otherwise the globe just drifts gently on its own.
      const cinematic = active && !reduced;

      const g = Globe()(elRef.current)
        .backgroundColor("rgba(0,0,0,0)")
        .showGlobe(true)
        .showGraticules(false)
        .showAtmosphere(true)
        .atmosphereColor(PINK)
        .atmosphereAltitude(0.26)
        .width(w)
        .height(h);
      // Dark ocean, a hair lighter than the section so the sphere reads.
      g.globeMaterial().color.set("#12121c");

      // Non-interactive backdrop: no zoom, no manual spin.
      const controls = g.controls();
      controls.enableZoom = false;
      controls.enablePan = false;
      controls.enableRotate = false;
      controls.autoRotate = !cinematic && !reduced; // scroll takes over in cinema
      controls.autoRotateSpeed = 0.16;

      const cam0 = cinematic ? cameraAt(progress) : { lat: 25, lng: 2, altitude: 2.7 };
      g.pointOfView(cam0, 0);

      // Faint land, so the dots have a continent to sit on without stealing the
      // word's light.
      fetch("https://unpkg.com/world-atlas@2.0.2/countries-110m.json")
        .then((r) => r.json())
        .then((topo) => {
          if (disposed) return;
          g.polygonsData(topojson.feature(topo, topo.objects.countries).features)
            .polygonCapColor(() => "#2a2a3a")
            .polygonSideColor(() => "rgba(0,0,0,0)")
            .polygonStrokeColor(() => "rgba(236,23,143,0.22)")
            .polygonAltitude(0.006);
        })
        .catch(() => {});

      // A nice small flat dot per city — sitting just on the surface (near-zero
      // altitude so it reads as a dot, not an extruded pillar). Barely scaled by
      // activity so they stay small and even.
      const maxW = Math.max(1, ...cities.map((c) => c.people || c.events || 1));
      const weight = (c) => (c.people || c.events || 1) / maxW; // 0..1
      const dotR = (c) => 0.45 + Math.sqrt(weight(c)) * 0.35; // ~0.45–0.8°

      g.pointsData(cities)
        .pointLat((c) => c.lat)
        .pointLng((c) => c.lng)
        .pointColor(() => "#ff4dae")
        .pointAltitude(0.01) // flat on the surface — a dot, not a column
        .pointRadius(dotR)
        .pointResolution(24)
        .pointsMerge(false);

      // The city names — uppercase title cards that BLOOM IN as the camera
      // reaches each city and fade as it moves on. HTML (not 3D text) so the
      // reveal can be buttery; the reveal + occlusion are both driven by how
      // centred the city is under the current camera, so far-side names hide
      // themselves and the names light up in the camera's order of visit.
      g.htmlElementsData(cities)
        .htmlLat((c) => c.lat)
        .htmlLng((c) => c.lng)
        .htmlAltitude(0.02)
        .htmlElement((c) => {
          const wrap = document.createElement("div");
          wrap.style.pointerEvents = "none";
          const inner = document.createElement("div");
          inner.textContent = (c.city || "").toUpperCase();
          inner.style.cssText =
            "font:800 12px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;" +
            "letter-spacing:0.26em;white-space:nowrap;color:#ffe1f2;" +
            "text-shadow:0 0 14px rgba(255,45,160,0.7),0 1px 4px rgba(0,0,0,0.65);" +
            "opacity:0;transform-origin:center;will-change:opacity,transform;";
          wrap.appendChild(inner);
          c.__label = inner; // the rAF below animates this
          return wrap;
        });

      // One rAF loop reveals the names from the live camera — works the same
      // whether scroll or the gentle auto-drift is moving it.
      let labelRaf = null;
      const revealLabels = () => {
        const pov = g.pointOfView();
        const cl = (pov.lat * Math.PI) / 180;
        const cg = (pov.lng * Math.PI) / 180;
        for (const c of cities) {
          const el = c.__label;
          if (!el) continue;
          const pl = (c.lat * Math.PI) / 180;
          const pg = (c.lng * Math.PI) / 180;
          // cosine of angular distance from screen centre: 1 = dead centre.
          const cosd =
            Math.sin(cl) * Math.sin(pl) +
            Math.cos(cl) * Math.cos(pl) * Math.cos(cg - pg);
          const k = Math.max(0, (cosd - 0.4) / 0.6); // 0 past ~66°, 1 at centre
          const o = k * k * (3 - 2 * k); // smoothstep
          el.style.opacity = o.toFixed(3);
          el.style.transform = `translateY(${(-8 - o * 12).toFixed(1)}px) scale(${(0.82 + o * 0.28).toFixed(3)})`;
          el.style.visibility = o < 0.015 ? "hidden" : "visible";
        }
        labelRaf = requestAnimationFrame(revealLabels);
      };
      labelRaf = requestAnimationFrame(revealLabels);
      labelRafRef.current = () => { if (labelRaf) cancelAnimationFrame(labelRaf); };

      if (!reduced) {
        // A soft pulse ring under each dot — subtle, kept small so it frames the
        // dot rather than swallowing it.
        g.ringsData(cities)
          .ringLat((c) => c.lat)
          .ringLng((c) => c.lng)
          .ringColor(() => (t) => `rgba(255,77,174,${Math.max(0, 0.55 * (1 - t))})`)
          .ringMaxRadius((c) => 1.6 + weight(c) * 1.8)
          .ringPropagationSpeed(1.1)
          .ringRepeatPeriod(1600)
          .ringAltitude(0.011);
      }

      // The network — arcs from the Stockholm home base out to every other city,
      // with a bright pulse forever travelling each line. The web of rooms,
      // lit. Great-circle arcs loft higher the farther they reach (NY, Nairobi
      // arc over the planet; the Swedish ones stay low and local).
      const hub =
        cities.find((c) => /stockholm/i.test(c.city)) ||
        cities.slice().sort((a, b) => (b.people || 0) - (a.people || 0))[0] ||
        cities[0];
      if (hub) {
        const arcs = cities
          .filter((c) => c !== hub && (c.lat !== hub.lat || c.lng !== hub.lng))
          .map((c) => ({ sLat: hub.lat, sLng: hub.lng, eLat: c.lat, eLng: c.lng }));
        g.arcsData(arcs)
          .arcStartLat((a) => a.sLat)
          .arcStartLng((a) => a.sLng)
          .arcEndLat((a) => a.eLat)
          .arcEndLng((a) => a.eLng)
          .arcColor(() => ["rgba(255,92,192,0.04)", "rgba(255,120,208,0.9)"])
          .arcStroke(0.32)
          .arcAltitudeAutoScale(0.5)
          .arcDashLength(reduced ? 1 : 0.42)
          .arcDashGap(reduced ? 0 : 1.0)
          .arcDashInitialGap(() => Math.random() * 2) // stagger so they don't pulse in lockstep
          .arcDashAnimateTime(reduced ? 0 : 2800);
      }

      globeRef.current = g;

      const onResize = () => {
        if (!elRef.current) return;
        g.width(elRef.current.clientWidth).height(elRef.current.clientHeight);
      };
      let ro;
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(onResize);
        ro.observe(elRef.current);
      } else {
        window.addEventListener("resize", onResize);
      }
      cleanup = () => {
        labelRafRef.current?.();
        ro ? ro.disconnect() : window.removeEventListener("resize", onResize);
        g._destructor?.();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
      globeRef.current = null;
    };
  }, [near, cities]);

  // Scroll is the camera dolly: every progress tick re-aims the globe along the
  // flight path. Snapped (duration 0) because the scroll position IS the
  // easing — globe.gl smoothing on top would lag behind the finger.
  useEffect(() => {
    const g = globeRef.current;
    if (!g || !active || prefersReduced()) return;
    g.controls().autoRotate = false; // scroll owns the camera now — no drift fight
    g.pointOfView(cameraAt(progress), 0);
  }, [progress, active]);

  return (
    <div ref={hostRef} className="mk-turn-globe" aria-hidden="true">
      <div ref={elRef} className="mk-turn-globe-canvas" />
    </div>
  );
}
