import { useT } from "./i18n.js";
import { Reveal } from "./Reveal.jsx";

/* What a client gets, as one picture over the 12-week trust period:
   row 1 — your 30-minute meeting, every week;
   row 2 — the week of content that comes out of it, on every channel;
   row 3 — the monthly read-out;
   under it, on the same weeks, the brand's growth compounding.
   The curve is a shape, not a forecast — it carries no numbers and says so. */

const WEEKS = 12;
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
        <p className="en-k"><b>{t("You")}</b>{t("30 min a week")}</p>
        <ol className="en-cells">
          {weeks.map((i) => (
            <li key={i} style={{ "--i": i }}><span className="en-meet">30</span></li>
          ))}
        </ol>
      </div>

      <div className="en-row">
        <p className="en-k"><b>{t("We make")}</b>{t("A week of content")}</p>
        <ol className="en-cells">
          {weeks.map((i) => (
            <li key={i} style={{ "--i": i }}>
              <span className="en-content"><i /><i /><i /></span>
            </li>
          ))}
        </ol>
      </div>

      <div className="en-row">
        <p className="en-k"><b>{t("Read-out")}</b>{t("Every month")}</p>
        <ol className="en-cells">
          {weeks.map((i) => (
            <li key={i} style={{ "--i": i }}>{i % 4 === 3 && <span className="en-read" />}</li>
          ))}
        </ol>
      </div>

      <div className="en-row en-row-grow">
        <p className="en-k"><b>{t("Your brand")}</b>{t("Compounds")}</p>
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
        <span className="en-trust">{t("Weeks 1–12 · the trust period — full work, no commitment")}</span>
        <span className="en-note">{t("The curve is the shape, not a forecast.")}</span>
      </div>
    </Reveal>
  );
}

export const ENGINE_CSS = `
  .en {
    --en-k: 150px;
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
  .en-meet, .en-content, .en-read {
    opacity: 0; transform: scale(0.6);
    transition: opacity 0.4s ease calc(0.2s + var(--i) * 0.07s), transform 0.5s cubic-bezier(0.16,1,0.3,1) calc(0.2s + var(--i) * 0.07s);
  }
  .en-meet {
    width: 100%; max-width: 64px; height: 30px; border-radius: 8px; background: #000; color: #fff;
    display: grid; place-items: center; font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums;
  }
  .en-content { display: flex; gap: 3px; }
  .en-content i { width: 9px; height: 16px; border-radius: 3px; background: #D9480F; }
  .en-content i:nth-child(2) { opacity: 0.7; }
  .en-content i:nth-child(3) { opacity: 0.45; }
  .en-read { width: 14px; height: 14px; transform: rotate(45deg) scale(0.6); border-radius: 3px; background: #000; }
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
  .pc-reveal.is-in .en-read { opacity: 1; transform: rotate(45deg); }
  .pc-reveal.is-in .en-line { stroke-dashoffset: 0; }
  .pc-reveal.is-in .en-area, .pc-reveal.is-in .en-curve-tag { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .en-meet, .en-content, .en-read, .en-line, .en-area, .en-curve-tag { transition: none; }
  }

  @media (max-width: 760px) {
    .en { --en-k: 0px; padding: 18px 14px; gap: 4px; }
    .en-k { position: static; width: auto; display: flex; gap: 8px; align-items: baseline; margin: 10px 0 6px; }
    .en-k b { font-size: 14px; }
    .en-row { display: block; min-height: 0; }
    .en-cells { gap: 3px; }
    .en-cells li { min-height: 24px; }
    .en-meet { height: 22px; border-radius: 5px; font-size: 10px; }
    .en-content { gap: 1px; }
    .en-content i { width: 6px; height: 12px; border-radius: 2px; }
    .en-read { width: 10px; height: 10px; }
    .en-row-grow { min-height: 0; }
    .en-row-grow .en-curve { height: 140px; }
    .en-curve { margin-left: 0; }
    .en-foot { margin-left: 0; flex-direction: column; }
  }
`;
