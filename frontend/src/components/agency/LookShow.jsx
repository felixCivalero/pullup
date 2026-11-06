import { useEffect, useState } from "react";
import { LOOK_COLORS, LOOK_FONTS, isLight, loadLookFont, lookVars } from "../event/look.js";
import { useLang } from "./i18n.js";

/* "Your look" on the event tool page: one event page in a phone, changing its
   look by itself, the way the editor does it (components/event/look.js, the
   same colours, fonts and CSS variables as a real page): a new colour sweeps
   down over the page, the font follows, and text, date, sign-up and button
   flip between dark and light with it. Click a colour to pick it; it holds
   for a while, then plays on. Reduced motion: no autoplay, no sweep.
   The event tool page is shown as a negative (html.et-negative: invert +
   hue-rotate 60°), so the section is written in that page's terms (dark in
   code = light on screen, its et-kicker/et-h2/et-lead), and the phone and the
   swatches carry the opposite filter: they show a page's real colours. */

// Colour and font pairs that show the range.
const PAIRS = [
  ["#ffffff", "grotesk"],
  ["#05040a", "serif"],
  ["#ec178f", "rounded"],
  ["#f4efe6", "mono"],
  ["#14213d", "standard"],
  ["#1f3d2b", "serif"],
];
const COPY = {
  sv: { kicker: "Din look", title: "Samma sida. Din stil.", lead: "Välj bakgrund och typsnitt. Allt på sidan följer med: rubriken, datumet, anmälan och knappen. Mörk text på ljust, vit på mörkt, av sig själv.", date: "LÖR 7 NOV · 19:00", place: "Slakthusområdet, Stockholm", count: "96 av 120 kommer", cta: "Anmäl dig", font: "Typsnitt", pick: "Testa en färg" },
  en: { kicker: "Your look", title: "Same page. Your style.", lead: "Pick a background and a font. Everything on the page follows: the title, the date, the sign-up and the button. Dark text on light, white on dark, by itself.", date: "SAT 7 NOV · 19:00", place: "Slakthusområdet, Stockholm", count: "96 of 120 coming", cta: "Sign up", font: "Font", pick: "Try a colour" },
};

export function LookShow() {
  const lang = useLang();
  const c = COPY[lang] || COPY.en;
  const [i, setI] = useState(0);
  const [held, setHeld] = useState(0);

  useEffect(() => { PAIRS.forEach(([, font]) => loadLookFont({ font })); }, []);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
    const t = setTimeout(() => setI((n) => (n + 1) % PAIRS.length), held ? 6000 : 2600);
    return () => clearTimeout(t);
  }, [i, held]);

  const [bg, font] = PAIRS[i];
  const look = { bg, font };
  const vars = lookVars(look);
  const light = isLight(bg);
  const fontLabel = LOOK_FONTS.find((f) => f.id === font)?.label;

  return (
    <section className="lk" data-pc-section="look" data-pc-order="2">
      <div className="lk-copy">
        <small className="et-kicker">{c.kicker}</small>
        <h2 className="et-h2">{c.title}</h2>
        <p className="et-lead">{c.lead}</p>
        <div className="lk-swatches" role="group" aria-label={c.pick}>
          {LOOK_COLORS.map((col) => {
            const at = PAIRS.findIndex(([b]) => b === col.bg);
            return (
              <button
                key={col.bg}
                type="button"
                className={col.bg === bg ? "is-on" : undefined}
                style={{ background: col.bg }}
                aria-label={col.label}
                title={col.label}
                onClick={() => { setI(at >= 0 ? at : 0); setHeld((h) => h + 1); }}
              />
            );
          })}
        </div>
        <p className="lk-font">{c.font}: <b>{fontLabel}</b></p>
      </div>
      <div className="lk-stage">
        <div className="lk-phone">
          <div className="lk-screen" style={vars}>
            {/* the new colour sweeps down over the old one */}
            <div key={i} className="lk-sweep" style={{ background: bg }} />
            <div className="lk-page" style={{ color: "var(--pg-ink)" }}>
              <div className="lk-cover">
                <div className="lk-orb" />
              </div>
              <p className="lk-date" style={{ color: "var(--pg-date)" }}>{c.date}</p>
              <h3 key={`t${i}`} className="lk-title">Releasefest</h3>
              <p className="lk-place">{c.place}</p>
              <div className="lk-meter"><i style={{ background: "var(--pg-ink)" }} /></div>
              <p className="lk-count">{c.count}</p>
              <button type="button" tabIndex={-1} className="lk-cta" style={{ background: "var(--pg-ink)", color: "var(--pg-bg)" }}>{c.cta}</button>
            </div>
          </div>
        </div>
        <div className={`lk-glow${light ? "" : " is-dark"}`} style={{ background: bg }} aria-hidden="true" />
      </div>
    </section>
  );
}

export const LOOK_SHOW_CSS = `
  .lk { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: clamp(32px, 6vw, 96px); align-items: center; padding: clamp(80px, 12vh, 140px) clamp(20px, 6vw, 96px); background: #0a0a0a; color: #fff; overflow: hidden; }
  /* the page's negative, undone: real colours here */
  .lk-swatches, .lk-stage { filter: hue-rotate(-60deg) invert(1); }
  .lk-swatches { display: flex; gap: 10px; margin-top: 30px; width: fit-content; }
  .lk-swatches button { width: 38px; height: 38px; border-radius: 50%; border: 1px solid rgba(0,0,0,.18); cursor: pointer; padding: 0; transition: transform .2s ease, box-shadow .2s ease; }
  .lk-swatches button:hover { transform: scale(1.1); }
  .lk-swatches button.is-on { box-shadow: 0 0 0 3px #fff, 0 0 0 5px #0a0a0a; transform: scale(1.08); }
  .lk-font { margin: 14px 0 0; font: 600 12px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: rgba(255,255,255,.55); }
  .lk-font b { color: #fff; }
  .lk-stage { position: relative; display: grid; place-items: center; min-height: 640px; }
  .lk-glow { position: absolute; width: 70%; aspect-ratio: 1; border-radius: 50%; filter: blur(70px); opacity: .5; transition: background .9s ease; z-index: 0; }
  .lk-glow.is-dark { opacity: .3; }
  .lk-phone { position: relative; z-index: 1; width: min(330px, 78vw); aspect-ratio: 9 / 19; padding: 12px; border-radius: 46px; background: #0d0d0f; box-shadow: 0 40px 80px -30px rgba(0,0,0,.45), inset 0 0 0 2px #2a2a2e; transform: rotate(-4deg); animation: lkFloat 7s ease-in-out infinite; }
  .lk-screen { position: relative; height: 100%; border-radius: 36px; overflow: hidden; background: var(--pg-bg); transition: background 0s .7s; }
  .lk-sweep { position: absolute; inset: 0; z-index: 0; animation: lkSweep .7s cubic-bezier(.7,0,.2,1) both; }
  .lk-page { position: relative; z-index: 1; display: flex; flex-direction: column; height: 100%; padding: 18px 18px 22px; font-family: var(--pg-font); transition: color .5s ease .25s; }
  .lk-cover { position: relative; height: 44%; border-radius: 22px; overflow: hidden; background: var(--pg-hero); transition: background .6s ease .2s; }
  .lk-orb { position: absolute; inset: -20%; background: radial-gradient(circle at 30% 30%, #ff8fd0 0%, rgba(236,23,143,.8) 30%, rgba(80,40,200,.7) 60%, rgba(0,0,0,0) 75%); animation: lkOrb 9s ease-in-out infinite alternate; }
  .lk-date { margin: 18px 0 6px; font-size: 12px; font-weight: 700; letter-spacing: .08em; transition: color .5s ease .25s; }
  .lk-title { margin: 0; font-size: 38px; line-height: 1; letter-spacing: -0.02em; font-weight: 700; animation: lkIn .6s ease .3s both; }
  .lk-place { margin: 8px 0 18px; font-size: 13px; opacity: .7; }
  .lk-meter { height: 6px; border-radius: 3px; background: rgba(var(--pg-ink-rgb), .14); overflow: hidden; }
  .lk-meter i { display: block; width: 80%; height: 100%; border-radius: 3px; transition: background .5s ease .25s; }
  .lk-count { margin: 8px 0 auto; font-size: 13px; font-weight: 600; }
  .lk-cta { width: 100%; padding: 15px; border: 0; border-radius: 999px; font: inherit; font-size: 16px; font-weight: 700; transition: background .5s ease .25s, color .5s ease .25s; }
  @keyframes lkSweep { from { clip-path: inset(0 0 100% 0) } to { clip-path: inset(0 0 0 0) } }
  @keyframes lkIn { from { opacity: 0; transform: translateY(10px); filter: blur(4px) } to { opacity: 1; transform: none; filter: none } }
  @keyframes lkFloat { 0%, 100% { transform: rotate(-4deg) translateY(0) } 50% { transform: rotate(-2deg) translateY(-14px) } }
  @keyframes lkOrb { from { transform: translate(-6%, -4%) scale(1) } to { transform: translate(8%, 6%) scale(1.15) } }
  @media (max-width: 860px) { .lk { grid-template-columns: 1fr; } .lk-stage { min-height: 560px; } }
  @media (prefers-reduced-motion: reduce) { .lk-phone, .lk-orb, .lk-sweep, .lk-title { animation: none !important; } }
`;
