import { useT } from "./i18n.js";
import { Reveal } from "./Reveal.jsx";

/* How we work, as one picture over the first 12 weeks (month one money-back):
   direction — a clear strategy set first, then carried into everything;
   sprint — 30 minutes with you every week;
   content — made by anyone (you, your team or us), easier every week;
   measured — every piece read for growth;
   under it, on the same weeks, the brand scaling.
   Counts and the curve are a shape, not a forecast — no numbers, and it says so. */

const WEEKS = 12;
// Pieces per week — realistic, never a quota (BKM ran up to two a week) — and
// who made each one.
const PIECES = [1, 1, 1, 2, 1, 2, 2, 1, 2, 2, 2, 2];
const MAKERS = ["us", "you", "team", "us", "team", "you"];
const maker = (w, j) => MAKERS[(w * 2 + j) % MAKERS.length];
const K = 3.2; // curve steepness
const curveY = (x) => (Math.exp(K * x) - 1) / (Math.exp(K) - 1);

function curvePath(w, h) {
  const pts = Array.from({ length: 49 }, (_, i) => {
    const x = i / 48;
    return [x * w, h - curveY(x) * (h - 6) - 3];
  });
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return { line, area: `${line} L${w},${h} L0,${h} Z` };
}
const { line: LINE, area: AREA } = curvePath(1200, 300);

export function EngineChart() {
  const t = useT();
  const weeks = Array.from({ length: WEEKS }, (_, i) => i);
  return (
    <Reveal className="en">
      <div className="en-months" aria-hidden="true">
        {[1, 2, 3].map((m) => (
          <span key={m}>{t("Month {n}", { n: m })}</span>
        ))}
      </div>

      <div className="en-row">
        <p className="en-k"><b>{t("Brand strategy")}</b>{t("Defined in weeks 1–2")}</p>
        <div className="en-dir">
          <span className="en-dir-set">{t("Positioning & direction")}</span>
          <span className="en-dir-flow">{t("Governs every channel, decision and piece of content")}</span>
        </div>
      </div>

      <div className="en-row">
        <p className="en-k"><b>{t("The 30-minute sprint")}</b>{t("Every week, with you")}</p>
        <ol className="en-cells">
          {weeks.map((i) => (
            <li key={i} style={{ "--i": i }}><span className="en-meet">30</span></li>
          ))}
        </ol>
      </div>

      <div className="en-row">
        <p className="en-k"><b>{t("Production")}</b>{t("Scoped together")}</p>
        <ol className="en-cells">
          {weeks.map((i) => (
            <li key={i} style={{ "--i": i }}>
              <span className="en-content">
                {Array.from({ length: PIECES[i] }, (_, j) => <i key={j} className={`is-${maker(i, j)}`} />)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="en-row">
        <p className="en-k"><b>{t("Performance")}</b>{t("Every piece measured")}</p>
        <ol className="en-cells">
          {weeks.map((i) => (
            <li key={i} style={{ "--i": i }}>
              <span className="en-content en-measure">
                {Array.from({ length: PIECES[i] }, (_, j) => <i key={j} />)}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="en-row en-row-grow">
        <p className="en-k"><b>{t("Brand growth")}</b>{t("Scaled on what performs")}</p>
        <div className="en-curve">
          <svg viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="en-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#D9480F" stopOpacity="0.28" />
                <stop offset="1" stopColor="#D9480F" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path className="en-area" d={AREA} fill="url(#en-fill)" />
            <path className="en-line" d={LINE} pathLength="1" fill="none" stroke="#D9480F" strokeWidth="3" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="en-curve-tag">{t("Growth")} ↗</span>
        </div>
      </div>

      <div className="en-foot">
        <span className="en-trust">{t("Month 1 · money back if you're not happy — then commit to continue")}</span>
        <span className="en-note">{t("Illustrative — not a forecast.")}</span>
      </div>
    </Reveal>
  );
}

export const ENGINE_CSS = `
  .en {
    --en-k: 186px;
    margin-top: clamp(8px, 1vw, 16px);
    border: 1px solid var(--pc-black); border-radius: 20px;
    padding: clamp(20px, 3vw, 36px);
    display: grid; gap: 10px;
  }
  .en-months, .en-cells { margin-left: var(--en-k); }
  .en-months { display: grid; grid-template-columns: repeat(3, 1fr); }
  .en-months span {
    font-size: 12px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--pc-grey);
    border-left: 1px solid var(--pc-line); padding: 0 0 6px 8px;
  }
  .en-row { position: relative; min-height: 44px; display: flex; align-items: center; }
  .en-k {
    position: absolute; left: 0; width: calc(var(--en-k) - 16px);
    display: grid; gap: 1px; font-size: 13px; line-height: 1.3; color: var(--pc-grey);
  }
  .en-k b { font-size: 15px; font-weight: 600; color: #000; letter-spacing: -0.01em; }
  .en-cells {
    flex: 1; list-style: none; padding: 0;
    display: grid; grid-template-columns: repeat(${WEEKS}, 1fr); gap: 6px;
  }
  .en-cells li { display: flex; justify-content: center; align-items: center; min-height: 36px; }
  .en-cells li:nth-child(4n + 1) { box-shadow: -1px 0 0 var(--pc-line); }
  .en-meet, .en-content {
    opacity: 0; transform: scale(0.6);
    transition: opacity 0.4s ease calc(0.2s + var(--i) * 0.07s), transform 0.5s cubic-bezier(0.16,1,0.3,1) calc(0.2s + var(--i) * 0.07s);
  }
  .en-meet {
    width: 100%; max-width: 64px; height: 30px; border-radius: 8px; background: #000; color: #fff;
    display: grid; place-items: center; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .en-content { display: flex; gap: 3px; }
  .en-content i { width: 9px; height: 16px; border-radius: 3px; background: #D9480F; }
  .en-content i.is-you { background: #000; }
  .en-content i.is-team { background: #9a9a96; }
  .en-measure i { width: 9px; height: 9px; border-radius: 50%; background: none; border: 2px solid #0E9384; }
  .en-dir { flex: 1; margin-left: var(--en-k); display: grid; grid-template-columns: 3fr 9fr; gap: 6px; align-items: center; }
  .en-dir-set {
    height: 32px; border-radius: 8px; background: #D9480F; color: #fff;
    display: grid; place-items: center; font-size: 13px; font-weight: 600;
  }
  .en-dir-flow {
    position: relative; height: 32px; display: flex; align-items: center; padding-left: 12px;
    font-size: 13px; color: #D9480F; font-weight: 500;
    background: linear-gradient(90deg, color-mix(in srgb, #D9480F 16%, #fff), color-mix(in srgb, #D9480F 4%, #fff));
    border-radius: 8px;
  }
  .en-dir-flow::after { content: "→"; position: absolute; right: 10px; font-size: 16px; }
  .en-dir-set, .en-dir-flow { transform-origin: left; transform: scaleX(0); transition: transform 0.9s cubic-bezier(0.16,1,0.3,1) 0.2s; }
  .en-dir-flow { transition-delay: 0.5s; }
  .en-row-grow { align-items: stretch; min-height: clamp(150px, 18vw, 230px); margin-top: 6px; }
  .en-row-grow .en-k { top: auto; bottom: 0; }
  .en-curve {
    position: relative; flex: 1; margin-left: var(--en-k);
    border-bottom: 1px solid #000; border-left: 1px solid var(--pc-line);
  }
  .en-curve svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .en-line { stroke-dasharray: 1; stroke-dashoffset: 1; transition: stroke-dashoffset 1.8s cubic-bezier(0.45,0,0.2,1) 0.9s; }
  .en-area { opacity: 0; transition: opacity 1s ease 2s; }
  .en-curve-tag {
    position: absolute; right: 0; top: -4px; transform: translateY(-100%);
    font-size: 14px; font-weight: 700; color: #D9480F;
    opacity: 0; transition: opacity 0.5s ease 2.5s;
  }
  .en-foot { margin-top: 8px; margin-left: var(--en-k); display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 20px; }
  .en-trust { font-size: 14px; font-weight: 600; }
  .en-note { font-size: 12px; color: var(--pc-grey); }

  .pc-reveal.is-in .en-meet, .pc-reveal.is-in .en-content { opacity: 1; transform: none; }
  .pc-reveal.is-in .en-dir-set, .pc-reveal.is-in .en-dir-flow { transform: none; }
  .pc-reveal.is-in .en-line { stroke-dashoffset: 0; }
  .pc-reveal.is-in .en-area, .pc-reveal.is-in .en-curve-tag { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .en-meet, .en-content, .en-dir-set, .en-dir-flow, .en-line, .en-area, .en-curve-tag { transition: none; }
  }

  @media (max-width: 760px) {
    .en { --en-k: 0px; padding: 18px 14px; gap: 4px; }
    .en-k { position: static; width: auto; display: flex; gap: 8px; align-items: baseline; margin: 10px 0 6px; }
    .en-k b { font-size: 14px; }
    .en-row { display: block; min-height: 0; }
    .en-cells { gap: 3px; }
    .en-cells li { min-height: 24px; }
    .en-meet { height: 22px; border-radius: 5px; font-size: 10px; }
    .en-content { gap: 1px; flex-wrap: wrap; justify-content: center; max-width: 100%; }
    .en-content i { width: 4px; height: 12px; border-radius: 1px; }
    .en-measure i { width: 4px; height: 4px; border: 0; background: #0E9384; }
    .en-dir { margin-left: 0; grid-template-columns: 1fr; gap: 4px; }
    .en-dir-set, .en-dir-flow { height: 28px; font-size: 12px; }
    .en-dir-set { justify-self: start; padding: 0 12px; }
    .en-curve-tag { top: 6px; left: 8px; right: auto; transform: none; font-size: 12px; }
    .en-dir-flow::after { display: none; }
      .en-row-grow { min-height: 0; }
    .en-row-grow .en-curve { height: 140px; }
    .en-curve { margin-left: 0; }
    .en-foot { margin-left: 0; flex-direction: column; }
  }
`;
