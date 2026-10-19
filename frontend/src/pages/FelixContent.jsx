import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { trackEvent } from "../lib/analytics.js";
import { Reveal } from "../components/agency/Reveal.jsx";
import { LogoBand } from "../components/agency/landingParts.jsx";
import { Network } from "../components/agency/FounderNetwork.jsx";
import { CONTACT, COVERS, SERIES, casePath } from "../components/agency/agencyData.js";
import { openRequest } from "../components/agency/request.js";
import { useT } from "../components/agency/i18n.js";

/* The front page: Felix, in first person. Who he is → who he's worked with →
   what they say → the network ("we" only here) → the one offer.
   Minimal on purpose: one idea per section, short lines, no decoration. */

// Who Felix has been — his words. Don't embellish (no "licensed", no sport).
const CREDS = [
  ["Pro freestyler", "Former professional"],
  ["Ranger", "31st Light Battalion, Karlsborg"],
  ["Naprapath", "Four years of study, three-plus treating people"],
  ["Author", "One published book, the next on its way"],
];

// One line and one number per case. Numbers trace to agencyData.
const LINES = {
  "li-karlsen": ["Her own voice on camera.", "8 h → 30 min", "per piece of content"],
  bkm: ["Two founders became the face of their brand.", "10,000+", "organic followers"],
  stiga: ["In-house talent became faces fans follow.", "28.1M", "views in seven months"],
  kaijas: ["The artists, the team and the guests became the brand.", "3 months", "booked in advance"],
  "adam-dawood": ["An identity built on who he actually is.", "0 → Sony", "from zero to signed"],
  "adam-flambo": ["Faces instead of followers.", null, "in his community"],
};
const ORDER = ["li-karlsen", "bkm", "stiga", "kaijas", "adam-dawood", "adam-flambo"];
const CASE_ROWS = ORDER.map((slug) => SERIES.find((c) => c.slug === slug)).filter(Boolean);

// Real words from real clients only — add each one as it comes in.
// English is the translation; the Swedish dictionary holds the original.
const WORDS = [
  {
    slug: "adam-flambo",
    who: "Adam Flambo",
    role: "Creator",
    quote: "That's how I see you. Besides being a super chill guy, you're the one who set up my studio in a single day while I stood there navel-gazing. That's what you wish clients understood — that you're a fucking maker. An action taker.",
  },
];

const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const work = (location) => {
  trackEvent("cta_click", { location });
  openRequest({ source: location });
};

export function FelixContent() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="fl">
      {/* hero */}
      <section className="fl-hero" data-pc-section="hero" data-pc-order="1">
        <div className="fl-wrap fl-hero-grid">
          <div className="fl-hero-text">
            <p className="fl-me fl-rise" style={{ "--d": "0.05s" }}>
              <img src="/felix.jpg" alt="" decoding="async" />
              <span><b>Felix Civalero Stolpe</b>{t("For founders, artists and small brands")}</span>
            </p>
            <p className="fl-k fl-rise" style={{ "--d": "0.05s" }}>{t("For founders, artists and small brands")}</p>
            <h1 className="fl-h1 fl-rise" style={{ "--d": "0.15s" }}>{t("I develop the people behind brands.")}</h1>
            <p className="fl-slogan fl-rise" style={{ "--d": "0.35s" }}>{t("Growth that lasts.")}</p>
            <div className="fl-ctas fl-rise" style={{ "--d": "0.55s" }}>
              <button type="button" className="fl-btn" onClick={() => work("hero")}>{t("Work with me")}</button>
              <button type="button" className="fl-link" onClick={() => { trackEvent("cta_click", { location: "hero_cases" }); scrollToId("stories"); }}>
                {t("See the cases")} <ArrowRight size={16} strokeWidth={1.75} />
              </button>
            </div>
            <p className="fl-fine fl-rise" style={{ "--d": "0.7s" }}>{t("30,000 SEK a month. Not happy after the first month? Money back.")}</p>
          </div>
          <div className="fl-hero-photo fl-rise" style={{ "--d": "0.25s" }}>
            <img src="/felix.jpg" alt="Felix Civalero Stolpe" decoding="async" />
          </div>
        </div>
        <div className="fl-logos">
          <LogoBand />
        </div>
      </section>

      {/* about */}
      <section id="about" className="fl-sec" data-pc-section="about" data-pc-order="2">
        <div className="fl-wrap">
          <p className="fl-label">{t("About me")}</p>
          <Reveal><h2 className="fl-h2">{t("Developing people is my passion.")}</h2></Reveal>
          <ul className="fl-creds">
            {CREDS.map(([k, v], i) => (
              <Reveal key={k} delay={0.04 * i}>
                <li><b>{t(k)}</b><span>{t(v)}</span></li>
              </Reveal>
            ))}
          </ul>
          <Reveal>
            <blockquote className="fl-quote">
              <p>{t("The genuine creative expression no one can copy is you.")}</p>
              <footer>{t("You just need help channelling it. A brand is the same thing — at the level of a group.")}</footer>
            </blockquote>
          </Reveal>
        </div>
      </section>

      {/* cases */}
      <section id="stories" className="fl-sec fl-rule" data-pc-section="stories" data-pc-order="3">
        <div className="fl-wrap">
          <p className="fl-label">{t("Cases")}</p>
          <Reveal><h2 className="fl-h2">{t("People I've worked with.")}</h2></Reveal>
          <ul className="fl-cases">
            {CASE_ROWS.map((c, i) => {
              const [line, num, unit] = LINES[c.slug];
              return (
                <Reveal key={c.slug} delay={0.03 * i}>
                  <li>
                    <a
                      href={casePath(c.slug)}
                      onClick={(e) => {
                        e.preventDefault();
                        trackEvent("cta_click", { location: `case_${c.slug}` });
                        navigate(casePath(c.slug));
                      }}
                    >
                      <img src={COVERS[c.slug] || c.image} alt="" loading="lazy" decoding="async" />
                      <span className="fl-case-who">
                        <b>{c.name}</b>
                        <span>{t(line)}</span>
                      </span>
                      <span className="fl-case-num">
                        <b>{t(num ?? c.score[0])}</b>
                        <span>{t(unit)}</span>
                      </span>
                      <ArrowRight className="fl-case-go" size={20} strokeWidth={1.5} />
                    </a>
                  </li>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </section>

      {/* what they say */}
      <section id="words" className="fl-sec fl-rule" data-pc-section="words" data-pc-order="4">
        <div className="fl-wrap">
          <p className="fl-label">{t("What they say")}</p>
          {WORDS.map((w) => (
            <Reveal key={w.who}>
              <figure className="fl-word">
                <blockquote>“{t(w.quote)}”</blockquote>
                <figcaption>
                  <img src={COVERS[w.slug]} alt="" loading="lazy" decoding="async" />
                  <span><b>{w.who}</b> · {t(w.role)}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      {/* network — the one place it's "we" */}
      <section id="network" className="fl-sec fl-rule" data-pc-section="network" data-pc-order="5">
        <div className="fl-wrap">
          <p className="fl-label">{t("My network")}</p>
          <Reveal><h2 className="fl-h2">{t("When it's needed, we're a team.")}</h2></Reveal>
          <Reveal delay={0.05}>
            <p className="fl-p">{t("Photographers, videographers, 3D animators, producers and many more. People I've worked with and trust.")}</p>
          </Reveal>
          <Network />
        </div>
      </section>

      {/* the offer */}
      <section id="offer" className="fl-offer" data-pc-tone="dark" data-pc-section="offer" data-pc-order="6">
        <div className="fl-wrap">
          <p className="fl-label">{t("The offer")}</p>
          <Reveal><h2 className="fl-h2">{t("30,000 SEK a month.")}</h2></Reveal>
          <Reveal delay={0.05}>
            <p className="fl-p">{t("Strategy, content, growth and every tool behind it. No tiers, no add-ons. Not happy after the first month? You get your money back.")}</p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="fl-ctas">
              <button type="button" className="fl-btn fl-btn-light" onClick={() => work("offer")}>{t("Work with me")}</button>
              <a className="fl-link fl-link-light" href={`mailto:${CONTACT}`}>{CONTACT}</a>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

export const FELIX_CSS = `
  .fl { --ink: #0a0a0a; --grey: #6e6e73; --rule: rgba(0,0,0,0.1); --accent: #D9480F; background: #fff; color: var(--ink); }
  .fl-wrap { max-width: 1180px; margin: 0 auto; padding: 0 clamp(16px, 5vw, 56px); }
  .fl-sec { padding: clamp(88px, 12vw, 160px) 0; }
  .fl-rule > .fl-wrap { border-top: 1px solid var(--rule); padding-top: clamp(40px, 5vw, 64px); }
  .fl-rule { padding-top: 0; }
  .fl-label { font-size: 13px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--grey); }
  .fl-h2 { margin-top: 14px; font-size: clamp(34px, 4.6vw, 64px); font-weight: 700; line-height: 1.02; letter-spacing: -0.045em; max-width: 18ch; }
  .fl-p { margin-top: 18px; max-width: 46ch; font-size: clamp(17px, 1.5vw, 20px); line-height: 1.5; color: #444; }

  /* hero */
  .fl-hero { min-height: 100svh; display: grid; grid-template-rows: 1fr auto; grid-template-columns: minmax(0, 1fr); padding-top: 88px; }
  .fl-hero-grid { align-self: center; display: grid; gap: clamp(32px, 5vw, 72px); align-items: center; width: 100%; box-sizing: border-box; padding-block: clamp(12px, 4vh, 56px); }
  @media (min-width: 900px) { .fl-hero-grid { grid-template-columns: 7fr 5fr; } }
  .fl-k { font-size: clamp(15px, 1.2vw, 17px); font-weight: 500; color: var(--grey); }
  .fl-h1 { margin-top: 16px; font-size: clamp(40px, min(6.4vw, 8.4svh), 96px); font-weight: 700; line-height: 0.98; letter-spacing: -0.05em; max-width: 12ch; }
  .fl-slogan { margin-top: clamp(12px, 2vh, 20px); font-size: clamp(26px, min(3.2vw, 5.4svh), 46px); font-weight: 700; letter-spacing: -0.04em; color: var(--accent); }
  .fl-ctas { margin-top: clamp(24px, 4vh, 40px); display: flex; flex-wrap: wrap; align-items: center; gap: 14px 28px; }
  .fl-btn { font: inherit; font-size: 16px; font-weight: 600; padding: 14px 26px; border-radius: 999px; border: 0; cursor: pointer; background: var(--ink); color: #fff; transition: transform 0.2s ease, background-color 0.2s ease; }
  .fl-btn:hover { transform: translateY(-1px); background: #000; }
  .fl-btn-light { background: #fff; color: var(--ink); }
  .fl-btn-light:hover { background: #fff; }
  .fl-link { font: inherit; font-size: 16px; font-weight: 600; background: none; border: 0; padding: 6px 0; cursor: pointer; color: var(--ink); display: inline-flex; align-items: center; gap: 6px; text-decoration: none; }
  .fl-link:hover { text-decoration: underline; text-underline-offset: 4px; }
  .fl-link-light { color: #fff; }
  .fl-fine { margin-top: 18px; font-size: 14px; color: var(--grey); }
  .fl-hero-photo { justify-self: center; height: min(560px, calc(100svh - 300px)); max-width: 100%; aspect-ratio: 4 / 5; border-radius: 20px; overflow: hidden; background: #eee; }
  .fl-hero-photo img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; display: block; }
  /* phones: the photo becomes an avatar beside the name, so the logos still show */
  .fl-me { display: none; }
  @media (max-width: 899px) {
    .fl-hero-photo, .fl-k { display: none; }
    .fl-me { display: flex; align-items: center; gap: 12px; }
    .fl-me img { width: 52px; height: 52px; border-radius: 50%; object-fit: cover; object-position: 50% 25%; }
    .fl-me span { display: grid; gap: 1px; font-size: 14px; color: var(--grey); line-height: 1.3; }
    .fl-me b { font-size: 16px; color: var(--ink); letter-spacing: -0.01em; }
  }
  .fl-logos { padding-bottom: clamp(16px, 3vh, 32px); }
  .fl-logos .pc-logos { border-top-color: var(--rule); }
  .fl-logos .pc-logos-label { color: var(--grey); }
  .fl-logos .pc-logos-group img { filter: brightness(0); opacity: 0.8; }
  .fl-rise { opacity: 0; transform: translateY(14px); animation: fl-rise 0.9s cubic-bezier(0.16,1,0.3,1) forwards; animation-delay: var(--d, 0s); }
  @keyframes fl-rise { to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .fl-rise { animation: none; opacity: 1; transform: none; } }

  /* about */
  .fl-creds { list-style: none; margin: clamp(32px, 4vw, 48px) 0 0; padding: 0; border-top: 1px solid var(--rule); }
  .fl-creds li { display: grid; gap: 4px 24px; padding: 18px 0; border-bottom: 1px solid var(--rule); align-items: baseline; }
  @media (min-width: 720px) { .fl-creds li { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  .fl-creds b { font-size: clamp(24px, 2.6vw, 34px); font-weight: 700; letter-spacing: -0.035em; line-height: 1.1; }
  .fl-creds span { font-size: 16px; color: var(--grey); }
  .fl-quote { margin: clamp(48px, 6vw, 80px) 0 0; padding: 0; max-width: 820px; }
  .fl-quote p { font-size: clamp(28px, 3.4vw, 48px); font-weight: 700; line-height: 1.08; letter-spacing: -0.04em; }
  .fl-quote p::before { content: "“"; color: var(--accent); }
  .fl-quote footer { margin-top: 16px; font-size: clamp(17px, 1.5vw, 20px); line-height: 1.5; color: #444; max-width: 46ch; }

  /* cases */
  .fl-cases { list-style: none; margin: clamp(32px, 4vw, 48px) 0 0; padding: 0; border-top: 1px solid var(--rule); }
  .fl-cases a { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 6px 18px; align-items: center; padding: 18px 0; border-bottom: 1px solid var(--rule); color: inherit; text-decoration: none; }
  @media (min-width: 720px) { .fl-cases a { grid-template-columns: 64px minmax(0, 1fr) minmax(0, 15rem) 24px; gap: 24px; padding: 22px 0; } }
  .fl-cases img { width: 100%; aspect-ratio: 1; border-radius: 12px; object-fit: cover; }
  .fl-case-who { display: grid; gap: 3px; }
  .fl-case-who b { font-size: clamp(19px, 1.8vw, 24px); font-weight: 700; letter-spacing: -0.025em; }
  .fl-case-who span { font-size: 15px; color: var(--grey); line-height: 1.4; }
  .fl-case-num { display: grid; gap: 2px; text-align: right; }
  .fl-case-num b { font-size: clamp(20px, 2.2vw, 30px); font-weight: 700; letter-spacing: -0.035em; white-space: nowrap; }
  .fl-case-num span { font-size: 13px; color: var(--grey); }
  .fl-case-go { color: var(--grey); transition: transform 0.2s ease, color 0.2s ease; }
  .fl-cases a:hover .fl-case-go { transform: translateX(4px); color: var(--accent); }
  .fl-cases a:hover .fl-case-who b { text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }
  @media (max-width: 719px) {
    .fl-case-num { grid-column: 2 / -1; text-align: left; display: flex; gap: 8px; align-items: baseline; }
    .fl-case-go { display: none; }
  }

  /* what they say */
  .fl-word { margin: clamp(28px, 4vw, 44px) 0 0; max-width: 900px; }
  .fl-word blockquote { margin: 0; font-size: clamp(24px, 2.7vw, 38px); font-weight: 600; line-height: 1.2; letter-spacing: -0.03em; }
  .fl-word figcaption { margin-top: 24px; display: flex; align-items: center; gap: 12px; font-size: 16px; color: var(--grey); }
  .fl-word figcaption b { color: var(--ink); }
  .fl-word figcaption img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; }

  /* network: the shared graph, quieter on this page */
  .fl .fn-graph { margin-top: clamp(32px, 4vw, 56px); }

  /* offer */
  .fl-offer { background: var(--ink); color: #fff; padding: clamp(96px, 13vw, 168px) 0; }
  .fl-offer .fl-label { color: rgba(255,255,255,0.55); }
  .fl-offer .fl-p { color: rgba(255,255,255,0.72); }
`;
