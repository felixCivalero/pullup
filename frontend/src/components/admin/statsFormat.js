// Number formats, source names and the CSS for the statistics (Stats.jsx).
const nf = new Intl.NumberFormat("sv-SE");
export const fmt = (n) => (n == null ? "–" : nf.format(n));
export const pct = (x) => (x == null ? "–" : `${Math.round(x * 1000) / 10} %`.replace(".", ","));

export const SOURCE_SV = {
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", linkedin: "LinkedIn", google: "Google",
  ai: "AI-svar", mail: "Mejl", pullup: "pullup.se", direct: "Direkt / delad länk", unknown: "Okänd",
};
export const DEVICE_SV = { mobile: "Mobil", desktop: "Dator", tablet: "Surfplatta", unknown: "Okänd" };

export const STATS_CSS = `
  .st-tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; margin: 0 0 14px; }
  .st-tiles > div { display: grid; gap: 2px; padding: 12px 14px; border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; background: #fff; }
  .st-tiles span { font-size: 12.5px; color: #6e6e73; }
  .st-tiles b { font-size: 26px; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .st-tiles small { font-size: 12px; color: #8a8a8e; }
  @media (max-width: 860px) { .st-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  .st-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 10px; margin: 0 0 14px; }
  @media (max-width: 760px) { .st-grid { grid-template-columns: 1fr; } }
  .st-card { border: 1px solid rgba(0,0,0,0.1); border-radius: 14px; padding: 14px 16px 16px; background: #fff; margin: 0 0 14px; min-width: 0; }
  .st-grid .st-card { margin: 0; }
  .st-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin: 0 0 10px; }
  .st-card h3 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: -0.01em; }
  .st-read { margin: 0; font-size: 12.5px; color: #6e6e73; font-variant-numeric: tabular-nums; text-align: right; }
  .st-read b { color: #0a0a0a; }
  .st-axis-label { margin: 8px 0 4px; font-size: 11px; font-weight: 600; color: #8a8a8e; text-transform: uppercase; letter-spacing: 0.05em; }
  .st-bars { position: relative; display: flex; align-items: flex-end; border-bottom: 1px solid rgba(0,0,0,0.12); }
  .st-bars button { all: unset; box-sizing: border-box; height: 100%; display: flex; align-items: flex-end; justify-content: center; padding: 0 1px; cursor: default; }
  .st-bars i { display: block; width: 100%; max-width: 18px; background: #ec178f; border-radius: 3px 3px 0 0; }
  .st-bars button.is-hover { background: rgba(0,0,0,0.04); }
  .st-bars button.is-hover i { background: #b80f6f; }
  .st-bars + .st-axis-label + .st-bars i { background: #0a0a0a; }
  .st-bars + .st-axis-label + .st-bars button.is-hover i { background: #3a3a3c; }
  .st-max { position: absolute; top: -2px; right: 0; font-size: 10.5px; color: #8a8a8e; font-variant-numeric: tabular-nums; pointer-events: none; }
  .st-days { display: flex; justify-content: space-between; margin-top: 6px; font-size: 11.5px; color: #8a8a8e; }
  .st-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 7px; }
  .st-list li { display: grid; grid-template-columns: minmax(90px, 140px) minmax(0, 1fr) 44px 38px; align-items: center; gap: 10px; font-size: 13.5px; }
  .st-list-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st-list-bar { height: 8px; border-radius: 4px; background: #f2f1ee; overflow: hidden; }
  .st-list-bar i { display: block; height: 100%; border-radius: 4px; background: #ec178f; }
  .st-list b { text-align: right; font-variant-numeric: tabular-nums; }
  .st-list small { text-align: right; color: #8a8a8e; font-variant-numeric: tabular-nums; }
  .st-empty, .st-note { margin: 4px 0 0; font-size: 13px; }
  .st-table td.num, .st-table th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .st-table .st-inline { display: inline-block; vertical-align: middle; width: 70px; height: 6px; margin-left: 8px; border-radius: 3px; background: #f2f1ee; overflow: hidden; }
  .st-table .st-inline i { display: block; height: 100%; background: #ec178f; }
`;
