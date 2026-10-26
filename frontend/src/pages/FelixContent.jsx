import { ArrowRight } from "lucide-react";
import { trackEvent } from "../lib/analytics.js";
import { Reveal } from "../components/agency/Reveal.jsx";
import { LogoBand } from "../components/agency/landingParts.jsx";
import { CaseStack } from "../components/agency/CaseStack.jsx";
import { MailLink } from "../components/agency/MailLink.jsx";
import { Testimonials } from "../components/agency/Testimonials.jsx";
import { EngineChart } from "../components/agency/EngineChart.jsx";
import { openRequest } from "../components/agency/request.js";
import { useT } from "../components/agency/i18n.js";

/* The front page: Felix, in first person. Hero + logos → what clients say
   (small cards) → the cases (horizontal rail) → how the work runs (the 12-week picture with the weekly
   30-minute sprint) → the one offer → a short bio.
   Minimal on purpose: one idea per section, short lines, no decoration. */

// The bio: who Felix has been — his facts only (freestyle pro, Ranger in the
// 31st Light Battalion at Karlsborg, naprapath, seven years of marketing). Don't embellish: no
// sport name, no "licensed", no invented details. The site talks about
// building brands — for companies, creators and artists — not about "the
// people behind brands" (Felix 2026-10-26: the people he mails didn't get it).
const BIO = [
  "I've lived a few lives already. Pro freestyler. Ranger in the 31st Light Battalion in Karlsborg. Four years of study to become a naprapath, over three years treating patients — and then seven years of marketing.",
  "Today I build brands — for companies, creators and artists. A clear direction, content that sounds like them and growth you can measure.",
];

const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const work = (location) => {
  trackEvent("cta_click", { location });
  openRequest({ source: location });
};

export function FelixContent() {
  const t = useT();
  return (
    <div className="fl">
      {/* hero */}
      <section className="fl-hero" data-pc-section="hero" data-pc-order="1">
        <div className="fl-wrap fl-hero-grid">
          <div className="fl-hero-text">
            <p className="fl-me fl-rise" style={{ "--d": "0.05s" }}>
              <img src="/felix.jpg" alt="" decoding="async" />
              <span><b>Felix Civalero Stolpe</b>{t("For companies, creators and artists")}</span>
            </p>
            <p className="fl-k fl-rise" style={{ "--d": "0.05s" }}>{t("For companies, creators and artists")}</p>
            <h1 className="fl-h1 fl-rise" style={{ "--d": "0.15s" }}>{t("I build brands.")}</h1>
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

      {/* what they say — small cards right under the logo band */}
      <section id="words" className="fl-words" data-pc-section="words" data-pc-order="2">
        <div className="fl-wrap">
          <p className="fl-label">{t("What they say")}</p>
          <Reveal><div className="fl-tm"><Testimonials /></div></Reveal>
        </div>
      </section>

      {/* cases — a horizontal rail */}
      <section id="stories" className="fl-cases-sec" data-pc-section="stories" data-pc-order="3">
        <CaseStack
          head={
            <>
              <p className="fl-label">{t("A selection")}</p>
              <h2 className="fl-h2">{t("Hand-picked client cases.")}</h2>
            </>
          }
        />
      </section>


      {/* how it runs — the 12-week picture */}
      <section id="how" className="fl-sec fl-rule" data-pc-section="how" data-pc-order="4">
        <div className="fl-wrap">
          <p className="fl-label">{t("How I work")}</p>
          <Reveal><h2 className="fl-h2">{t("Your brand grows every week.")}</h2></Reveal>
          <Reveal delay={0.05}>
            <p className="fl-p">{t("First a clear direction. Then 30 minutes with me every week, where your voice becomes content. Everything is measured, and what works gets scaled.")}</p>
          </Reveal>
          <div className="fl-engine"><EngineChart /></div>
        </div>
      </section>

      {/* the offer */}
      <section id="offer" className="fl-offer" data-pc-tone="dark" data-pc-section="offer" data-pc-order="5">
        <div className="fl-wrap">
          <p className="fl-label">{t("The offer")}</p>
          <Reveal><h2 className="fl-h2">{t("30,000 SEK a month.")}</h2></Reveal>
          <Reveal delay={0.05}>
            <p className="fl-p">{t("Strategy, content, growth — and the tech behind it, built by me. No tiers, no add-ons. Not happy after the first month? You get your money back.")}</p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="fl-ctas">
              <button type="button" className="fl-btn fl-btn-light" onClick={() => work("offer")}>{t("Work with me")}</button>
              <MailLink className="fl-link fl-link-light" />
            </div>
          </Reveal>
        </div>
      </section>
      {/* about */}
      <section id="about" className="fl-sec" data-pc-section="about" data-pc-order="6">
        <div className="fl-wrap">
          <p className="fl-label">{t("About me")}</p>
          <Reveal><h2 className="fl-h2">{t("Building brands is what I do.")}</h2></Reveal>
          <div className="fl-bio">
            {BIO.map((para, i) => (
              <Reveal key={i} delay={0.05 * i}><p>{t(para)}</p></Reveal>
            ))}
          </div>
          <Reveal>
            <blockquote className="fl-quote">
              <p>{t("Creators and artists are already brands.")}</p>
              <footer>{t("I help them build it — with the same structure I use for companies.")}</footer>
            </blockquote>
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
  @media (pointer: coarse) { .fl-link { min-height: 44px; } }
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
  .fl-bio { margin-top: clamp(28px, 3.4vw, 44px); max-width: 680px; display: grid; gap: 18px; }
  .fl-bio p { font-size: clamp(18px, 1.6vw, 22px); line-height: 1.5; color: #2a2a2e; letter-spacing: -0.01em; }
  .fl-bio > :first-child p { font-size: clamp(22px, 2.2vw, 30px); line-height: 1.3; font-weight: 600; color: var(--ink); letter-spacing: -0.025em; }
  .fl-quote { margin: clamp(48px, 6vw, 80px) 0 0; padding: 0; max-width: 820px; }
  .fl-quote p { font-size: clamp(28px, 3.4vw, 48px); font-weight: 700; line-height: 1.08; letter-spacing: -0.04em; }
  .fl-quote p::before { content: "“"; color: var(--accent); }
  .fl-quote footer { margin-top: 16px; font-size: clamp(17px, 1.5vw, 20px); line-height: 1.5; color: #444; max-width: 46ch; }


  /* testimonials under the logos, then the case rail */
  .fl-words { padding: clamp(40px, 6vw, 72px) 0 0; }
  .fl-tm { margin-top: 16px; }
  .fl-cases-sec { padding: clamp(72px, 10vw, 128px) 0 clamp(48px, 6vw, 80px); }
  .fl-cases-sec .fl-h2 { max-width: none; }

  /* how it runs */
  .fl-engine { margin-top: clamp(32px, 4vw, 56px); }

  /* offer */
  .fl-offer { background: var(--ink); color: #fff; padding: clamp(96px, 13vw, 168px) 0; }
  .fl-offer .fl-label { color: rgba(255,255,255,0.55); }
  .fl-offer .fl-p { color: rgba(255,255,255,0.72); }
`;
