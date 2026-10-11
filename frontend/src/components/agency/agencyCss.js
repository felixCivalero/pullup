// Shared styles for the agency site — the landing and every /work case page
// render inside .agency-root and use these tokens, nav, type and buttons.
// Page-specific CSS lives with each page.
export const AGENCY_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap');

  html, body { overflow-x: clip; }
  body.pullup-auth-locked { overflow: hidden; }

  /* the eyes are the cursor once EyesCursor has drawn them (mouse/trackpad only) */
  html.eyes-cursor-on .pc, html.eyes-cursor-on .pc * { cursor: none !important; }

  .agency-root {
    --pc-black: #000;
    --pc-white: #fff;
    --pc-grey: #6b6b6b;
    --pc-line: rgba(0,0,0,0.12);
    --pc-line-dark: rgba(255,255,255,0.16);
    min-height: 100dvh;
    background: var(--pc-white);
    color: var(--pc-black);
    font-family: "Inter Tight", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow-x: clip;
  }
  .pc { width: 100%; }
  .pc *, .pc *::before, .pc *::after { box-sizing: border-box; }
  :where(.pc) :where(p, h1, h2, h3, figure, blockquote, ol) { margin: 0; }
  .pc h1, .pc h2, .pc h3 { text-wrap: balance; }
  .pc p, .pc blockquote { text-wrap: pretty; }
  .pc button, .pc a { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
  .agency-root { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
  .pc :focus-visible { outline: 2px solid currentColor; outline-offset: 3px; }

  .pc-wrap {
    width: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 0 clamp(16px, 5vw, 56px);
  }

  .pc-reveal {
    opacity: 0;
    transform: translateY(18px);
    transition: opacity 0.9s ease, transform 0.9s cubic-bezier(0.16,1,0.3,1);
  }
  .pc-reveal.is-in { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) {
    .pc-reveal { opacity: 1; transform: none; transition: none; }
  }

  /* ─── nav: takes the tone of the section beneath it ─── */
  .pc-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 50;
    height: 64px;
    padding: env(safe-area-inset-top, 0px) clamp(16px, 5vw, 56px) 0;
    box-sizing: content-box;
    display: flex; align-items: center; justify-content: space-between;
    border-bottom: 1px solid transparent;
    transition: background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease;
  }
  .pc-nav.is-dark { color: #fff; }
  .pc-nav.is-light { color: #000; }
  .pc-nav.is-scrolled.is-dark { background: rgba(0,0,0,0.88); border-bottom-color: rgba(255,255,255,0.08); }
  .pc-nav.is-scrolled.is-light { background: rgba(255,255,255,0.9); border-bottom-color: rgba(0,0,0,0.08); }
  .pc-nav.is-scrolled { backdrop-filter: saturate(1.4) blur(14px); -webkit-backdrop-filter: saturate(1.4) blur(14px); }
  .pc-nav-brand {
    background: none; border: 0; padding: 10px 0; margin: -10px 0;
    display: flex; cursor: pointer;
  }
  .pc-nav-brand img { height: 22px; width: auto; display: block; transition: filter 0.25s ease; }
  .pc-nav.is-dark .pc-nav-brand img { filter: brightness(0) invert(1); }
  .pc-nav.is-light .pc-nav-brand img { filter: brightness(0); }
  .pc-nav-login {
    background: none; border: 1px solid currentColor; color: inherit;
    font: inherit; font-size: 14px; font-weight: 500; letter-spacing: 0.01em;
    min-height: 40px; padding: 0 18px; border-radius: 999px; cursor: pointer;
    position: relative;
    transition: background-color 0.2s ease, color 0.2s ease;
  }
  /* 44px hit area without a bigger pill */
  .pc-nav-login::after { content: ""; position: absolute; inset: -4px -6px; }
  .pc-nav.is-dark .pc-nav-login:hover { background: #fff; color: #000; }
  .pc-nav.is-light .pc-nav-login:hover { background: #000; color: #fff; }

  /* ─── shared type ─── */
  .pc-dark { background: var(--pc-black); color: var(--pc-white); }
  .pc-section { padding: clamp(80px, 12vw, 160px) 0; }
  .pc-rule { border-top: 1px solid var(--pc-line); }
  .pc-label {
    display: flex; gap: 14px; align-items: baseline;
    font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase;
    color: var(--pc-grey);
    margin-bottom: clamp(32px, 5vw, 56px);
  }
  .pc-label span { color: inherit; font-variant-numeric: tabular-nums; }
  .pc-dark .pc-label { color: rgba(255,255,255,0.5); }
  .pc-h2 {
    font-size: clamp(32px, 5vw, 60px);
    font-weight: 600; line-height: 1.04; letter-spacing: -0.03em;
    max-width: 18ch;
    margin-bottom: clamp(40px, 6vw, 72px);
  }
  .pc-h2-xl { font-size: clamp(36px, 6.4vw, 84px); max-width: 20ch; }
  .pc-lead { font-size: clamp(20px, 2.2vw, 26px); line-height: 1.4; letter-spacing: -0.01em; }
  .pc-prose { display: grid; gap: 28px; font-size: 18px; line-height: 1.6; }
  .pc-split {
    display: grid; gap: clamp(32px, 6vw, 96px);
    grid-template-columns: 1fr;
  }
  @media (min-width: 900px) { .pc-split { grid-template-columns: 5fr 7fr; } }

  /* ─── buttons ─── */
  .pc-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 10px;
    font: inherit; font-size: 16px; font-weight: 600; letter-spacing: -0.005em;
    padding: 18px 28px; border-radius: 999px; cursor: pointer;
    text-decoration: none; border: 1px solid transparent;
    transition: transform 0.2s ease, opacity 0.2s ease, background 0.2s ease, color 0.2s ease;
  }
  .pc-btn:hover { transform: translateY(-1px); }
  .pc-btn svg { transition: transform 0.2s ease; }
  .pc-btn:hover svg { transform: translateX(3px); }
  .pc-btn-light { background: var(--pc-white); color: var(--pc-black); }
  .pc-btn-ghost { background: transparent; color: var(--pc-white); border-color: var(--pc-line-dark); }
  .pc-btn-ghost:hover { border-color: var(--pc-white); }

  .pc-nav-actions { display: flex; align-items: center; gap: clamp(14px, 2.4vw, 28px); }
  .pc-nav-link {
    background: none; border: 0; padding: 10px 2px; color: inherit; cursor: pointer;
    font: inherit; font-size: 14px; font-weight: 500; letter-spacing: 0.01em;
    text-decoration: none; opacity: 0.8; transition: opacity 0.2s ease;
  }
  .pc-nav-link:hover, .pc-nav-link[aria-current="page"] { opacity: 1; }
  @media (max-width: 520px) { .pc-nav-deck { display: none; } }

  .pc-eyebrow {
    font-size: 13px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase;
    color: rgba(255,255,255,0.55);
    margin-bottom: 28px;
  }

  /* ─── case link (inline "Read the case →") ─── */
  .pc-caselink {
    display: inline-flex; align-items: center; gap: 8px;
    margin-top: clamp(28px, 4vw, 44px);
    font-size: 15px; font-weight: 600; color: inherit; text-decoration: none;
    border-bottom: 1px solid currentColor; padding-bottom: 4px;
  }
  .pc-caselink svg { transition: transform 0.2s ease; }
  .pc-caselink:hover svg { transform: translateX(4px); }

  /* ─── close / offer ─── */
  .pc-close-sub {
    max-width: 52ch;
    font-size: clamp(18px, 1.8vw, 22px); line-height: 1.5; color: rgba(255,255,255,0.7);
  }
  .pc-offer {
    height: 100%;
    border: 1px solid var(--pc-line-dark); border-radius: 20px;
    padding: clamp(28px, 4vw, 48px);
    display: flex; flex-direction: column; gap: 20px;
  }
  .pc-offer-name { font-size: 15px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: rgba(255,255,255,0.6); }
  .pc-offer-price {
    font-size: clamp(48px, 6vw, 80px); font-weight: 600; line-height: 1; letter-spacing: -0.045em;
    font-variant-numeric: tabular-nums;
    display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 14px;
  }
  .pc-offer-price span { font-size: 16px; font-weight: 500; letter-spacing: 0; color: rgba(255,255,255,0.55); }
  .pc-offer-body { flex: 1; font-size: 17px; line-height: 1.55; color: rgba(255,255,255,0.75); max-width: 44ch; }
  .pc-offer .pc-btn { align-self: flex-start; margin-top: 8px; }

  .pc-close .pc-h2-xl { margin-bottom: 28px; }
  .pc-offer-one { margin-top: clamp(56px, 8vw, 96px); display: grid; grid-template-columns: 1fr; gap: clamp(32px, 4vw, 56px); }
  @media (min-width: 900px) { .pc-offer-one { grid-template-columns: 7fr 5fr; align-items: stretch; } }
  .pc-offer-main { display: flex; flex-direction: column; gap: 20px; }
  .pc-offer-terms { margin: 0; display: grid; align-content: center; border-top: 1px solid var(--pc-line-dark); }
  @media (min-width: 900px) { .pc-offer-terms { border-top: 0; border-left: 1px solid var(--pc-line-dark); padding-left: clamp(28px, 3vw, 48px); } }
  .pc-offer-terms > div { padding: 20px 0; border-bottom: 1px solid var(--pc-line-dark); }
  .pc-offer-terms > div:last-child { border-bottom: 0; }
  .pc-offer-terms dt { font-size: 12px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 6px; }
  .pc-offer-terms dd { margin: 0; font-size: 18px; line-height: 1.45; color: #fff; }

  /* ─── footer ─── */
  .pc-footer {
    background: var(--pc-black); color: rgba(255,255,255,0.45);
    border-top: 1px solid var(--pc-line-dark);
    padding: 28px clamp(16px, 5vw, 56px) calc(28px + env(safe-area-inset-bottom, 0px));
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px 24px;
    font-size: 13px;
  }
  .pc-footer nav { display: flex; flex-wrap: wrap; gap: 20px; }
  .pc-footer-work { color: rgba(255,255,255,0.7); }
  .pc-footer a { color: inherit; text-decoration: none; }
  .pc-footer a:hover { color: #fff; }





  /* ─── request dialog ─── */
  .rq-backdrop {
    position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.55);
    display: flex; align-items: center; justify-content: center; padding: 24px;
    animation: rq-fade 0.25s ease;
    -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
  }
  @keyframes rq-fade { from { opacity: 0; } }
  .rq {
    position: relative; width: 100%; max-width: 620px; max-height: calc(100dvh - 48px); overflow-y: auto;
    background: #fff; color: #000; border-radius: 24px; padding: clamp(24px, 4vw, 40px);
    box-shadow: 0 40px 100px -30px rgba(0,0,0,0.6);
    animation: rq-up 0.45s cubic-bezier(0.16,1,0.3,1);
    overscroll-behavior: contain;
  }
  @keyframes rq-up { from { transform: translateY(24px) scale(0.98); opacity: 0; } }
  .rq-close {
    position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; border-radius: 50%;
    border: 0; background: #f1f1ef; color: #000; display: grid; place-items: center; cursor: pointer;
  }
  .rq form { display: grid; gap: 16px; }
  .rq-k { font-size: 12px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pc-grey); }
  .rq-h { font-size: clamp(26px, 3.4vw, 34px); font-weight: 600; letter-spacing: -0.035em; line-height: 1.05; max-width: 18ch; margin-bottom: 6px; padding-right: 36px; }
  .rq-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .rq-field { display: grid; gap: 8px; border: 0; padding: 0; margin: 0; min-width: 0; }
  .rq-field > span, .rq-field legend { font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); padding: 0; margin-bottom: 8px; }
  .rq-field > span { margin-bottom: 0; }
  .rq-field em { font-style: normal; text-transform: none; letter-spacing: 0; opacity: 0.7; margin-left: 4px; }
  .rq-field input, .rq-field textarea {
    font: inherit; font-size: 16px; color: #000; background: #fff; width: 100%;
    border: 1px solid rgba(0,0,0,0.22); border-radius: 12px; padding: 13px 14px; outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }
  .rq-field textarea { resize: vertical; min-height: 104px; line-height: 1.5; }
  .rq-field input:focus, .rq-field textarea:focus { border-color: #000; box-shadow: 0 0 0 3px rgba(0,0,0,0.08); }
  .rq-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .rq-chip {
    display: inline-flex; align-items: center; gap: 6px;
    font: inherit; font-size: 14px; font-weight: 500; color: #000; background: #fff; cursor: pointer;
    border: 1px solid rgba(0,0,0,0.22); border-radius: 999px; padding: 9px 14px;
    transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  }
  .rq-chip:hover { border-color: #000; }
  .rq-chip:active { transform: scale(0.96); }
  .rq-chip.is-on { background: #000; color: #fff; border-color: #000; }
  .rq-power.is-on svg { color: #D9480F; }
  .rq-at { margin-top: 10px; }
  .rq-total { margin-top: 10px; font-size: 14px; color: var(--pc-grey); font-variant-numeric: tabular-nums; }
  .rq-total strong { color: #000; font-weight: 600; }
  .rq-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
  .rq-send { justify-self: start; margin-top: 4px; }
  .rq-error { font-size: 15px; color: #b42318; }
  .rq-fine { font-size: 13px; color: var(--pc-grey); }
  .rq-done { display: grid; gap: 16px; justify-items: start; padding: 12px 0 4px; }
  .rq-done-icon { width: 56px; height: 56px; border-radius: 50%; background: #000; color: #fff; display: grid; place-items: center; animation: sp-pop 0.5s cubic-bezier(0.16,1,0.3,1); }
  .rq-done h2 { font-size: 34px; font-weight: 600; letter-spacing: -0.04em; }
  .rq-done p { font-size: 17px; line-height: 1.55; color: #333; max-width: 44ch; }
  @media (max-width: 640px) {
    .rq-backdrop { align-items: flex-end; padding: 0; }
    .rq { max-width: none; max-height: 92dvh; border-radius: 22px 22px 0 0; padding: 24px 18px calc(24px + env(safe-area-inset-bottom, 0px)); animation-name: rq-sheet; }
    @keyframes rq-sheet { from { transform: translateY(100%); } }
    .rq-row { grid-template-columns: 1fr; }
    .rq-send { justify-self: stretch; width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) { .rq, .rq-backdrop { animation: none; } }

  /* ─── superpowers ─── */
  .sp { --sp-accent: #D9480F; }
  .sp-h2 { max-width: 14ch; }
  .sp-lede { max-width: 54ch; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; color: #333; }
  .sp-grid { margin-top: clamp(36px, 5vw, 56px); display: grid; grid-template-columns: 1fr; gap: 12px; }
  @media (min-width: 720px) { .sp-grid { grid-template-columns: 1fr 1fr; gap: 16px; } }
  .sp-grid > * { height: 100%; }
  .sp-card {
    all: unset; box-sizing: border-box; cursor: pointer; width: 100%; height: 100%;
    display: flex; flex-direction: column; gap: 14px;
    padding: clamp(22px, 2.8vw, 32px);
    border: 1px solid #000; border-radius: 22px; background: #fff; color: #000;
    transition: background 0.35s ease, color 0.35s ease, transform 0.35s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s ease;
    -webkit-tap-highlight-color: transparent;
  }
  .sp-card:hover { transform: translateY(-4px) rotate(-0.4deg); box-shadow: 0 24px 48px -30px rgba(0,0,0,0.45); }
  .sp-card:active { transform: scale(0.985); }
  .sp-card:focus-visible { outline: 2px solid #000; outline-offset: 4px; }
  .sp-card.is-on { background: #000; color: #fff; animation: sp-pop 0.45s cubic-bezier(0.16,1,0.3,1); }
  @keyframes sp-pop { 0% { transform: scale(0.97); } 55% { transform: scale(1.015); } 100% { transform: none; } }
  .sp-top { display: flex; align-items: center; gap: 12px; }
  .sp-icon {
    width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center;
    background: #f1f1ef; transition: background 0.35s ease, transform 0.5s cubic-bezier(0.34,1.56,0.64,1);
  }
  .sp-card:hover .sp-icon { transform: rotate(-8deg) scale(1.06); }
  .sp-card.is-on .sp-icon { background: rgba(255,255,255,0.1); }
  .sp-by { font-size: 12px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pc-grey); }
  .sp-card.is-on .sp-by { color: rgba(255,255,255,0.5); }
  .sp-switch {
    margin-left: auto; width: 46px; height: 28px; border-radius: 999px; padding: 3px;
    background: #e6e6e3; transition: background 0.3s ease; flex: none;
  }
  .sp-switch span {
    display: block; width: 22px; height: 22px; border-radius: 50%; background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.25);
    transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), background 0.3s ease;
  }
  .sp-card.is-on .sp-switch { background: var(--sp-accent); }
  .sp-card.is-on .sp-switch span { transform: translateX(18px); }
  .sp-name { font-size: clamp(28px, 3.4vw, 42px); font-weight: 600; letter-spacing: -0.045em; line-height: 0.98; margin-top: 6px; }
  .sp-line { font-size: 17px; line-height: 1.4; font-weight: 500; letter-spacing: -0.01em; }
  .sp-items { display: grid; gap: 10px; padding-top: 14px; border-top: 1px solid var(--pc-line); }
  .sp-card.is-on .sp-items { border-top-color: var(--pc-line-dark); }
  .sp-item { display: grid; grid-template-columns: 18px 1fr; gap: 10px; align-items: start; font-size: 15px; line-height: 1.45; color: #444; }
  .sp-item svg { margin-top: 3px; }
  .sp-card.is-on .sp-item { color: rgba(255,255,255,0.75); }
  .sp-card.is-on .sp-item svg { color: var(--sp-accent); }
  .sp-price { margin-top: auto; padding-top: 18px; display: flex; align-items: baseline; gap: 8px; }
  .sp-price-v { font-size: clamp(26px, 2.6vw, 32px); font-weight: 600; letter-spacing: -0.035em; font-variant-numeric: tabular-nums; }
  .sp-price-v small, .sp-total-v small { font-size: 0.5em; font-weight: 500; letter-spacing: 0; opacity: 0.6; }
  .sp-price-c { font-size: 14px; color: var(--pc-grey); }
  .sp-card.is-on .sp-price-c { color: rgba(255,255,255,0.5); }
  .sp-add {
    margin-left: auto; align-self: center; display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 14px; border-radius: 999px; font-size: 14px; font-weight: 600;
    border: 1px solid #000; transition: background 0.3s ease, color 0.3s ease, border-color 0.3s ease;
  }
  .sp-card:hover .sp-add { background: #000; color: #fff; }
  .sp-card.is-on .sp-add { background: #fff; color: #000; border-color: #fff; }

  .sp-total {
    position: sticky; bottom: calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 5;
    margin-top: 20px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px 24px;
    padding: 18px 18px 18px clamp(20px, 3vw, 32px);
    background: #000; color: #fff; border-radius: 22px;
    box-shadow: 0 24px 60px -24px rgba(0,0,0,0.55);
  }
  .sp-total-k { font-size: 13px; line-height: 1.4; color: rgba(255,255,255,0.55); }
  .sp-total-v {
    margin-top: 4px; font-size: clamp(30px, 3.6vw, 44px); font-weight: 600; letter-spacing: -0.045em; line-height: 1;
    font-variant-numeric: tabular-nums; animation: sp-tick 0.5s cubic-bezier(0.34,1.56,0.64,1);
  }
  .sp-total-v span { font-size: 0.4em; font-weight: 500; letter-spacing: 0; color: rgba(255,255,255,0.55); }
  @keyframes sp-tick { 0% { transform: translateY(6px); opacity: 0.4; } 100% { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .sp-card, .sp-card.is-on, .sp-total-v, .sp-icon, .sp-switch span { animation: none; transition: none; }
  }
  @media (max-width: 640px) {
    .sp-card { border-radius: 18px; }
    .sp-total { border-radius: 18px; padding: 16px; }
    .sp-total .pc-btn { width: 100%; min-height: 52px; }
  }

  /* ─── deck teaser ─── */
  .pc-btn-dark { background: var(--pc-black); color: var(--pc-white); }
  .pc-btn-line { background: transparent; color: var(--pc-black); border-color: rgba(0,0,0,0.22); }
  .pc-btn-line:hover { border-color: var(--pc-black); }
  .pc-deck-in { display: grid; grid-template-columns: 1fr; gap: clamp(48px, 6vw, 96px); align-items: center; }
  @media (min-width: 960px) { .pc-deck-in { grid-template-columns: 6fr 5fr; } }
  .pc-deck .pc-h2 { max-width: 16ch; margin-bottom: 24px; }
  .pc-deck-lede { font-size: clamp(18px, 1.6vw, 20px); line-height: 1.55; color: #333; max-width: 52ch; }
  .pc-deck-actions { margin-top: clamp(32px, 4vw, 44px); display: flex; flex-wrap: wrap; gap: 12px; }
  .pc-deck-stack { position: relative; aspect-ratio: 16 / 12; display: block; }
  .pc-deck-slide {
    position: absolute; width: 86%; aspect-ratio: 16 / 9; object-fit: cover; display: block;
    border-radius: 12px; box-shadow: 0 30px 60px -28px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.08);
    transition: transform 0.6s cubic-bezier(0.16,1,0.3,1);
  }
  .pc-deck-slide.s1 { left: 0; bottom: 0; z-index: 3; }
  .pc-deck-slide.s2 { left: 7%; bottom: 14%; z-index: 2; }
  .pc-deck-slide.s3 { left: 14%; bottom: 28%; z-index: 1; }
  .pc-deck-stack:hover .s2 { transform: translate(8px, -10px); }
  .pc-deck-stack:hover .s3 { transform: translate(16px, -20px); }

  /* ─── phone ─── */
  @media (max-width: 640px) {
    .pc-section { padding: 72px 0; }
    .pc-label { margin-bottom: 28px; font-size: 12px; }
    .pc-h2 { margin-bottom: 36px; }
    .pc-btn { width: 100%; min-height: 56px; padding: 0 22px; }
    .pc-prose { font-size: 17px; }
    .pc-lead { font-size: 21px; }
    .pc-nav-link { font-size: 15px; }
    .pc-nav-actions { gap: 14px; }
    .pc-close-sub { font-size: 18px; }
      .pc-offer { padding: 28px 22px; border-radius: 18px; gap: 16px; }
    .pc-offer-price { font-size: 52px; }
    .pc-offer .pc-btn { align-self: stretch; }
    .pc-footer { flex-direction: column; gap: 16px; padding-top: 32px; }
    .pc-footer nav { gap: 8px 20px; }
    .pc-footer a { padding: 6px 0; }
  }
`;
