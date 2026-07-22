import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { PullupEyes } from "../../components/PullupEyes.jsx";
import { transformedImageUrl } from "../../lib/imageUtils.js";
import { trackPageView, initTracking } from "../../lib/track.js";
import { CASE_STATS, CASE_TIMELINE, CASE_CONTRIBUTORS, CASE_GALLERY, CASE_WALK_PHOTOS } from "./adamFlamboData.js";

/* ════════════════════════════════════════════════════════════════════════
   ADAM FLAMBO — a genuine PullUp case study.
   Every number on this page is verified against production (Supabase): his
   6 Stockholm Photo Walks, the room's 334 uploaded photos, the 26 credited
   contributors, 208-strong community. The arc: intimate walks whose ROOM
   caught fire — and, because every photo carried a name and commercial
   consent, became a printed magazine with the pullupers as contributors.
   Design: dark editorial "exhibition at night" — the photos are the stars.
   ════════════════════════════════════════════════════════════════════════ */

const PINK = "#EC178F";
const NIGHT = "#08080e";
const STORAGE_BASE =
  (import.meta.env.VITE_SUPABASE_URL || "") + "/storage/v1/object/public/event-images/";

const imgUrl = (p, w, q = 74) => transformedImageUrl(STORAGE_BASE + p, { width: w, quality: q });

const prefersReduced = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ─── scroll reveal ─── */
function useReveal(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}
function Reveal({ children, delay = 0, y = 22, className, style }) {
  const [ref, visible] = useReveal(0.12);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        ...style,
        transform: visible ? "translateY(0)" : `translateY(${y}px)`,
        opacity: visible ? 1 : 0,
        transition: `transform 0.9s cubic-bezier(0.16,1,0.3,1) ${delay}s, opacity 0.9s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

/* ─── the drifting photo wall behind the hero (real room photos) ─── */
function HeroWall() {
  const cols = useMemo(() => {
    const pick = CASE_GALLERY.slice(0, 21);
    return [0, 1, 2].map((c) => pick.filter((_, i) => i % 3 === c));
  }, []);
  return (
    <div className="fl-wall" aria-hidden="true">
      <div className="fl-wall-tilt">
        {cols.map((items, c) => (
          <div className={`fl-wall-col fl-wall-col-${c}`} key={c}>
            {[0, 1].map((copy) => (
              <div className="fl-wall-stack" key={copy}>
                {items.map((it, i) => (
                  <div className="fl-wall-card" key={`${copy}-${i}`}>
                    <img src={imgUrl(it.p, 300)} alt="" loading={copy === 0 && i < 2 ? "eager" : "lazy"} decoding="async" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="fl-wall-veil" />
    </div>
  );
}

/* ─── the arc: one series (photos shot in the room) over the six volumes.
   Single hue by magnitude, honest 0-baseline, each value labelled; the
   contributor count rides as an annotation, never a competing axis. ─── */
function ArcChart() {
  const [ref, visible] = useReveal(0.3);
  const max = Math.max(...CASE_TIMELINE.map((t) => t.photos), 1);
  const label = (v) =>
    ({ "02": "Vol.02", "03": "Vol.03", "04": "Vol.04", "05": "Vol.05", "05B": "Vol.05·2", "06": "Vol.06" }[v] || v);
  return (
    <div className={`fl-arc${visible ? " in" : ""}`} ref={ref}>
      <div className="fl-arc-head">
        <span className="fl-arc-y">Photos shot in the room, per walk</span>
      </div>
      <div className="fl-arc-plot" role="img" aria-label="Photos uploaded to the room per walk, rising from 28 to 152.">
        {CASE_TIMELINE.map((t, i) => (
          <div className="fl-arc-col" key={t.vol} style={{ "--d": `${i * 0.09}s` }}>
            <span className="fl-arc-val">{t.photos}</span>
            <div className="fl-arc-bar-track">
              <div className="fl-arc-bar" style={{ height: visible ? `${(t.photos / max) * 100}%` : "0%" }} />
            </div>
            <span className="fl-arc-x">{label(t.vol)}</span>
            <span className="fl-arc-sub">{t.contributors ? `${t.contributors} shot it` : "—"}</span>
          </div>
        ))}
      </div>
      <p className="fl-arc-note">
        The walks stayed intimate — 20 to 40 people each. What grew was the room:
        photographs went from 28 to <strong>152</strong> in six weeks, contributors from 4 to <strong>17</strong>.
      </p>
    </div>
  );
}

/* ─── the room's photos, as drifting film-reels (a taste, not all 334) ───
   No per-photo credit is rendered — privacy — the credits live, blurred, in
   the masthead. Rows drift in alternating directions and fade at the edges. */
function PhotoReels() {
  const rows = useMemo(() => {
    const pick = CASE_GALLERY.slice(0, 33); // a curated stream, not the whole wall
    return [0, 1, 2].map((r) => pick.filter((_, i) => i % 3 === r));
  }, []);
  return (
    <div className="fl-reels" aria-hidden="true">
      {rows.map((row, r) => (
        <div className={`fl-reel fl-reel-${r % 2}`} key={r}>
          <div className="fl-reel-track">
            {[0, 1].map((copy) => (
              <div className="fl-reel-group" key={copy}>
                {row.map((it, i) => (
                  <span className={`fl-reel-ph fl-reel-${it.o}`} key={`${copy}-${i}`}>
                    <img src={imgUrl(it.p, 360, 62)} alt="" loading="lazy" decoding="async" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── the walks, on a real map ───
   Real coordinates for each walk (Vol.02 approximated to Slussentorget — the DB
   row predated coordinate capture). Dark CARTO tiles (no API key); clicking a
   pin — or a chip — surfaces that walk's verified numbers in the side card. */
const WALK_COORDS = {
  "02": [59.3195, 18.0719],   // Slussentorget · Södermalm (approx)
  "03": [59.3153343, 18.0742645], // Björns trädgård
  "04": [59.3207434, 18.0601971], // Monteliusvägen
  "05": [59.3199665, 18.0507276], // Skinnarviksberget
  "05B": [59.3205665, 18.0518276], // Skinnarviksberget (offset so it doesn't stack)
  "06": [59.322683, 18.073109],  // Järntorget · Gamla stan
};
const volLabel = (v) => `Vol. ${v.replace("B", " · 2")}`;

function WalkMap() {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const walks = useMemo(
    () => CASE_TIMELINE.map((t) => ({ ...t, ll: WALK_COORDS[t.vol] })).filter((w) => w.ll),
    [],
  );
  const [active, setActive] = useState(walks.length - 1); // latest walk (Vol.06)

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    // On touch devices, disable map dragging so a vertical swipe scrolls the
    // PAGE instead of panning the map (a full-width map otherwise traps scroll).
    // Pins stay tappable, zoom buttons stay; paired with touch-action:pan-y CSS.
    const touch =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    const map = L.map(elRef.current, {
      scrollWheelZoom: false,
      dragging: !touch,
      tap: true,
      zoomControl: true,
      attributionControl: true,
    });
    mapRef.current = map;
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      subdomains: "abcd",
      maxZoom: 20,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(map);
    markersRef.current = walks.map((w, i) => {
      const icon = L.divIcon({
        className: "fl-pin",
        html: `<span class="fl-pin-dot">${w.vol.replace("B", "·2").replace(/^0/, "")}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const m = L.marker(w.ll, { icon }).addTo(map);
      m.bindTooltip(w.place, { direction: "top", offset: [0, -16], className: "fl-tip" });
      m.on("click", () => setActive(i));
      return m;
    });
    map.fitBounds(L.latLngBounds(walks.map((w) => w.ll)).pad(0.4));
    setTimeout(() => map.invalidateSize(), 60);
    return () => { map.remove(); mapRef.current = null; markersRef.current = []; };
  }, [walks]);

  // reflect the active walk on the pins + recentre gently
  useEffect(() => {
    markersRef.current.forEach((m, i) => {
      const el = m.getElement && m.getElement();
      if (el) el.classList.toggle("is-active", i === active);
    });
    const map = mapRef.current;
    if (map && walks[active]) map.panTo(walks[active].ll, { animate: true, duration: 0.5 });
  }, [active, walks]);

  const w = walks[active];

  return (
    <div className="fl-map-grid">
      <div className="fl-map" ref={elRef} />
      <aside className="fl-map-card">
        <div className="fl-map-card-top">
          <span className="fl-map-vol">{volLabel(w.vol)}</span>
          <span className="fl-map-date">
            {new Date(w.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </span>
        </div>
        <p className="fl-map-place">{w.place}</p>
        <div className="fl-map-stats">
          <div><b>{w.pulled}</b><span>pulled up</span></div>
          <div><b>{w.photos || "—"}</b><span>photos</span></div>
          <div><b>{w.contributors || "—"}</b><span>shot it</span></div>
        </div>
        {(CASE_WALK_PHOTOS[w.vol] || []).length > 0 ? (
          <div className="fl-map-photos">
            {CASE_WALK_PHOTOS[w.vol].slice(0, 6).map((ph, i) => (
              <span className="fl-map-photo" key={`${w.vol}-${i}`}>
                <img
                  src={imgUrl(ph.p, 150, 60)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { const c = e.currentTarget.parentElement; if (c) c.style.display = "none"; }}
                />
              </span>
            ))}
          </div>
        ) : (
          <p className="fl-map-nophoto">The room wall came a walk later — this one lived in the moment.</p>
        )}
        <div className="fl-map-chips">
          {walks.map((x, i) => (
            <button
              key={x.vol}
              type="button"
              className={`fl-map-chip${i === active ? " on" : ""}`}
              onClick={() => setActive(i)}
            >
              {x.vol.replace("B", "·2")}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}

export default function AdamFlamboStory() {
  const navigate = useNavigate();
  const reduced = useMemo(() => prefersReduced(), []);

  useEffect(() => {
    initTracking();
    trackPageView("story_adam_flambo");
    window.scrollTo(0, 0);
  }, []);

  const S = CASE_STATS;

  return (
    <div className="fl-root">
      <style>{STYLES}</style>

      {/* top bar */}
      <header className="fl-nav">
        <button type="button" className="fl-nav-back" onClick={() => navigate("/")}>
          <ArrowLeft size={16} /> PullUp
        </button>
        <span className="fl-nav-tag">A creator story</span>
        <button type="button" className="fl-nav-cta" onClick={() => navigate("/start")}>
          Start your room
        </button>
      </header>

      {/* ─── HERO ─── */}
      <section className="fl-hero">
        {!reduced && <HeroWall />}
        <div className="fl-grain" aria-hidden="true" />
        <div className="fl-hero-in fl-hero-split">
          <div className="fl-hero-copy">
            <Reveal delay={0.05}><p className="fl-kicker">Stockholm Photo Walks · @adam_flambo</p></Reveal>
            <Reveal delay={0.12}>
              <h1 className="fl-hero-h">
                A following became a community.<br /><span className="fl-ink-pink">He gave it back in print.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="fl-hero-sub">
                Adam Flambo took people who followed him online out into real life — six
                photo walks across Stockholm. Then he gave the community back to itself:
                a printed journal of their own photographs, every name credited.
              </p>
            </Reveal>
          </div>
          <Reveal delay={0.16} y={16} className="fl-hero-portrait">
            <img src="/stories/adam-hero.jpg" alt="Adam Flambo shooting on a Stockholm photo walk" loading="eager" decoding="async" />
            <span className="fl-hero-portrait-cap">Adam, mid-walk · Stockholm</span>
          </Reveal>
        </div>
        <div className="fl-hero-strip">
          {[
            [S.walks, "walks"],
            [S.community, "in the community"],
            [S.photos, "photos in the room"],
            [S.contributors, "photographers"],
            [1, "printed journal"],
          ].map(([n, l], i) => (
            <Reveal key={l} delay={0.28 + i * 0.05} y={10} className="fl-stat">
              <b>{n}</b><span>{l}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── THE MAP — six real walks, one glance ─── */}
      <section className="fl-mapsec">
        <div className="fl-mapsec-head">
          <Reveal><p className="fl-eyebrow">Six real walks · Stockholm</p></Reveal>
          <Reveal delay={0.06}>
            <h2 className="fl-h2">This actually happened.<br /><span className="fl-ink-pink">On these streets.</span></h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="fl-lede fl-lede-center">
              Real places, real dates, real turnouts. Tap a pin to see how each walk went.
            </p>
          </Reveal>
        </div>
        {/* not wrapped in Reveal — a CSS transform on an ancestor breaks Leaflet's tile positioning */}
        <WalkMap />
      </section>

      {/* ─── WHO ─── */}
      <section className="fl-who">
        <Reveal><p className="fl-eyebrow">Who</p></Reveal>
        <Reveal delay={0.06}>
          <p className="fl-lede">
            <strong>Adam Flambo</strong> is a photographer and community-builder in
            Stockholm. His flagship is <strong>Stockholm Photo Walks</strong> — ninety
            unhurried minutes through one neighbourhood, a few stops, a short prompt at
            each (<em>“reflections”, “a single silhouette”</em>), landing at a café for
            fika. Small, intentional, no-workshop. Introvert-friendly by design.
          </p>
        </Reveal>
        <Reveal delay={0.12}>
          <blockquote className="fl-quote">
            “I wouldn’t be here this smooth without PullUp.”
            <cite className="fl-quote-cite">
              Adam Flambo
              <a className="fl-ig-link" href="https://instagram.com/adam_flambo" target="_blank" rel="noreferrer">@adam_flambo</a>
            </cite>
          </blockquote>
        </Reveal>
      </section>

      {/* ─── THE ARC ─── */}
      <section className="fl-section">
        <Reveal><p className="fl-eyebrow">The arc · six weeks</p></Reveal>
        <Reveal delay={0.06}>
          <h2 className="fl-h2">The walk stayed small.<br /><span className="fl-ink-pink">The room caught fire.</span></h2>
        </Reveal>
        <Reveal delay={0.12} y={30}><ArcChart /></Reveal>
      </section>

      {/* ─── EYES BREAK — the story takes a breath ─── */}
      <section className="fl-eyes">
        <div className="fl-grain" aria-hidden="true" />
        <PullupEyes variant="big" className="fl-eyes-svg" />
        <Reveal delay={0.1}>
          <p className="fl-eyes-line">Then the room made something.</p>
        </Reveal>
      </section>

      {/* ─── THE GALLERY ─── */}
      <section className="fl-galwrap">
        <div className="fl-galhead">
          <Reveal><p className="fl-eyebrow">The room</p></Reveal>
          <Reveal delay={0.06}>
            <h2 className="fl-h2">{S.photos} photographs.<br /><span className="fl-ink-pink">Every one has a name.</span></h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="fl-lede fl-lede-center">
              Not a shared drive that dies on Monday. A private room for the people who
              pulled up, where they post their own work — credited, and theirs.
              A glimpse, drifting by.
            </p>
          </Reveal>
        </div>
        <PhotoReels />
      </section>

      {/* ─── THE MAGAZINE ─── */}
      <section className="fl-mag">
        <div className="fl-grain" aria-hidden="true" />
        <div className="fl-mag-in">
          <Reveal><p className="fl-eyebrow">Giving it back</p></Reveal>
          <Reveal delay={0.06}>
            <h2 className="fl-h2">He didn’t keep the community.<br /><span className="fl-ink-pink">He gave it back — in print.</span></h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="fl-lede fl-lede-center">
              Adam turned the room into a printed journal and handed it back to the people
              who made it — their photographs, their names, their book. Because every image
              arrived with its photographer and their consent, there was no rights chase,
              no “who shot this?”. The community was already on the page.
            </p>
          </Reveal>
          <Reveal delay={0.16} y={16}>
            <p className="fl-mag-credit-label">
              The contributors — {S.contributors} photographers, straight from the room
              <span className="fl-mag-credit-note">names blurred for privacy</span>
            </p>
          </Reveal>
          <div className="fl-masthead" aria-label={`${S.contributors} contributors, names hidden for privacy`}>
            {CASE_CONTRIBUTORS.map((c, i) => (
              <Reveal key={i} delay={Math.min(i * 0.02, 0.5)} y={10} className="fl-mast-name">
                <span className="fl-mast-blur">{c.name}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY IT WORKED — the platform, and what a room can sell ─── */}
      <section className="fl-why">
        <Reveal><p className="fl-eyebrow">Why it worked</p></Reveal>
        <Reveal delay={0.06}>
          <h2 className="fl-h2">The room isn’t a group chat.<br /><span className="fl-ink-pink">It’s where the work — and the money — lives.</span></h2>
        </Reveal>
        <div className="fl-why-grid">
          {[
            { t: "It’s yours", b: `Every name, number and photograph sits in Adam’s own database — ${S.peopleUnique} people, ${S.photos} images, in his name. Not rented from an algorithm.` },
            { t: "Credit is built in", b: "Each upload carries its photographer’s handle and consent. That’s what turned a shared album into a printable, licensable magazine." },
            { t: "You can sell to it", b: "A room is a storefront for the people who actually show up — sell a link, a preset pack, a print run, real merch, or a printed journal. To your people, not to strangers." },
          ].map((c, i) => (
            <Reveal key={c.t} delay={i * 0.08} y={20} className="fl-why-card">
              <span className="fl-why-t">{c.t}</span>
              <span className="fl-why-b">{c.b}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── CTA ─── */}
      <section className="fl-cta">
        <div className="fl-grain" aria-hidden="true" />
        <div className="fl-cta-glow" aria-hidden="true" />
        <PullupEyes variant="big" className="fl-cta-eyes" />
        <Reveal delay={0.06}>
          <h2 className="fl-cta-h">Your room is waiting.<br /><span className="fl-ink-pink">Give it a reason to fill up.</span></h2>
        </Reveal>
        <Reveal delay={0.12}>
          <div className="fl-cta-row">
            <button type="button" className="fl-btn" onClick={() => navigate("/start")}>
              Start hosting <ArrowRight size={17} />
            </button>
            <button type="button" className="fl-btn-ghost" onClick={() => navigate("/")}>
              See how it works
            </button>
          </div>
        </Reveal>
        <Reveal delay={0.18}>
          <p className="fl-cta-fine">A snapshot of adam flambo’s real rooms, as of July 2026. His numbers, his photos, his people.</p>
        </Reveal>
      </section>

      <footer className="fl-footer">
        <span>PullUp &copy; {new Date().getFullYear()}</span>
        <span className="fl-dot">·</span>
        <a href="/">Home</a>
        <a href="mailto:hello@pullup.se">hello@pullup.se</a>
      </footer>
    </div>
  );
}

const STYLES = `
  .fl-root {
    --pink: ${PINK};
    background: ${NIGHT}; color: #fff;
    min-height: 100dvh; position: relative; overflow-x: clip;
    -webkit-font-smoothing: antialiased;
    cursor: url('/cursor-finger.png') 11 2, auto;
  }
  .fl-root *:not(input):not(textarea):not(select) { cursor: inherit; }
  .fl-ink-pink { color: var(--pink); }

  /* filmic grain, reused on the dark acts */
  .fl-grain {
    position: absolute; inset: 0; z-index: 1; pointer-events: none;
    opacity: 0.4; mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 160px 160px;
  }

  /* ─── nav ─── */
  .fl-nav {
    position: sticky; top: 0; z-index: 40;
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px clamp(16px, 4vw, 40px);
    background: rgba(8,8,14,0.6); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .fl-nav-back, .fl-nav-cta {
    display: inline-flex; align-items: center; gap: 7px;
    font: inherit; font-size: 14px; font-weight: 600; border: 0;
  }
  .fl-nav-back { background: none; color: rgba(255,255,255,0.7); padding: 6px; }
  .fl-nav-back:hover { color: #fff; }
  .fl-nav-tag { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(255,255,255,0.4); }
  @media (max-width: 560px) { .fl-nav-tag { display: none; } }
  .fl-nav-cta {
    padding: 9px 18px; border-radius: 999px; background: var(--pink); color: #fff;
    box-shadow: 0 6px 20px -8px rgba(236,23,143,0.7);
    transition: transform 0.18s;
  }
  .fl-nav-cta:hover { transform: translateY(-1px); }

  /* ─── hero ─── */
  .fl-hero {
    position: relative; isolation: isolate; overflow: hidden;
    min-height: 92vh; display: flex; flex-direction: column; justify-content: center;
    padding: clamp(60px, 12vh, 120px) clamp(22px, 6vw, 56px) clamp(30px, 5vh, 60px);
  }
  .fl-hero-in { position: relative; z-index: 3; max-width: 960px; margin: 0 auto; text-align: center; }
  .fl-kicker { margin: 0 0 20px; font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase; color: rgba(255,255,255,0.5); font-weight: 600; }
  .fl-hero-h {
    margin: 0 auto; max-width: 14ch;
    font-size: clamp(36px, 6vw, 72px); font-weight: 850; letter-spacing: -0.04em; line-height: 1.03;
    text-shadow: 0 2px 40px rgba(0,0,0,0.5);
  }
  .fl-hero-sub {
    margin: 22px auto 0; max-width: 52ch; font-size: clamp(16px, 2vw, 20px); line-height: 1.6;
    color: rgba(255,255,255,0.66);
  }
  .fl-hero-strip {
    position: relative; z-index: 3; margin: clamp(40px, 7vh, 72px) auto 0;
    display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(20px, 5vw, 60px);
  }
  .fl-stat { display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .fl-stat b { font-size: clamp(28px, 4vw, 44px); font-weight: 850; letter-spacing: -0.03em; }
  .fl-stat span { font-size: 12px; letter-spacing: 0.05em; color: rgba(255,255,255,0.5); text-transform: uppercase; }

  /* ─── split editorial hero: copy beside a framed portrait of Adam.
     The printed-journal story earns a magazine cover, not centered text. ─── */
  .fl-hero-split {
    max-width: 1120px; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.82fr);
    align-items: center; gap: clamp(28px, 5vw, 72px); text-align: left;
  }
  .fl-hero-split .fl-hero-h { margin: 0; max-width: 15ch; }
  .fl-hero-split .fl-hero-sub { margin-top: 22px; margin-left: 0; max-width: 46ch; }
  .fl-hero-portrait {
    position: relative; justify-self: end; width: 100%; max-width: 400px;
    aspect-ratio: 2 / 3; border-radius: 18px; overflow: hidden;
    background: #14141c; border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 40px 90px -30px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.4);
  }
  .fl-hero-portrait img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; }
  .fl-hero-portrait-cap {
    position: absolute; left: 14px; bottom: 12px; z-index: 2;
    font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; font-weight: 600;
    color: rgba(255,255,255,0.92); text-shadow: 0 1px 12px rgba(0,0,0,0.9);
  }
  .fl-hero-portrait::after {
    content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
    background: linear-gradient(180deg, rgba(0,0,0,0) 55%, rgba(8,8,14,0.6) 100%);
  }
  @media (max-width: 860px) {
    .fl-hero-split { grid-template-columns: 1fr; gap: clamp(28px, 6vh, 44px); justify-items: center; text-align: center; }
    .fl-hero-split .fl-hero-h, .fl-hero-split .fl-hero-sub { margin-left: auto; margin-right: auto; }
    .fl-hero-portrait { justify-self: center; order: -1; max-width: min(300px, 74vw); }
  }

  /* hero photo wall */
  .fl-wall { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
  .fl-wall-tilt { position: absolute; inset: -20% -12%; display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(14px, 1.8vw, 24px); transform: rotate(-7deg); }
  .fl-wall-col { display: flex; flex-direction: column; gap: clamp(14px, 1.8vw, 24px); animation: fl-drift 80s linear infinite; will-change: transform; }
  .fl-wall-col-0 { animation-duration: 92s; animation-direction: reverse; }
  .fl-wall-col-1 { animation-duration: 100s; margin-top: clamp(60px, 12vh, 140px); }
  .fl-wall-col-2 { animation-duration: 108s; margin-top: -50px; }
  @keyframes fl-drift { to { transform: translateY(-50%); } }
  .fl-wall-stack { display: flex; flex-direction: column; gap: clamp(14px, 1.8vw, 24px); flex: none; }
  .fl-wall-card { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 4 / 3; background: #14141c; box-shadow: 0 20px 50px -22px rgba(0,0,0,0.7); }
  .fl-wall-card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .fl-wall-veil {
    position: absolute; inset: 0; z-index: 1;
    /* strong, even scrim so the photos read as faint texture and the copy
       stays crisp — legibility over spectacle */
    background:
      radial-gradient(72% 62% at 50% 42%, rgba(8,8,14,0.72) 0%, rgba(8,8,14,0.9) 58%, rgba(8,8,14,0.98) 100%),
      linear-gradient(180deg, rgba(8,8,14,0.92) 0%, rgba(8,8,14,0.6) 24%, rgba(8,8,14,0.72) 72%, ${NIGHT} 97%);
  }

  /* ─── shared editorial bits ─── */
  .fl-eyebrow { margin: 0 0 16px; font-size: 12px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--pink); font-weight: 700; }
  .fl-h2 { margin: 0; font-size: clamp(28px, 4.6vw, 52px); font-weight: 850; letter-spacing: -0.035em; line-height: 1.04; }
  .fl-lede { margin: 0; font-size: clamp(17px, 2.1vw, 21px); line-height: 1.62; color: rgba(255,255,255,0.72); }
  .fl-lede strong { color: #fff; font-weight: 700; }
  .fl-lede em { font-style: italic; color: rgba(255,255,255,0.85); }
  .fl-lede-center { max-width: 60ch; margin-left: auto; margin-right: auto; text-align: center; }
  .fl-section { max-width: 1080px; margin: 0 auto; padding: clamp(70px, 12vh, 140px) clamp(22px, 6vw, 48px); text-align: center; }

  /* who */
  .fl-who { max-width: 780px; margin: 0 auto; padding: clamp(70px, 12vh, 140px) clamp(22px, 6vw, 48px); text-align: center; }
  .fl-who .fl-lede { margin-top: 4px; }
  .fl-quote {
    margin: clamp(36px, 6vh, 60px) 0 0; padding: 0;
    font-size: clamp(24px, 3.6vw, 38px); font-weight: 800; letter-spacing: -0.025em; line-height: 1.2; color: #fff;
  }
  .fl-quote cite { display: block; margin-top: 16px; font-style: normal; font-size: 14px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pink); }
  .fl-quote-cite { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .fl-ig-link {
    display: inline-flex; align-items: center; letter-spacing: 0.01em; text-transform: none;
    padding: 7px 15px; border-radius: 999px;
    background: rgba(236,23,143,0.12); border: 1px solid rgba(236,23,143,0.4);
    color: #fff; font-size: 14px; font-weight: 700; text-decoration: none;
    transition: background 0.18s, transform 0.18s, box-shadow 0.18s;
  }
  .fl-ig-link:hover { background: rgba(236,23,143,0.24); transform: translateY(-1px); box-shadow: 0 8px 24px -10px rgba(236,23,143,0.7); }

  /* ─── the arc chart ─── */
  .fl-arc { max-width: 760px; margin: clamp(40px, 6vh, 64px) auto 0; }
  .fl-arc-head { display: flex; justify-content: flex-start; margin-bottom: 14px; }
  .fl-arc-y { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.42); font-weight: 600; }
  .fl-arc-plot {
    display: grid; grid-template-columns: repeat(6, 1fr); gap: clamp(8px, 1.6vw, 20px);
    align-items: end; height: 260px;
    border-bottom: 1px solid rgba(255,255,255,0.12);
    padding-bottom: 0;
  }
  .fl-arc-col { display: flex; flex-direction: column; align-items: center; height: 100%; justify-content: flex-end; gap: 8px; }
  .fl-arc-val { font-size: clamp(13px, 1.6vw, 16px); font-weight: 800; color: #fff; font-variant-numeric: tabular-nums; }
  .fl-arc-bar-track { flex: 1; width: clamp(20px, 4vw, 46px); display: flex; align-items: flex-end; }
  .fl-arc-bar {
    width: 100%; border-radius: 5px 5px 0 0; min-height: 3px;
    background: linear-gradient(180deg, #ff6cc4, var(--pink));
    box-shadow: 0 0 24px -6px rgba(236,23,143,0.5);
    transition: height 1s cubic-bezier(0.16,1,0.3,1) var(--d);
  }
  .fl-arc-x { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.7); }
  .fl-arc-sub { font-size: 10.5px; color: rgba(255,255,255,0.4); }
  .fl-arc-note { margin: 26px auto 0; max-width: 54ch; font-size: 15px; line-height: 1.6; color: rgba(255,255,255,0.6); text-align: center; }
  .fl-arc-note strong { color: var(--pink); font-weight: 800; }

  @media (max-width: 720px) { .fl-arc-plot { height: 200px; } }

  /* ─── the walks map (real Leaflet + dark CARTO tiles) ─── */
  .fl-mapsec { max-width: 1160px; margin: 0 auto; padding: clamp(56px, 9vh, 110px) clamp(22px, 6vw, 48px); }
  .fl-mapsec-head { text-align: center; max-width: 720px; margin: 0 auto clamp(30px, 5vh, 48px); }
  .fl-map-grid { display: grid; grid-template-columns: minmax(0, 1fr) 306px; gap: 18px; align-items: start; }
  .fl-map {
    height: clamp(370px, 56vh, 560px); border-radius: 22px; overflow: hidden;
    border: 1px solid rgba(255,255,255,0.1); background: #0c0c12;
    box-shadow: 0 44px 100px -54px rgba(0,0,0,0.85);
  }
  @media (max-width: 820px) { .fl-map-grid { grid-template-columns: 1fr; } .fl-map { height: clamp(300px, 46vh, 420px); } }
  /* touch: dragging is disabled in JS — let vertical swipes scroll the page */
  @media (pointer: coarse) { .fl-map .leaflet-container { touch-action: pan-y !important; } }
  /* leaflet dark chrome */
  .fl-map .leaflet-container { background: #0c0c12; font: inherit; }
  .fl-map .leaflet-control-zoom a { background: rgba(20,20,28,0.92); color: #fff; border-color: rgba(255,255,255,0.12); }
  .fl-map .leaflet-control-zoom a:hover { background: rgba(42,42,54,0.95); }
  .fl-map .leaflet-control-attribution { background: rgba(8,8,14,0.7); color: rgba(255,255,255,0.4); }
  .fl-map .leaflet-control-attribution a { color: rgba(255,255,255,0.55); }
  /* pins */
  .fl-pin { background: none; border: 0; }
  .fl-pin-dot {
    display: flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: 999px;
    background: ${PINK}; color: #fff; font-size: 12px; font-weight: 800;
    border: 2px solid #fff; box-shadow: 0 4px 14px rgba(236,23,143,0.6);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .fl-pin.is-active .fl-pin-dot { transform: scale(1.3); box-shadow: 0 0 0 6px rgba(236,23,143,0.25), 0 6px 18px rgba(236,23,143,0.85); }
  .fl-tip {
    background: #141420 !important; color: #fff !important;
    border: 1px solid rgba(255,255,255,0.14) !important; border-radius: 8px !important;
    font-size: 12px !important; font-weight: 600 !important; padding: 5px 9px !important;
    box-shadow: 0 10px 24px -12px rgba(0,0,0,0.8) !important;
  }
  .fl-tip.leaflet-tooltip-top::before { border-top-color: #141420 !important; }
  /* the side card */
  .fl-map-card {
    display: flex; flex-direction: column; gap: 14px;
    padding: 22px; border-radius: 20px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
  }
  .fl-map-card-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .fl-map-vol { font-size: 19px; font-weight: 850; letter-spacing: -0.02em; }
  .fl-map-date { font-size: 12.5px; color: rgba(255,255,255,0.5); }
  .fl-map-place { margin: -6px 0 0; font-size: 14px; color: rgba(255,255,255,0.7); }
  .fl-map-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .fl-map-stats div { display: flex; flex-direction: column; gap: 2px; padding: 12px 6px; border-radius: 12px; background: rgba(255,255,255,0.045); text-align: center; }
  .fl-map-stats b { font-size: clamp(20px, 2.4vw, 24px); font-weight: 850; letter-spacing: -0.02em; color: #fff; }
  .fl-map-stats span { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: rgba(255,255,255,0.45); }
  .fl-map-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .fl-map-photo { aspect-ratio: 1; border-radius: 10px; overflow: hidden; background: #14141c; }
  .fl-map-photo img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s cubic-bezier(0.16,1,0.3,1); }
  .fl-map-photo:hover img { transform: scale(1.06); }
  .fl-map-nophoto { margin: 0; font-size: 13px; line-height: 1.5; color: rgba(255,255,255,0.4); font-style: italic; }
  .fl-map-chips { display: flex; flex-wrap: wrap; gap: 7px; margin-top: auto; }
  .fl-map-chip { padding: 7px 13px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: none; color: rgba(255,255,255,0.6); font: inherit; font-size: 12.5px; font-weight: 700; transition: color 0.2s, background 0.2s, border-color 0.2s; }
  .fl-map-chip:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
  .fl-map-chip.on { background: ${PINK}; border-color: ${PINK}; color: #fff; }

  /* ─── eyes break ─── */
  .fl-eyes {
    position: relative; isolation: isolate; overflow: hidden;
    min-height: 78vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px;
    padding: clamp(60px, 10vh, 120px) 22px;
    background: radial-gradient(60% 60% at 50% 45%, rgba(236,23,143,0.08), transparent 62%), ${NIGHT};
  }
  .fl-eyes-svg { position: relative; z-index: 2; width: clamp(180px, 34vmin, 360px); height: auto; filter: brightness(0) invert(1); }
  .fl-eyes-svg svg { width: 100%; height: 100%; display: block; }
  .fl-eyes-line { position: relative; z-index: 2; margin: 8px 0 0; font-size: clamp(20px, 3vw, 30px); font-weight: 800; letter-spacing: -0.02em; color: rgba(255,255,255,0.9); text-align: center; }

  /* ─── photo reels (drifting rows, edge-faded — a taste, not the whole wall) ─── */
  .fl-galwrap { padding: clamp(60px, 10vh, 120px) 0 clamp(50px, 8vh, 100px); overflow: hidden; }
  .fl-galhead { max-width: 780px; margin: 0 auto clamp(40px, 6vh, 64px); text-align: center; padding: 0 clamp(22px, 6vw, 48px); }
  .fl-reels { display: flex; flex-direction: column; gap: clamp(10px, 1.4vw, 16px); }
  .fl-reel {
    overflow: hidden;
    -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
            mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent);
  }
  .fl-reel-track { display: flex; width: max-content; animation: fl-reel 60s linear infinite; will-change: transform; }
  .fl-reel-1 .fl-reel-track { animation-direction: reverse; animation-duration: 74s; }
  .fl-reel:hover .fl-reel-track { animation-play-state: paused; }
  @keyframes fl-reel { to { transform: translateX(-50%); } }
  .fl-reel-group { display: flex; flex: none; }
  .fl-reel-ph {
    flex: none; height: clamp(150px, 21vw, 224px);
    margin-right: clamp(10px, 1.4vw, 16px); border-radius: 12px; overflow: hidden;
    background: #14141c; box-shadow: 0 14px 34px -22px rgba(0,0,0,0.8);
  }
  .fl-reel-ph img { height: 100%; width: auto; display: block; object-fit: cover; }

  /* ─── magazine ─── */
  .fl-mag {
    position: relative; isolation: isolate; overflow: hidden;
    padding: clamp(70px, 12vh, 150px) clamp(22px, 6vw, 48px);
    background: linear-gradient(180deg, #0c0c14, #08080e);
    border-top: 1px solid rgba(255,255,255,0.06);
  }
  .fl-mag-in { position: relative; z-index: 2; max-width: 880px; margin: 0 auto; text-align: center; }
  .fl-mag-credit-label {
    margin: clamp(40px, 6vh, 60px) 0 24px;
    font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.42); font-weight: 600;
  }
  .fl-mag-credit-note { display: block; margin-top: 7px; font-size: 10.5px; letter-spacing: 0.02em; text-transform: none; font-style: italic; color: rgba(255,255,255,0.32); }
  .fl-masthead {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 24px;
  }
  .fl-mast-name {
    font-size: clamp(15px, 1.9vw, 19px); font-weight: 750; letter-spacing: -0.01em; color: #fff;
  }
  /* GDPR: the underlying strings are already masked at build time (first name +
     dots, no handles); this blur is the visual layer so they read as real,
     protected credits. */
  .fl-mast-blur { filter: blur(4.5px); opacity: 0.82; user-select: none; -webkit-user-select: none; }

  /* ─── why ─── */
  .fl-why { max-width: 1080px; margin: 0 auto; padding: clamp(70px, 12vh, 140px) clamp(22px, 6vw, 48px); text-align: center; }
  .fl-why-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: clamp(40px, 6vh, 60px); text-align: left; }
  .fl-why-card {
    display: flex; flex-direction: column; gap: 10px;
    padding: clamp(22px, 2.6vw, 30px); border-radius: 20px;
    background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
  }
  .fl-why-t { font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
  .fl-why-b { font-size: 14.5px; line-height: 1.6; color: rgba(255,255,255,0.64); }
  @media (max-width: 820px) { .fl-why-grid { grid-template-columns: 1fr; } }

  /* ─── cta ─── */
  .fl-cta {
    position: relative; isolation: isolate; overflow: hidden; text-align: center;
    display: flex; flex-direction: column; align-items: center; gap: 22px;
    padding: clamp(80px, 14vh, 170px) clamp(22px, 6vw, 48px) clamp(60px, 10vh, 110px);
  }
  .fl-cta-glow { position: absolute; inset: 0; z-index: 0; background: radial-gradient(56% 50% at 50% 38%, rgba(236,23,143,0.22), transparent 62%); animation: fl-breathe 7s ease-in-out infinite; }
  @keyframes fl-breathe { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
  .fl-cta > * { position: relative; z-index: 1; }
  .fl-cta-eyes { width: clamp(120px, 20vmin, 190px); height: auto; filter: brightness(0) invert(1); }
  .fl-cta-eyes svg { width: 100%; height: 100%; display: block; }
  .fl-cta-h { margin: 0; font-size: clamp(32px, 5.4vw, 62px); font-weight: 850; letter-spacing: -0.04em; line-height: 1.03; }
  .fl-cta-row { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; }
  .fl-btn {
    display: inline-flex; align-items: center; gap: 9px;
    padding: 16px 30px; border-radius: 999px; border: 0; background: var(--pink); color: #fff;
    font: inherit; font-size: 16px; font-weight: 700;
    box-shadow: 0 12px 34px -8px rgba(236,23,143,0.6); transition: transform 0.2s, box-shadow 0.2s;
  }
  .fl-btn:hover { transform: translateY(-2px); box-shadow: 0 18px 46px -10px rgba(236,23,143,0.75); }
  .fl-btn svg { transition: transform 0.2s; }
  .fl-btn:hover svg { transform: translateX(3px); }
  .fl-btn-ghost {
    padding: 15px 26px; border-radius: 999px; background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.2); color: #fff; font: inherit; font-size: 15px; font-weight: 600;
    transition: background 0.18s, transform 0.18s;
  }
  .fl-btn-ghost:hover { background: rgba(255,255,255,0.12); transform: translateY(-1px); }
  .fl-cta-fine { margin: 6px 0 0; font-size: 12.5px; color: rgba(255,255,255,0.4); max-width: 52ch; }

  /* ─── footer ─── */
  .fl-footer {
    display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap;
    padding: 28px 16px calc(28px + env(safe-area-inset-bottom));
    font-size: 12px; color: rgba(255,255,255,0.45);
    border-top: 1px solid rgba(255,255,255,0.07);
  }
  .fl-footer a { color: inherit; text-decoration: none; }
  .fl-footer a:hover { color: #fff; }
  .fl-dot { opacity: 0.4; }

  @media (prefers-reduced-motion: reduce) {
    .fl-wall-col, .fl-cta-glow, .fl-arc-bar, .fl-reel-track { animation: none !important; transition: none !important; }
  }
`;
