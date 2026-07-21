import { useEffect, useRef, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft } from "lucide-react";
import { PullupEyes } from "../../components/PullupEyes.jsx";
import { transformedImageUrl } from "../../lib/imageUtils.js";
import { trackPageView, initTracking } from "../../lib/track.js";
import { CASE_STATS, CASE_TIMELINE, CASE_CONTRIBUTORS, CASE_GALLERY } from "./adamFlamboData.js";

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

/* ─── the credited photo wall (masonry) ─── */
function Gallery() {
  return (
    <div className="fl-gallery">
      {CASE_GALLERY.map((it, i) => (
        <figure className={`fl-gcell fl-g-${it.o}`} key={i}>
          <img src={imgUrl(it.p, it.o === "p" ? 300 : 400, 64)} alt={`Photograph by @${it.ig}`} loading="lazy" decoding="async" />
          {it.ig && <figcaption>@{it.ig}</figcaption>}
        </figure>
      ))}
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
        <div className="fl-hero-in">
          <Reveal delay={0.05}><p className="fl-kicker">Stockholm Photo Walks · @adam_flambo</p></Reveal>
          <Reveal delay={0.12}>
            <h1 className="fl-hero-h">
              How a Stockholm photo walk<br />became a <span className="fl-ink-pink">printed magazine.</span>
            </h1>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="fl-hero-sub">
              Adam Flambo started with a handful of people and a camera. Two months on
              PullUp later, his room had shot 334 photographs — and every one of them
              had a name.
            </p>
          </Reveal>
        </div>
        <div className="fl-hero-strip">
          {[
            [S.walks, "walks"],
            [S.community, "in the community"],
            [S.photos, "photos in the room"],
            [S.contributors, "photographers"],
            [1, "printed magazine"],
          ].map(([n, l], i) => (
            <Reveal key={l} delay={0.28 + i * 0.05} y={10} className="fl-stat">
              <b>{n}</b><span>{l}</span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ─── WHO ─── */}
      <section className="fl-who">
        <Reveal><p className="fl-eyebrow">Who</p></Reveal>
        <Reveal delay={0.06}>
          <p className="fl-lede">
            Adam runs <strong>Flambo</strong>, a creative practice in Stockholm. The
            flagship is <strong>Stockholm Photo Walks</strong> — ninety unhurried
            minutes through one neighbourhood, a few stops, a short prompt at each
            (<em>“reflections”, “a single silhouette”</em>), landing at a café for fika.
            Small, intentional, no-workshop. Introvert-friendly by design.
          </p>
        </Reveal>
        <Reveal delay={0.12}>
          <blockquote className="fl-quote">
            “I wouldn’t be here this smooth without PullUp.”
            <cite>Adam Flambo</cite>
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
        <div className="fl-vols">
          {CASE_TIMELINE.map((t, i) => (
            <Reveal key={t.vol} delay={i * 0.05} y={16} className="fl-vol">
              <span className="fl-vol-n">Vol. {t.vol.replace("B", " · 2")}</span>
              <span className="fl-vol-place">{t.place}</span>
              <span className="fl-vol-meta">
                <b>{t.pulled}</b> pulled up{t.photos ? <> · <b>{t.photos}</b> photos</> : null}
              </span>
            </Reveal>
          ))}
        </div>
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
              Here’s a sliver of it.
            </p>
          </Reveal>
        </div>
        <Gallery />
      </section>

      {/* ─── THE MAGAZINE ─── */}
      <section className="fl-mag">
        <div className="fl-grain" aria-hidden="true" />
        <div className="fl-mag-in">
          <Reveal><p className="fl-eyebrow">The payoff</p></Reveal>
          <Reveal delay={0.06}>
            <h2 className="fl-h2">Every photo had a name.<br /><span className="fl-ink-pink">So Adam printed them.</span></h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="fl-lede fl-lede-center">
              Because each photograph in the room arrived with its photographer’s handle
              and their consent to use it, Adam could go from a shared album to an actual
              paper magazine — with the community as the credited contributors. No rights
              chase, no “who shot this?”. The room already knew.
            </p>
          </Reveal>
          <Reveal delay={0.16} y={16}>
            <p className="fl-mag-credit-label">The contributors — {S.contributors} photographers, straight from the room</p>
          </Reveal>
          <div className="fl-masthead">
            {CASE_CONTRIBUTORS.map((c, i) => (
              <Reveal key={c.name + i} delay={Math.min(i * 0.02, 0.5)} y={10} className="fl-mast-name">
                {c.name}{c.ig ? <span className="fl-mast-ig">@{c.ig}</span> : null}
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
            { t: "You can sell to it", b: "A room is a storefront for the people who actually show up — sell a link, a preset pack, a print run, real merch, or a magazine. To your people, not to strangers." },
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
    margin: 0; font-size: clamp(34px, 6.4vw, 78px); font-weight: 850; letter-spacing: -0.04em; line-height: 1.02;
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
    background:
      radial-gradient(58% 56% at 50% 46%, rgba(8,8,14,0.5) 20%, rgba(8,8,14,0.82) 62%, rgba(8,8,14,0.96) 100%),
      linear-gradient(180deg, rgba(8,8,14,0.8) 0%, rgba(8,8,14,0.4) 20%, rgba(8,8,14,0.6) 74%, ${NIGHT} 96%);
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

  /* volume chips */
  .fl-vols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: clamp(40px, 6vh, 64px); }
  .fl-vol {
    display: flex; flex-direction: column; gap: 4px; text-align: left;
    padding: 18px 20px; border-radius: 16px;
    background: rgba(255,255,255,0.035); border: 1px solid rgba(255,255,255,0.08);
  }
  .fl-vol-n { font-size: 14px; font-weight: 800; letter-spacing: -0.01em; }
  .fl-vol-place { font-size: 12.5px; color: rgba(255,255,255,0.5); }
  .fl-vol-meta { font-size: 13px; color: rgba(255,255,255,0.62); margin-top: 4px; }
  .fl-vol-meta b { color: #fff; font-weight: 800; }
  @media (max-width: 720px) { .fl-vols { grid-template-columns: 1fr; } .fl-arc-plot { height: 200px; } }

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

  /* ─── gallery ─── */
  .fl-galwrap { padding: clamp(60px, 10vh, 120px) clamp(14px, 4vw, 40px) clamp(40px, 7vh, 90px); }
  .fl-galhead { max-width: 780px; margin: 0 auto clamp(40px, 6vh, 64px); text-align: center; }
  .fl-gallery {
    columns: 4; column-gap: 10px; max-width: 1400px; margin: 0 auto;
  }
  @media (max-width: 1100px) { .fl-gallery { columns: 3; } }
  @media (max-width: 720px) { .fl-gallery { columns: 2; } }
  .fl-gcell {
    position: relative; break-inside: avoid; margin: 0 0 10px; border-radius: 12px; overflow: hidden;
    background: #14141c; box-shadow: 0 14px 34px -20px rgba(0,0,0,0.8);
  }
  .fl-gcell img { display: block; width: 100%; height: auto; }
  .fl-gcell figcaption {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 22px 12px 9px; font-size: 11.5px; font-weight: 600; color: #fff;
    background: linear-gradient(180deg, transparent, rgba(0,0,0,0.72));
    opacity: 0; transform: translateY(6px); transition: opacity 0.25s, transform 0.25s;
  }
  .fl-gcell:hover figcaption { opacity: 1; transform: none; }

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
  .fl-masthead {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 26px;
  }
  .fl-mast-name {
    display: inline-flex; align-items: baseline; gap: 7px;
    font-size: clamp(15px, 1.9vw, 19px); font-weight: 750; letter-spacing: -0.01em; color: #fff;
  }
  .fl-mast-ig { font-size: 12px; font-weight: 500; color: var(--pink); }

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
    .fl-wall-col, .fl-cta-glow, .fl-arc-bar { animation: none !important; transition: none !important; }
  }
`;
