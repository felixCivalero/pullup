import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { initTracking, trackPageView } from "../lib/track.js";
import { trackEvent } from "../lib/analytics.js";
import { AgencyShell } from "../components/agency/AgencyShell.jsx";
import { AgencyOffer } from "../components/agency/AgencyOffer.jsx";
import { DeckTeaser } from "../components/agency/DeckTeaser.jsx";
import { Reveal } from "../components/agency/Reveal.jsx";
import { EngineChart } from "../components/agency/EngineChart.jsx";
import { Toolkit } from "../components/agency/Toolkit.jsx";
import { COVERS, SERIES, casePath } from "../components/agency/agencyData.js";
import { StoryChart } from "../components/agency/StoryChart.jsx";
import { StoryMark } from "../components/agency/CaseNav.jsx";
import { openRequest } from "../components/agency/request.js";
import { useT } from "../components/agency/i18n.js";
import { LANDING_CSS, LogoBand, SectionLabel } from "./LandingPage.jsx";
import { CORE_CSS, Clip, Spike } from "./CorePage.jsx";

/* /mix — the third option: the sales path of / (who it's for, proof, how,
   toolkit, one offer, booklet) with the /core story told between its
   chapters. Story scenes are unnumbered interludes on black; the sales
   chapters keep their numbers and grounds. Same ids as / so the nav works. */

// Counts every number in a string up from zero the first time it's seen:
// "28.1M" → 0.0M…28.1M, "10,000+" → 0…10,000+. Words stay as they are.
function CountUp({ text }) {
  const ref = useRef(null);
  const [k, setK] = useState(() =>
    typeof IntersectionObserver === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 0,
  );
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = null;
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      const t0 = performance.now();
      const tick = (now) => {
        const x = Math.min(1, (now - t0) / 1400);
        setK(1 - (1 - x) ** 3);
        if (x < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => { obs.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const out = text.replace(/\d[\d,]*(\.\d+)?/g, (m) => {
    const dec = (m.split(".")[1] || "").length;
    const v = Number(m.replace(/,/g, "")) * k;
    return m.includes(",") ? Math.round(v).toLocaleString("en-US") : v.toFixed(dec);
  });
  return <span ref={ref} aria-label={text}>{out}</span>;
}

// The people first: a row of faces, each one a door to their story below.
function People() {
  const t = useT();
  return (
    <ul className="mx-people">
      {SERIES.map((c, i) => (
        <li key={c.slug} style={{ "--sc": c.color, "--i": i }}>
          <button
            type="button"
            onClick={() => {
              trackEvent("cta_click", { location: `mix_person_${c.slug}` });
              scrollToId(`story-${c.slug}`);
            }}
          >
            <Reveal delay={0.05 * i}>
              <span className="mx-face"><img src={COVERS[c.slug] || c.image} alt="" loading="lazy" decoding="async" /></span>
              <span className="mx-face-n">{c.name}</span>
              <span className="mx-face-k">{t(c.kicker.split(" · ")[0])}</span>
            </Reveal>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* One story per screen. On wide screens the cards stack as you scroll —
   each one slides up over the last — and each leads with its best number. */
function StoryStack() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="mx-stack">
      {SERIES.map((c, i) => (
        <article key={c.slug} id={`story-${c.slug}`} className="mx-story" style={{ "--sc": c.color, "--i": i }}>
          <div className="mx-story-photo">
            <img src={COVERS[c.slug] || c.image} alt="" loading="lazy" decoding="async" />
          </div>
          <div className="mx-story-body">
            <p className="st-kicker"><StoryMark slug={c.slug} />{t(c.kicker)}</p>
            <h3 className="mx-story-name">{c.name}</h3>
            <p className="mx-story-tog">{t("Together")}</p>
            <p className={`mx-story-big${t(c.score[0]).length > 8 ? " is-long" : ""}`}><CountUp text={t(c.score[0])} /></p>
            <p className="mx-story-big-l">{t(c.score[1])}</p>
            <dl className="mx-story-pb">
              <div><dt>{t("Where they started")}</dt><dd>{t(c.who)}</dd></div>
              <div><dt>{t("What they gained")}</dt><dd>{t(c.gained)}</dd></div>
            </dl>
            <Reveal className="mx-story-chart"><StoryChart chart={c.chart} /></Reveal>
            <a
              className="st-link"
              href={casePath(c.slug)}
              onClick={(e) => {
                e.preventDefault();
                trackEvent("cta_click", { location: `mix_story_${c.slug}` });
                navigate(casePath(c.slug));
              }}
            >
              {t("Read the story")}
              <ArrowRight size={16} strokeWidth={1.75} />
            </a>
          </div>
        </article>
      ))}
    </div>
  );
}

const scrollToId = (id) =>
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

// Scroll progress through the hero: 0 at the top, 1 once it has scrolled
// one screen. The content settles back and fades, the way a keynote cuts.
function useHeroOut() {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = null;
    const run = () => { raf = null; setV(Math.min(1, Math.max(0, window.scrollY / window.innerHeight))); };
    const on = () => { if (raf == null) raf = requestAnimationFrame(run); };
    window.addEventListener("scroll", on, { passive: true });
    run();
    return () => { window.removeEventListener("scroll", on); if (raf != null) cancelAnimationFrame(raf); };
  }, []);
  return v;
}

function Hero() {
  const t = useT();
  const out = useHeroOut();
  return (
    <section className="mx-hero" data-pc-tone="dark" data-pc-section="mix_hero" data-pc-order="1">
      <div className="mx-hero-stick">
        <div className="mx-hero-glow" aria-hidden="true" style={{ opacity: 1 - out * 0.6 }} />
        <div className="mx-hero-in" style={{ transform: `scale(${1 - out * 0.08}) translateY(${-out * 4}vh)`, opacity: 1 - out * 1.15 }}>
          <p className="mx-eyebrow mx-rise" style={{ "--d": "0.1s" }}>{t("For founders, artists and small brands")}</p>
          <h1 className="mx-h1">
            <span className="mx-rise" style={{ "--d": "0.25s" }}>{t("Everyone looks at the clip.")}</span>
            <span className="mx-rise mx-grad" style={{ "--d": "0.55s" }}>{t("We look at the people behind it.")}</span>
          </h1>
          <div className="mx-ctas mx-rise" style={{ "--d": "1.05s" }}>
            <button
              type="button"
              className="mx-pill"
              onClick={() => {
                trackEvent("cta_click", { location: "mix_hero_build" });
                openRequest({ source: "mix_hero" });
              }}
            >
              {t("Build with us")}
            </button>
            <button
              type="button"
              className="mx-link"
              onClick={() => {
                trackEvent("cta_click", { location: "mix_hero_stories" });
                scrollToId("stories");
              }}
            >
              {t("See the stories")} <span aria-hidden="true">›</span>
            </button>
          </div>
          <p className="mx-price mx-rise" style={{ "--d": "1.2s" }}>
            {t("One offer. $3,000 a month. First three months, no commitment.")}
          </p>
        </div>
        <div className="mx-hero-logos mx-rise" style={{ "--d": "1.4s", opacity: 1 - out * 1.5 }}>
          <LogoBand />
        </div>
      </div>
    </section>
  );
}

export default function MixPage() {
  const t = useT();
  useEffect(() => {
    initTracking();
    trackPageView("mix");
  }, []);

  return (
    <AgencyShell css={LANDING_CSS + CORE_CSS + MIX_CSS} home>
      <Hero />

      {/* the story, part one: what everyone sees → what's behind it */}
      <div className="fx" data-pc-tone="dark">
        <Clip label="" highlight />
      </div>

      {/* proof */}
      <section id="stories" className="pc-section ch-1" data-pc-section="stories" data-pc-order="3">
        <div className="pc-wrap">
          <header className="mx-res-head">
            <Reveal><p className="mx-res-k">01 · {t("What we've achieved together")}</p></Reveal>
            <Reveal delay={0.06}>
              <h2 className="mx-res-h">{t("We found the direction with them.")} <span>{t("Here's where it took them.")}</span></h2>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="mx-res-sub">{t("Founders, artists, a venue and a global brand. Different people, different starting points — the same way of working.")}</p>
            </Reveal>
          </header>
          <People />
          <StoryStack />
        </div>
      </section>

      {/* the story, part two: spikes fade, the line stays → how we build the line */}
      <div className="fx" data-pc-tone="dark">
        <Spike label="" />
      </div>

      <section id="services" className="pc-section ch-2" data-pc-section="services" data-pc-order="4">
        <div className="pc-wrap">
          <SectionLabel n="02">{t("How we take you there")}</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 hw-h2">{t("We build the line. Every week.")}</h2>
          </Reveal>
          <Reveal delay={0.06}>
            <p className="st-lede hw-lede">
              {t("A clear direction first. Then a 30-minute sprint every week that turns where you are right now into content — and every piece measured, so we scale what works.")}
            </p>
          </Reveal>
          <EngineChart />
        </div>
      </section>

      <section id="toolkit" className="pc-section ch-3" data-pc-tone="dark" data-pc-section="toolkit" data-pc-order="5">
        <div className="pc-wrap">
          <SectionLabel n="03">{t("What we build along the way")}</SectionLabel>
          <Reveal>
            <h2 className="pc-h2 tk-h2">{t("Everything we can build. Pulled in when you need it.")}</h2>
          </Reveal>
          <Toolkit />
        </div>
      </section>

      <AgencyOffer
        id="offer"
        source="mix"
        chapter={["04", "One offer"]}
        heading="$3,000 a month. No tiers, no add-ons."
        sub="Strategy, the weekly sprint and every tool behind it — apps, dashboards, tracking. Content is scoped to what actually moves your brand, not a quota of reels."
      />

      <DeckTeaser source="mix" />
    </AgencyShell>
  );
}

const MIX_CSS = `
  /* hero — centred, quiet, one idea; settles back as you scroll on */
  .mx-hero { position: relative; height: 150svh; background: #000; color: #f5f5f7; }
  .mx-hero-stick { position: sticky; top: 0; height: 100svh; overflow: hidden; display: grid; grid-template-rows: 1fr auto; grid-template-columns: minmax(0, 1fr); }
  .mx-hero-glow { position: absolute; left: 50%; top: 58%; width: 120vmax; height: 70vmax; translate: -50% -50%; background: radial-gradient(ellipse at center, rgba(255,106,43,0.22), rgba(255,106,43,0.06) 35%, transparent 62%); pointer-events: none; }
  .mx-hero-in { position: relative; align-self: center; display: grid; justify-items: center; text-align: center; padding: 96px clamp(16px, 5vw, 56px) 0; transform-origin: 50% 40%; will-change: transform, opacity; }
  .mx-eyebrow { font-size: clamp(15px, 1.3vw, 19px); font-weight: 600; color: #86868b; letter-spacing: -0.01em; }
  .mx-h1 { margin-top: 14px; display: grid; gap: 0.04em; font-size: clamp(44px, 7.6vw, 112px); line-height: 1.02; letter-spacing: -0.05em; font-weight: 700; }
  .mx-grad { background: linear-gradient(90deg, #FF6A2B 0%, #FF9D6B 50%, #FFC9A8 100%); -webkit-background-clip: text; background-clip: text; color: transparent; padding-bottom: 0.06em; }
  .mx-ctas { margin-top: clamp(26px, 4vh, 40px); display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 14px 30px; }
  .mx-pill { font: inherit; font-size: 17px; font-weight: 500; padding: 13px 26px; border-radius: 999px; border: 0; cursor: pointer; background: #FF6A2B; color: #fff; transition: background-color 0.2s ease, transform 0.2s ease; }
  .mx-pill:hover { background: #ff7d45; transform: scale(1.02); }
  .mx-link { font: inherit; font-size: 17px; font-weight: 500; background: none; border: 0; cursor: pointer; color: #FF8A57; padding: 6px 0; }
  .mx-link:hover { text-decoration: underline; }
  .mx-link span { font-size: 1.15em; margin-left: 2px; }
  .mx-price { margin-top: 18px; font-size: 14px; color: #86868b; }
  .mx-hero-logos { position: relative; padding-bottom: clamp(16px, 3vh, 32px); }
  .mx-rise { opacity: 0; transform: translateY(20px); animation: mx-rise 1.1s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: var(--d, 0s); }
  .mx-h1 .mx-rise { display: block; }
  @keyframes mx-rise { to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .mx-rise { animation: none; opacity: 1; transform: none; } }
  @media (max-height: 760px) { .mx-hero-in { padding-top: 72px; } .mx-price { margin-top: 12px; } }
  /* the story interludes sit flush between the sales chapters */
  .fx + .pc-section, .pc-section + .fx { margin-top: 0; }
  /* results intro — centred, people first */
  .mx-res-head { text-align: center; display: grid; justify-items: center; gap: 16px; margin-bottom: clamp(36px, 5vw, 56px); }
  .mx-res-k { font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #D9480F; }
  .mx-res-h { font-size: clamp(36px, 5.6vw, 80px); font-weight: 700; line-height: 1.02; letter-spacing: -0.05em; max-width: 18ch; }
  .mx-res-h span { color: #86868b; }
  .mx-res-sub { max-width: 46ch; font-size: clamp(17px, 1.6vw, 21px); line-height: 1.45; color: #555; }
  .mx-people { list-style: none; margin: 0 0 clamp(40px, 6vw, 72px); padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px 12px; }
  @media (min-width: 900px) { .mx-people { grid-template-columns: repeat(6, 1fr); } }
  .mx-people button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; width: 100%; text-align: center; }
  .mx-people .pc-reveal { display: grid; justify-items: center; gap: 4px; }
  .mx-face { width: clamp(76px, 9vw, 120px); aspect-ratio: 1; border-radius: 50%; overflow: hidden; display: block; box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--sc); transition: transform 0.35s cubic-bezier(0.16,1,0.3,1); margin-bottom: 10px; }
  .mx-face img { width: 100%; height: 100%; object-fit: cover; }
  .mx-people button:hover .mx-face { transform: scale(1.06); }
  .mx-face-n { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
  .mx-face-k { font-size: 12px; color: var(--pc-grey); }

  /* stories: one per screen, stacking on wide screens */
  .mx-stack { display: grid; gap: 20px; }
  .mx-story {
    position: relative; overflow: hidden; display: grid; grid-template-columns: 1fr;
    border: 1px solid #000; border-radius: 24px; background: #fff; color: #000;
    box-shadow: 0 -24px 60px -30px rgba(0,0,0,0.35);
  }
  .mx-story::before { content: ""; position: absolute; z-index: 2; left: 0; right: 0; top: 0; height: 6px; background: var(--sc); }
  .mx-story-photo { position: relative; height: 220px; overflow: hidden; background: #111; }
  .mx-story-photo img { width: 100%; height: 100%; object-fit: cover; }
  .mx-story-photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(transparent 50%, rgba(0,0,0,0.45)); }
  .mx-story-body { padding: clamp(22px, 3vw, 40px); display: grid; align-content: start; gap: 0; }
  .mx-story-name { margin-top: 14px; font-size: clamp(26px, 2.6vw, 38px); font-weight: 700; letter-spacing: -0.03em; line-height: 1.05; }
  .mx-story-tog { margin-top: 18px; font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sc); }
  .mx-story-big { margin-top: 4px; font-size: clamp(56px, 7.4vw, 112px); font-weight: 700; line-height: 0.95; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; color: var(--sc); }
  .mx-story-big.is-long { font-size: clamp(44px, 5.4vw, 80px); }
  .mx-story-big-l { margin-top: 8px; font-size: clamp(17px, 1.6vw, 20px); font-weight: 600; letter-spacing: -0.01em; }
  .mx-story-pb { margin: 22px 0 0; display: grid; gap: 12px; border-top: 1px solid var(--pc-line); padding-top: 18px; }
  .mx-story-pb dt { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pc-grey); }
  .mx-story-pb dd { margin: 3px 0 0; font-size: 16px; line-height: 1.45; }
  .mx-story-chart { margin-top: 22px; }
  .mx-story .st-link { margin-top: 18px; }
  @media (min-width: 900px) {
    .mx-stack { gap: 0; }
    .mx-story {
      position: sticky; top: calc(84px + var(--i) * 14px);
      height: calc(100svh - 104px); min-height: 600px; max-height: 760px;
      grid-template-columns: 5fr 6fr; margin-bottom: 18vh;
    }
    .mx-story:last-child { margin-bottom: 0; }
    .mx-story-photo { height: auto; }
    .mx-story-body { overflow: hidden; }
    .mx-story-pb { grid-template-columns: 1fr 1fr; gap: 20px; }
  }

  @media (min-width: 900px) and (max-height: 820px) {
    .mx-story-pb { grid-template-columns: 1fr; margin-top: 16px; padding-top: 14px; }
    .mx-story-pb > div:first-child { display: none; }
    .mx-story-chart { margin-top: 16px; }
  }

  /* the core styles darken the page ground; the booklet keeps its white */
  .agency-root:has(.fx) .pc-deck { background: var(--pc-white); color: var(--pc-black); }
`;
