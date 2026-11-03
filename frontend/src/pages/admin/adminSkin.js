// The admin's finish: the same pages, the same words, with the front page's
// hardware look on top — 90s internet and modern at once. A grey toolbar with
// a pressed tab for the page you're on, windows with a title bar in mono, pink
// lamps, sunken fields and bevelled keys; the headlines stay big and modern.
// Scoped under .ad so it sits on every admin page without touching their CSS.
export const ADMIN_SKIN = `
  .ad { --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace; --panel: linear-gradient(180deg, #ecebe6 0%, #d9d8d3 100%); --line: #9b9a95; --edge: #7d7c77; --paper: #fbfaf7; --pink: #ec178f;
    background-color: #efeee9;
    background-image: radial-gradient(rgba(0,0,0,0.07) 1px, transparent 1px);
    background-size: 18px 18px; }
  body:has(.ad) { background: #efeee9; }

  /* ─── the toolbar ─── */
  .ad .ad-bar { background: var(--panel); backdrop-filter: none; border-bottom: 1px solid var(--edge); box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 1px 0 rgba(255,255,255,.6); }
  .ad .ad-bar nav { gap: 2px; padding: 2px; }
  .ad .ad-bar nav a { display: inline-flex; align-items: center; gap: 7px; padding: 7px 11px; border-radius: 5px; border: 1px solid transparent; font-family: var(--mono); font-size: 11.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: #4a4945; }
  .ad .ad-bar nav a:hover { color: #0a0a0a; border-color: rgba(0,0,0,.18); background: rgba(255,255,255,.45); }
  .ad .ad-bar nav a.is-on { color: #0a0a0a; background: #d0cfca; border-color: var(--edge); box-shadow: inset 0 2px 3px rgba(0,0,0,.22), 0 1px 0 rgba(255,255,255,.8); }
  .ad .ad-bar nav a.is-on::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--pink); box-shadow: 0 0 0 1px rgba(0,0,0,.25), 0 0 7px var(--pink); }
  .ad .ad-stockholm { font-family: var(--mono); font-size: 11.5px; letter-spacing: .07em; text-transform: uppercase; border-radius: 5px; }
  .ad .ad-bar button.ad-out { font-family: var(--mono); font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: #4a4945; }

  /* the brand switcher: a key on the toolbar */
  .ad .bs-btn { border-radius: 6px !important; border: 1px solid var(--edge) !important; background: linear-gradient(180deg, #fbfaf7, #e2e1dc) !important; box-shadow: inset 0 1px 0 #fff, 0 1px 0 rgba(0,0,0,.12); font-family: var(--mono); font-size: 12px !important; letter-spacing: .04em; text-transform: uppercase; }
  .ad .bs-menu { border-radius: 8px !important; border: 1px solid var(--edge) !important; box-shadow: 3px 3px 0 rgba(0,0,0,.14), 0 18px 40px -20px rgba(0,0,0,.4) !important; }

  /* ─── the page ─── */
  .ad .ea-brand { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 8px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 4px; background: rgba(255,255,255,.6); font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #3a3935; }
  .ad .mg-kicker { display: inline-flex; align-items: center; gap: 8px; padding: 3px 8px; border: 1px solid var(--line); border-radius: 4px; background: rgba(255,255,255,.6); font-family: var(--mono); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #3a3935; }
  .ad .ea-brand::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: var(--pink); box-shadow: 0 0 0 1px rgba(0,0,0,.2), 0 0 6px var(--pink); }
  .ad .ea h1 { letter-spacing: -0.045em; }
  .ad .ea h2 { display: flex; align-items: center; gap: 12px; }
  .ad .ea h2::after { content: ""; flex: 1; height: 1px; background: linear-gradient(90deg, var(--line), transparent); }
  .ad .ea-head h2::after, .ad .ea-modal h2::after, .ad .mg h1::after { display: none; }
  .ad .ea-muted { color: #5f5e5a; }

  /* keys */
  .ad .ea-btn { border-radius: 6px; border: 1px solid var(--edge); background: linear-gradient(180deg, #fbfaf7, #dddcd7); color: #111; font-family: var(--mono); font-size: 11.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; box-shadow: inset 0 1px 0 #fff, 0 1px 0 rgba(0,0,0,.18); transition: transform .08s ease, background .15s ease; }
  .ad .ea-btn:hover { border-color: #111; }
  .ad .ea-btn:active { transform: translateY(1px); box-shadow: inset 0 2px 3px rgba(0,0,0,.18); }
  .ad .ea-btn.is-dark { background: linear-gradient(180deg, #2a2a2a, #0d0d0d); color: #f2f1ec; border-color: #000; box-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 2px 0 rgba(0,0,0,.25); }
  .ad .ea-btn.is-dark:hover { background: linear-gradient(180deg, #f43aa5, #d90f80); color: #111; border-color: #8a0a52; }
  .ad .ea-btn.is-green { background: linear-gradient(180deg, #2b9a4c, #1a6a32); border-color: #124d24; color: #fff; }

  /* segmented tabs */
  .ad .ea-tabs { gap: 0; display: inline-flex; flex-wrap: wrap; padding: 3px; border: 1px solid var(--edge); border-radius: 7px; background: var(--panel); box-shadow: inset 0 1px 0 rgba(255,255,255,.8); }
  .ad .ea-tabs button { border: 1px solid transparent; border-radius: 5px; background: none; font-family: var(--mono); font-size: 11.5px; letter-spacing: .05em; text-transform: uppercase; color: #3a3935; padding: 6px 11px; }
  .ad .ea-tabs button small { font-family: var(--mono); }
  .ad .ea-tabs button.is-on { background: #0d0d0d; color: #f2f1ec; border-color: #000; box-shadow: inset 0 1px 0 rgba(255,255,255,.15); }
  .ad .ea-tabs + .ea-tabs, .ad .ea-tabs { margin-right: 6px; }

  /* sunken fields */
  .ad .ea-input, .ad .ea-field input, .ad .ea-field textarea, .ad .ea-field select, .ad .ea-search { border: 1px solid var(--line); border-radius: 6px; background: var(--paper); box-shadow: inset 0 2px 3px rgba(0,0,0,.08); }
  .ad .ea-input:focus, .ad .ea-field input:focus, .ad .ea-field textarea:focus, .ad .ea-field select:focus, .ad .ea-search:focus { border-color: #111; box-shadow: inset 0 2px 3px rgba(0,0,0,.08), 0 0 0 2px var(--pink); }
  .ad .ea-field { font-family: var(--mono); font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: #4a4945; }
  .ad .ea-field input, .ad .ea-field textarea, .ad .ea-field select { font-family: "Inter Tight", -apple-system, sans-serif; text-transform: none; letter-spacing: 0; }

  /* status chips: printed labels with a lamp */
  .ad .ea-chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 4px; border: 1px solid currentColor; background: rgba(255,255,255,.7); font-family: var(--mono); font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; }
  .ad .ea-chip.is-live::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #1f9a4a; box-shadow: 0 0 6px #1f9a4a; }
  .ad .ea-chip.is-draft::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: #D9480F; }

  /* ─── windows: every card a panel with a title bar ─── */
  .ad .st-card, .ad .ea-wrap:not(.st-card .ea-wrap), .ad .evl-first, .ad .ed-design, .ad .ea-modal, .ad .mg-list button {
    border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 3px 3px 0 rgba(0,0,0,.07); }
  .ad .st-card { padding: 0 16px 16px; overflow: hidden; }
  .ad .st-card-head { margin: 0 -16px 14px; padding: 8px 14px; background: var(--panel); border-bottom: 1px solid var(--line); box-shadow: inset 0 1px 0 rgba(255,255,255,.85); align-items: center; }
  .ad .st-card-head h3 { display: flex; align-items: center; gap: 9px; font-family: var(--mono); font-size: 11.5px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; }
  .ad .st-card-head h3::before { content: ""; width: 22px; height: 7px; background: repeating-linear-gradient(90deg, #8f8e89 0 1px, transparent 1px 3px); opacity: .8; }
  .ad .st-read { font-family: var(--mono); font-size: 11px; letter-spacing: .02em; color: #4a4945; }
  .ad .st-axis-label { font-family: var(--mono); }
  .ad .st-bars i { border-radius: 2px 2px 0 0; box-shadow: inset 0 1px 0 rgba(255,255,255,.35); }

  /* number tiles: a readout each */
  .ad .st-tiles > div, .ad .ed-stats > div { position: relative; border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 3px 3px 0 rgba(0,0,0,.07); padding-top: 12px; }
  .ad .st-tiles > div::after, .ad .ed-stats > div::after { content: ""; position: absolute; top: 10px; right: 10px; width: 6px; height: 6px; border-radius: 50%; background: #c9c8c3; box-shadow: 0 0 0 1px rgba(0,0,0,.18); }
  .ad .st-tiles > div:first-child::after, .ad .ed-stats > div:first-child::after { background: var(--pink); box-shadow: 0 0 0 1px rgba(0,0,0,.2), 0 0 6px var(--pink); }
  .ad .st-tiles span, .ad .ed-stats span { font-family: var(--mono); font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: #4a4945; }
  .ad .st-tiles small { font-family: var(--mono); font-size: 10.5px; color: #7a7975; }
  .ad .st-tiles b, .ad .ed-stats b { font-size: 30px; letter-spacing: -0.03em; }
  .ad .ed-stats > div { display: flex; flex-direction: column-reverse; justify-content: flex-end; }

  /* tables: a printout */
  .ad .ea-wrap { background: #fff; }
  .ad .ea-table th { background: var(--panel); border-bottom: 1px solid var(--line); font-family: var(--mono); font-size: 10.5px; letter-spacing: .07em; text-transform: uppercase; color: #3a3935; padding: 9px 10px; }
  .ad .ea-table td { padding: 10px; border-bottom: 1px solid #ebeae5; }
  .ad .ea-table tbody tr:nth-child(even) td { background: #fcfbf8; }
  .ad .ea-table tr.is-click:hover td { background: #fdeef6; }
  .ad .st-card .ea-wrap { border: 1px solid var(--line); border-radius: 6px; box-shadow: none; }

  /* the event list: each event a window */
  .ad .evl button { border: 1px solid var(--line); border-radius: 8px; box-shadow: 3px 3px 0 rgba(0,0,0,.07); transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease; }
  .ad .evl button:hover { border-color: #111; transform: translate(-1px, -1px); box-shadow: 4px 4px 0 rgba(0,0,0,.12); }
  .ad .evl img, .ad .evl-noimg { border-radius: 5px; border: 1px solid var(--line); background: repeating-linear-gradient(135deg, #ecebe6 0 6px, #e2e1dc 6px 12px); }
  .ad .evl-nums { font-family: var(--mono); font-size: 11px; }
  .ad .evl-first { border-style: solid; padding: 26px; }
  .ad .evl-family { border-bottom: 0; }
  .ad .evl-family button { border-radius: 5px; font-family: var(--mono); font-size: 11.5px; letter-spacing: .04em; text-transform: uppercase; border-color: var(--line); background: linear-gradient(180deg, #fbfaf7, #e9e8e3); }
  .ad .evl-family button.is-on { background: #0d0d0d; color: #f2f1ec; border-color: #000; }
  .ad .evl-brand { border-radius: 4px; font-family: var(--mono); font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; border: 1px solid var(--line); background: #f3f2ee; }
  .ad .evl-brand.is-main { border-color: #000; }

  /* drawers and modals: windows too */
  .ad .pp-drawer { border-left: 1px solid var(--edge); box-shadow: -4px 0 0 rgba(0,0,0,.06), -10px 0 40px rgba(0,0,0,.12); }
  .ad .pp-facts > div { border-color: var(--line); border-radius: 6px; box-shadow: 2px 2px 0 rgba(0,0,0,.06); }
  .ad .pp-drawer h3 { font-family: var(--mono); }

  /* Agenter and Team: the same windows, sunken fields and labels */
  .ad .ag-card { border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 3px 3px 0 rgba(0,0,0,.07); }
  .ad .ag-card h2 { margin-top: 0; }
  .ad .ag-copy code { border: 1px solid var(--line); border-radius: 6px; background: var(--paper); box-shadow: inset 0 2px 3px rgba(0,0,0,.08); }
  .ad .tm-list { border: 1px solid var(--line); border-radius: 8px; background: #fff; box-shadow: 3px 3px 0 rgba(0,0,0,.07); }
  .ad .tm-you { border-radius: 4px; border: 1px solid var(--line); font-family: var(--mono); font-size: 10px; letter-spacing: .06em; text-transform: uppercase; }
  .ad .tm-role { font-family: var(--mono); font-size: 11px; letter-spacing: .05em; text-transform: uppercase; }
  .ad .tm-invite input { border: 1px solid var(--line) !important; border-radius: 6px !important; background: var(--paper) !important; box-shadow: inset 0 2px 3px rgba(0,0,0,.08); }
  .ad .tm-invite input:focus { border-color: #111 !important; box-shadow: inset 0 2px 3px rgba(0,0,0,.08), 0 0 0 2px var(--pink); outline: none; }
  .ad .ea-modal { border-radius: 10px; box-shadow: 5px 5px 0 rgba(0,0,0,.15), 0 30px 60px -20px rgba(0,0,0,.4); }

  /* the move row and the yes-labels */
  .ad .ed-move { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); box-shadow: inset 0 1px 0 rgba(255,255,255,.85); }
  .ad .ed-move.is-stuck { background: linear-gradient(180deg, #fff2f9, #fbdcee); border-color: rgba(236,23,143,.55); }
  .ad .pp-yes span:not(.ea-muted) { border-radius: 4px; border: 1px solid var(--line); font-family: var(--mono); font-size: 10.5px; letter-spacing: .04em; text-transform: uppercase; }

  @media (max-width: 520px) {
    .ad .ad-bar nav a { padding: 7px 8px; font-size: 10.5px; letter-spacing: .04em; }
    .ad .ad-bar nav a.is-on::before { display: none; }
  }
  @media (prefers-reduced-motion: reduce) { .ad .evl button, .ad .ea-btn { transition: none; } }
`;
