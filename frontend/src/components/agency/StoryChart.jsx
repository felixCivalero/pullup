import { STIGA_ROWS } from "./agencyData.js";
import { useT } from "./i18n.js";

/* One small chart per story, drawn from the story's own numbers (agencyData
   CASES[].chart) — never decoration: every bar is a real figure. Plain
   HTML/CSS, coloured by the story's --sc accent; bars grow in when the
   surrounding <Reveal> turns .is-in. */

const compact = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n);

function Time({ rows }) {
  const t = useT();
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <figure className="sc">
      <figcaption className="sc-cap">{t("Time to make one piece of content")}</figcaption>
      <div className="sc-hbars">
        {rows.map(([k, v, label], i) => (
          <div key={k} className={`sc-hrow${i === rows.length - 1 ? " is-hot" : ""}`}>
            <span className="sc-hk">{t(k)}</span>
            <span className="sc-track"><span className="sc-bar" style={{ "--w": v / max, "--i": i }} /></span>
            <span className="sc-hv">{t(label)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function Grow({ from, to, note }) {
  const t = useT();
  return (
    <figure className="sc">
      <figcaption className="sc-cap">{t("Followers, start to now")}</figcaption>
      <div className="sc-grow">
        <div className="sc-col">
          <span className="sc-col-bar is-stub" />
          <span className="sc-col-v">{t(from[0])}</span>
          <span className="sc-col-l">{t("Start")}</span>
        </div>
        <div className="sc-col is-hot">
          <span className="sc-col-bar" style={{ "--h": 1, "--i": 1 }} />
          <span className="sc-col-v">{t(to[0])}</span>
          <span className="sc-col-l">{t("Now")}</span>
        </div>
      </div>
      {note && <p className="sc-note">{t(note)}</p>}
    </figure>
  );
}

function Channels() {
  const t = useT();
  const max = Math.max(...STIGA_ROWS.map((r) => r.views));
  return (
    <figure className="sc">
      <figcaption className="sc-cap">{t("Views per channel · Dec 2024 – Jun 2025")}</figcaption>
      <div className="sc-hbars">
        {STIGA_ROWS.map((r, i) => (
          <div key={r.channel} className="sc-hrow is-hot">
            <span className="sc-hk">{r.channel}</span>
            <span className="sc-track"><span className="sc-bar" style={{ "--w": r.views / max, "--i": i }} /></span>
            <span className="sc-hv">{compact(r.views)}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function Path({ steps }) {
  const t = useT();
  return (
    <figure className="sc">
      <figcaption className="sc-cap">{t("The road, step by step")}</figcaption>
      <ol className="sc-path" style={{ "--n": steps.length }}>
        {steps.map((s, i) => (
          <li key={s} className={i === steps.length - 1 ? "is-hot" : undefined} style={{ "--i": i }}>
            <span className="sc-dot" />
            <span className="sc-path-l">{t(s)}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function Walks({ rows }) {
  const t = useT();
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <figure className="sc">
      <figcaption className="sc-cap">{t("People who pulled up, per photo walk")}</figcaption>
      <div className="sc-cols">
        {rows.map(([vol, n], i) => (
          <div key={vol} className="sc-col is-hot">
            <span className="sc-col-v">{n}</span>
            <span className="sc-col-bar" style={{ "--h": n / max, "--i": i }} />
            <span className="sc-col-l">{t("Vol.")} {vol}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function Week({ on, note }) {
  const t = useT();
  return (
    <figure className="sc">
      <figcaption className="sc-cap">{t("Nights of live music, every week")}</figcaption>
      <div className="sc-week">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className={`sc-night${i < on ? " is-hot" : ""}`} style={{ "--i": i }} />
        ))}
        <span className="sc-week-v">{on} / 7</span>
      </div>
      {note && <p className="sc-note">{t(note)}</p>}
    </figure>
  );
}

const CHARTS = { time: Time, grow: Grow, channels: Channels, path: Path, walks: Walks, week: Week };

export function StoryChart({ chart }) {
  const C = chart && CHARTS[chart.type];
  return C ? <C {...chart} /> : null;
}

export const STORY_CHART_CSS = `
  .sc { margin: 0; min-width: 0; }
  .sc-cap { font-size: 12px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--pc-grey); margin-bottom: 18px; }
  .sc-note { margin-top: 14px; font-size: 14px; font-weight: 600; color: var(--sc); }

  .sc-hbars { display: grid; gap: 12px; }
  .sc-hrow { display: grid; grid-template-columns: 84px 1fr auto; align-items: center; gap: 12px; }
  .sc-hk { font-size: 14px; color: #444; }
  .sc-hv { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; min-width: 4.5ch; text-align: right; }
  .sc-hrow.is-hot .sc-hv { color: var(--sc); }
  .sc-track { height: 14px; border-radius: 99px; background: #f0f0ee; overflow: hidden; }
  .sc-bar {
    display: block; height: 100%; border-radius: 99px; background: #c9c9c6;
    width: max(6px, calc(var(--w) * 100%));
    transform-origin: left; transform: scaleX(0);
    transition: transform 1.1s cubic-bezier(0.16,1,0.3,1) calc(0.25s + var(--i, 0) * 0.12s);
  }
  .sc-hrow.is-hot .sc-bar { background: var(--sc); }

  .sc-grow, .sc-cols { display: flex; align-items: flex-end; gap: 10px; height: 168px; }
  .sc-grow { gap: 18px; }
  .sc-col { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; gap: 6px; text-align: center; }
  .sc-col-bar {
    display: block; border-radius: 8px 8px 3px 3px; background: #c9c9c6;
    height: max(4px, calc(var(--h, 0) * 100%));
    transform-origin: bottom; transform: scaleY(0);
    transition: transform 1.1s cubic-bezier(0.16,1,0.3,1) calc(0.25s + var(--i, 0) * 0.1s);
  }
  .sc-cols .sc-col-bar { height: max(4px, calc(var(--h, 0) * (100% - 44px))); }
  .sc-col-bar.is-stub { height: 4px; }
  .sc-col.is-hot .sc-col-bar { background: var(--sc); }
  .sc-col-v { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .sc-grow .sc-col-v { font-size: clamp(22px, 2.4vw, 30px); letter-spacing: -0.03em; order: -1; }
  .sc-grow .sc-col.is-hot .sc-col-v { color: var(--sc); }
  .sc-grow .sc-col-bar { order: 0; flex: 1; }
  .sc-grow .sc-col-bar.is-stub { flex: none; }
  .sc-col-l { font-size: 12px; color: var(--pc-grey); white-space: nowrap; }

  .sc-path { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(var(--n), 1fr); position: relative; }
  .sc-path::before { content: ""; position: absolute; left: 9px; right: 9px; top: 9px; height: 2px; background: #e4e4e1; }
  .sc-path li { position: relative; display: grid; justify-items: start; gap: 12px; }
  .sc-path li:last-child { justify-items: end; text-align: right; }
  .sc-dot {
    width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2px solid var(--sc);
    transform: scale(0); transition: transform 0.5s cubic-bezier(0.16,1,0.3,1) calc(0.25s + var(--i) * 0.18s);
  }
  .sc-path li.is-hot .sc-dot { background: var(--sc); box-shadow: 0 0 0 6px color-mix(in srgb, var(--sc) 18%, transparent); }
  .sc-path-l { font-size: 13px; color: #444; }
  .sc-path li.is-hot .sc-path-l { font-size: 15px; font-weight: 700; color: var(--sc); }

  .sc-week { display: flex; align-items: center; gap: 8px; }
  .sc-night {
    flex: 1; height: 56px; border-radius: 10px; background: #f0f0ee;
    transform: scaleY(0.2); transform-origin: bottom; opacity: 0;
    transition: transform 0.7s cubic-bezier(0.16,1,0.3,1) calc(0.25s + var(--i) * 0.08s), opacity 0.4s ease calc(0.25s + var(--i) * 0.08s);
  }
  .sc-night.is-hot { background: var(--sc); }
  .sc-week-v { margin-left: 8px; font-size: 22px; font-weight: 600; letter-spacing: -0.03em; color: var(--sc); white-space: nowrap; }

  .pc-reveal.is-in .sc-bar { transform: scaleX(1); }
  .pc-reveal.is-in .sc-col-bar { transform: scaleY(1); }
  .pc-reveal.is-in .sc-dot { transform: scale(1); }
  .pc-reveal.is-in .sc-night { transform: none; opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .sc-bar, .sc-col-bar, .sc-dot, .sc-night { transition: none; transform: none; opacity: 1; }
  }
  @media (max-width: 640px) {
    .sc-hrow { grid-template-columns: 72px 1fr auto; gap: 10px; }
    .sc-cols { gap: 6px; }
    .sc-path-l { font-size: 11px; }
    .sc-path li.is-hot .sc-path-l { font-size: 13px; }
    .sc-night { height: 44px; border-radius: 8px; }
  }
`;
