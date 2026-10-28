// Shared look for the event platform's admin pages (Event, one event, CRM) —
// same language as Sälj and Statistik.
export const EVENT_ADMIN_CSS = `
  .ea { max-width: 1080px; margin: 0 auto; padding: clamp(24px, 5vw, 48px) 16px 72px; }
  .ea-brand { margin: 0 0 2px; font-size: 13px; font-weight: 600; letter-spacing: 0.01em; color: #6e6e73; }
  .ea-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
  .ea h1 { margin: 0; font-size: clamp(28px, 5vw, 40px); font-weight: 700; letter-spacing: -0.035em; }
  .ea h2 { margin: 40px 0 10px; font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .ea-muted { margin: 4px 0 0; color: #6e6e73; font-size: 14px; }
  .ea-btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13.5px; font-weight: 600; padding: 9px 15px; border-radius: 999px; border: 1px solid rgba(0,0,0,0.14); background: #fff; color: #0a0a0a; cursor: pointer; text-decoration: none; white-space: nowrap; }
  .ea-btn:hover { border-color: rgba(0,0,0,0.3); }
  .ea-btn:disabled { opacity: 0.45; cursor: default; }
  .ea-btn.is-dark { background: #0a0a0a; color: #fff; border-color: #0a0a0a; }
  .ea-btn.is-green { background: #1f7a3a; color: #fff; border-color: #1f7a3a; }
  .ea-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; }
  .ea-tabs button { font: inherit; font-size: 13px; font-weight: 600; padding: 6px 12px; border: 1px solid rgba(0,0,0,0.12); border-radius: 999px; background: #fff; color: #3a3a3e; cursor: pointer; }
  .ea-tabs button small { color: #6e6e73; font-weight: 500; margin-left: 4px; }
  .ea-tabs button.is-on { background: #0a0a0a; border-color: #0a0a0a; color: #fff; }
  .ea-tabs button.is-on small { color: rgba(255,255,255,0.7); }
  .ea-chip { display: inline-block; font-size: 11.5px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: #f0f0f0; color: #3a3a3e; white-space: nowrap; }
  .ea-chip.is-live { background: rgba(31,122,58,0.12); color: #1f7a3a; }
  .ea-chip.is-draft { background: rgba(217,72,15,0.1); color: #D9480F; }
  .ea-chip.is-past { background: #f0f0f0; color: #8a8a8e; }
  .ea-dot { display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: #d4d4d8; }
  .ea-dot.is-on { background: #1f7a3a; }
  .ea-input, .ea-field input, .ea-field textarea, .ea-field select, .ea-search { font: inherit; font-size: 15px; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.16); border-radius: 10px; background: #fff; color: #0a0a0a; outline: none; box-sizing: border-box; width: 100%; }
  .ea-field textarea { resize: vertical; min-height: 120px; line-height: 1.5; }
  .ea-field input:focus, .ea-field textarea:focus, .ea-field select:focus, .ea-search:focus { border-color: #0a0a0a; }
  .ea-field { display: grid; gap: 6px; font-size: 12.5px; font-weight: 600; color: #6e6e73; }
  .ea-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  @media (max-width: 560px) { .ea-row { grid-template-columns: 1fr; } }
  .ea-table { width: 100%; border-collapse: collapse; font-size: 14px; font-variant-numeric: tabular-nums; }
  .ea-table th { text-align: left; font-size: 12px; font-weight: 600; color: #6e6e73; padding: 8px 8px; border-bottom: 1px solid rgba(0,0,0,0.12); white-space: nowrap; }
  .ea-table td { padding: 9px 8px; border-bottom: 1px solid rgba(0,0,0,0.06); vertical-align: middle; }
  .ea-table tr.is-click { cursor: pointer; }
  .ea-table tr.is-click:hover td { background: #fafafa; }
  .ea-table .num { text-align: right; }
  .ea-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .ea-error { color: #D9480F; font-size: 14px; margin: 8px 0 0; }
  .ea-ok { color: #1f7a3a; font-size: 14px; margin: 8px 0 0; }
  .ea-modal-bg { position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.35); display: grid; place-items: center; padding: 16px; }
  .ea-modal { width: min(480px, 100%); background: #fff; border-radius: 18px; padding: 22px; display: grid; gap: 14px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); }
  .ea-modal h2 { margin: 0; }
  .ea-modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
`;
