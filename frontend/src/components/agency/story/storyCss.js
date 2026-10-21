// Styles for StoryPage (StoryKit.jsx). Each story sets its own palette on
// .sy as CSS variables: --sy-surface → --sy-abyss (the page darkens as you
// scroll), --sy-a (accent mark), --sy-ai (accent text), --sy-b (second mark,
// validated against --sy-a for colour-blind separation), --sy-glow (rgb).
export const STORY_CSS = `
  .sy {
    --sy-ink-2: rgba(255,255,255,0.72);
    --sy-ink-3: rgba(255,255,255,0.5);
    position: relative;
    background: linear-gradient(180deg, var(--sy-surface) 0%, var(--sy-mid) 22%, var(--sy-deep) 55%, var(--sy-abyss) 82%, #000 100%);
    color: #fff;
  }
  .sy-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .sy-k { font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sy-ai); margin-bottom: 18px; }
  .sy-h2 { font-size: clamp(32px, 4.6vw, 60px); font-weight: 600; line-height: 1.02; letter-spacing: -0.035em; max-width: 18ch; }
  .sy-prose { margin-top: 22px; max-width: 48ch; font-size: clamp(17px, 1.5vw, 20px); line-height: 1.6; color: var(--sy-ink-2); }

  /* ─── pinned photograph ─── */
  .sy-pin { position: sticky; top: 0; height: 100svh; overflow: hidden; }
  .sy-pin > img {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
    transform: scale(calc(1.14 - var(--p, 0) * 0.14)); will-change: transform;
  }
  .sy-shade { position: absolute; inset: 0; pointer-events: none; }
  .sy-scene .sy-shade {
    background:
      linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.08) 30%, rgba(0,0,0,0.22) 70%, rgba(0,0,0,0.88) 100%),
      rgba(0,0,0, calc(0.12 + var(--p, 0) * 0.4));
  }

  /* ─── hero ─── */
  .sy-hero { height: 150svh; position: relative; }
  .sy-shade-hero {
    background:
      linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 35%, rgba(0,0,0,0.85) 100%),
      rgba(0,0,0, calc(var(--p, 0) * 0.7));
  }
  .sy-hero-in {
    position: absolute; left: 0; right: 0; bottom: 0; padding-bottom: clamp(56px, 10vh, 112px);
    transform: translateY(calc(var(--p, 0) * -8vh)); opacity: calc(1 - var(--p, 0) * 1.1);
  }
  .sy-eyebrow { font-size: 14px; color: var(--sy-ink-2); margin-bottom: 18px; }
  .sy-hero-h {
    font-size: clamp(46px, min(8vw, 12vh), 124px); font-weight: 600; line-height: 0.96;
    letter-spacing: -0.05em; max-width: 13ch; text-shadow: 0 2px 40px rgba(0,0,0,0.3);
  }
  .sy-hero-sub { margin-top: 24px; max-width: 52ch; font-size: clamp(17px, 1.6vw, 21px); line-height: 1.55; color: rgba(255,255,255,0.86); }
  .sy-cue {
    margin-top: clamp(32px, 6vh, 64px); display: flex; align-items: center; gap: 12px;
    font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sy-ink-3);
  }
  .sy-cue span { width: 1px; height: 40px; background: linear-gradient(var(--sy-ink-3), transparent); animation: sy-cue 2.4s ease-in-out infinite; transform-origin: top; }
  @keyframes sy-cue { 0% { transform: scaleY(0); } 50% { transform: scaleY(1); } 100% { transform: scaleY(1); opacity: 0; } }

  /* ─── four-step spine ─── */
  .sy-spine { padding: clamp(72px, 10vw, 128px) 0; background: var(--sy-mid); }
  .sy-spine .pc-label { color: var(--sy-ink-3); }
  .sy-spine .pc-spine { color: #fff; }
  .sy-spine .pc-spine li { border-color: rgba(255,255,255,0.16); }
  .sy-spine .pc-spine-k { color: var(--sy-ink-3); }
  .sy-spine .pc-spine-n { border-color: rgba(255,255,255,0.3); color: #fff; }
  .sy-spine .is-result .pc-spine-t { color: var(--sy-ai); }

  /* ─── scenes ─── */
  .sy-scene { position: relative; height: calc(var(--n) * 100svh); }
  .sy-cards { position: relative; margin-top: -100svh; z-index: 1; }
  .sy-slot { min-height: 100svh; display: flex; align-items: center; padding: 0 clamp(16px, 6vw, 96px); }
  .sy-left { justify-content: flex-start; }
  .sy-right { justify-content: flex-end; }
  .sy-slot-open { align-items: flex-end; padding-bottom: 14vh; }
  .sy-ch { display: flex; align-items: baseline; gap: 14px; margin-bottom: 18px; }
  .sy-ch-n {
    font-size: 14px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--sy-ai);
    border: 1px solid currentColor; border-radius: 999px; padding: 3px 10px;
  }
  .sy-ch-l { font-size: 13px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.82); }
  .sy-ch-h { font-size: clamp(42px, 7vw, 104px); font-weight: 600; line-height: 0.98; letter-spacing: -0.045em; max-width: 14ch; text-shadow: 0 2px 40px rgba(0,0,0,0.4); }
  .sy-card {
    max-width: 440px; padding: clamp(24px, 3vw, 36px);
    background: rgba(0,0,0,0.5);
    -webkit-backdrop-filter: blur(18px) saturate(1.2); backdrop-filter: blur(18px) saturate(1.2);
    border: 1px solid rgba(255,255,255,0.14); border-radius: 20px;
  }
  .sy-card-k { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sy-ai); margin-bottom: 12px; }
  .sy-card-h { font-size: clamp(24px, 2.4vw, 32px); font-weight: 600; line-height: 1.1; letter-spacing: -0.025em; margin-bottom: 12px; }
  .sy-card-b { font-size: 17px; line-height: 1.6; color: rgba(255,255,255,0.86); }

  /* ─── bands ─── */
  .sy-band { padding: clamp(88px, 13vw, 168px) 0; position: relative; }
  .sy-tone-mid { background: var(--sy-mid); }
  .sy-tone-deep { background: var(--sy-deep); }
  .sy-tone-abyss { background: var(--sy-abyss); }
  .sy-split { display: grid; gap: clamp(40px, 6vw, 96px); align-items: center; grid-template-columns: 1fr 1fr; }
  .sy-split-wide { grid-template-columns: 0.8fr 1.2fr; }
  .sy-stack .sy-fig, .pc-wrap > .sy-fig { margin-top: 40px; }
  .sy-fig { min-width: 0; }

  /* waffle */
  .sy-waffle-fig { margin: 0; }
  .sy-toggle { display: inline-flex; gap: 4px; padding: 4px; border-radius: 999px; background: rgba(255,255,255,0.08); margin-bottom: 20px; }
  .sy-toggle button {
    border: 0; background: transparent; color: var(--sy-ink-2); font: inherit; font-size: 14px; font-weight: 600;
    padding: 8px 16px; border-radius: 999px; cursor: pointer;
  }
  .sy-toggle button.is-on { background: #fff; color: #000; }
  .sy-waffle { display: grid; grid-template-columns: repeat(var(--cols), 1fr); gap: 8px; max-width: 380px; }
  .sy-cell { aspect-ratio: 1; border-radius: 6px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.03); transition: background-color 0.4s ease, border-color 0.4s ease, box-shadow 0.4s ease; }
  .sy-cell.is-lit { background: var(--sy-a); border-color: var(--sy-a); box-shadow: 0 0 30px rgba(var(--sy-glow), 0.45); }
  .sy-waffle-fig figcaption { margin-top: 20px; display: grid; gap: 8px; }
  .sy-waffle-v { font-size: clamp(32px, 4vw, 52px); font-weight: 600; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
  .sy-key { display: inline-flex; align-items: center; gap: 10px; font-size: 14px; color: var(--sy-ink-2); }
  .sy-sw { width: 14px; height: 14px; border-radius: 4px; flex: none; display: inline-block; }
  .sy-sw-a { background: var(--sy-a); }
  .sy-sw-b { background: var(--sy-b); }
  .sy-sw-dot { border-radius: 50%; }
  .sy-sw-off { border: 1px solid rgba(255,255,255,0.3); }

  /* steps + tracks */
  .sy-steps { list-style: none; padding: 0; margin: 0; }
  .sy-steps li { border-top: 1px solid rgba(255,255,255,0.14); padding: 22px 0; }
  .sy-step-k { font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: var(--sy-ai); }
  .sy-steps h3 { font-size: 22px; font-weight: 600; letter-spacing: -0.02em; margin: 6px 0; }
  .sy-steps p:last-child { color: var(--sy-ink-2); line-height: 1.6; max-width: 54ch; }
  .sy-tracks { display: grid; grid-template-columns: 120px 1fr; gap: clamp(20px, 4vw, 48px); align-items: center; }
  .sy-tracks-svg { width: 100%; overflow: visible; }
  .sy-track { fill: none; stroke-width: 2.5; stroke-linecap: round; }
  .sy-track-a { stroke: var(--sy-b); }
  .sy-track-b { stroke: rgba(255,255,255,0.7); }
  .sy-track-t { fill: rgba(255,255,255,0.6); font-size: 14px; font-weight: 600; }
  .sy-track-node { fill: var(--sy-a); stroke: var(--sy-deep); stroke-width: 2; }

  /* rhythm */
  .sy-legend { display: flex; flex-wrap: wrap; gap: 10px 24px; margin-bottom: 14px; }
  .sy-rhythm { position: relative; }
  .sy-rhythm svg { width: 100%; height: auto; display: block; overflow: visible; }
  .sy-axis { stroke: rgba(255,255,255,0.18); stroke-width: 1; }
  .sy-tick { fill: var(--sy-ink-3); font-size: 13px; }
  .sy-mark-b { fill: var(--sy-b); stroke: var(--sy-deep); stroke-width: 2; }
  .sy-mark-a { fill: var(--sy-a); }
  .sy-rhythm g { opacity: 0; transform: translateY(-14px); transition: opacity 0.6s ease, transform 0.8s cubic-bezier(0.16,1,0.3,1); }
  .sy-rhythm.is-on g { opacity: 1; transform: none; }
  .sy-rhythm g.is-hover .sy-mark-b { stroke: #fff; }
  .sy-tip {
    position: absolute; top: -8px; transform: translate(-50%, -100%);
    background: #fff; color: #000; border-radius: 10px; padding: 10px 12px;
    display: grid; gap: 2px; font-size: 13px; white-space: nowrap; pointer-events: none; box-shadow: 0 8px 30px rgba(0,0,0,0.35);
  }
  .sy-tip strong { font-size: 14px; }
  .sy-tip-a { font-weight: 600; }
  .sy-source { margin-top: 18px; font-size: 13px; color: var(--sy-ink-3); }

  /* channel bars */
  .sy-totals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 28px; }
  .sy-totals button {
    text-align: left; border: 1px solid rgba(255,255,255,0.16); background: transparent; color: #fff;
    border-radius: 14px; padding: 16px; cursor: pointer; font: inherit; display: grid; gap: 4px;
  }
  .sy-totals button.is-on { background: #fff; color: #000; border-color: #fff; }
  .sy-total-v { font-size: clamp(26px, 3vw, 40px); font-weight: 600; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
  .sy-total-l { font-size: 13px; opacity: 0.7; }
  .sy-bars { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
  .sy-bars li { display: grid; grid-template-columns: 96px 1fr auto; align-items: center; gap: 14px; font-size: 15px; }
  .sy-bar-name { color: var(--sy-ink-2); }
  .sy-bar-track { height: 14px; border-radius: 4px; background: rgba(255,255,255,0.06); overflow: hidden; }
  .sy-bar-fill { display: block; height: 100%; background: var(--sy-a); border-radius: 0 4px 4px 0; transition: width 0.9s cubic-bezier(0.16,1,0.3,1); }
  .sy-bar-v { font-variant-numeric: tabular-nums; min-width: 9ch; text-align: right; }

  /* columns */
  .sy-cols { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: 6px; height: 260px; align-items: end; }
  .sy-col { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 8px; cursor: default; }
  .sy-col-bar { width: 100%; max-width: 44px; background: var(--sy-a); border-radius: 4px 4px 0 0; transition: height 0.9s cubic-bezier(0.16,1,0.3,1); }
  .sy-col.is-hover .sy-col-bar { background: var(--sy-ai); }
  .sy-col-v { font-size: 13px; font-variant-numeric: tabular-nums; color: var(--sy-ink-2); }
  .sy-col-l { font-size: 11px; color: var(--sy-ink-3); white-space: nowrap; border-top: 1px solid rgba(255,255,255,0.18); width: 100%; text-align: center; padding-top: 6px; }

  /* Li's edit desk on paper */
  .sy-desk { background: #F4F1EA; color: #000; border-radius: 24px; padding: clamp(20px, 3vw, 40px); }

  /* drift */
  .sy-drift { display: grid; grid-template-columns: 0.8fr 1.4fr 1fr; gap: 10px; padding: 10px; background: var(--sy-mid); }
  .sy-drift img { width: 100%; height: clamp(220px, 40vw, 520px); object-fit: cover; border-radius: 4px; display: block; }

  /* quote */
  .sy-quote { position: relative; min-height: 110svh; display: flex; align-items: center; overflow: hidden; background: var(--sy-deep); }
  .sy-quote > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .sy-shade-quote { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 35%, rgba(0,0,0,0.1), rgba(0,0,0,0.82) 70%); }
  .sy-quote-in { position: relative; padding-top: 120px; padding-bottom: 120px; }
  .sy-quote figure { margin: 0; }
  .sy-quote blockquote { font-size: clamp(28px, 4vw, 56px); font-weight: 500; line-height: 1.12; letter-spacing: -0.03em; max-width: 22ch; text-shadow: 0 2px 30px rgba(0,0,0,0.5); }
  .sy-quote figcaption { margin-top: 28px; display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; font-size: 16px; }
  .sy-quote figcaption span { color: var(--sy-ink-2); }

  /* still */
  .sy-still { position: relative; background: var(--sy-abyss); padding: clamp(96px, 14vw, 180px) 0; overflow: hidden; }
  .sy-still > img {
    position: absolute; right: -6%; top: 50%; transform: translateY(-50%); width: min(70vw, 900px); opacity: 0.5;
    -webkit-mask-image: radial-gradient(closest-side, #000 55%, transparent); mask-image: radial-gradient(closest-side, #000 55%, transparent);
  }
  .sy-still .pc-wrap { position: relative; }
  .sy-still-t { font-size: clamp(34px, 5.6vw, 78px); font-weight: 600; line-height: 1.02; letter-spacing: -0.04em; max-width: 16ch; }
  .sy-still-t em { font-style: normal; color: var(--sy-ai); }

  /* pinned count + path */
  .sy-count { position: relative; height: 320svh; }
  .sy-path { position: relative; height: calc(var(--steps) * 70svh + 100svh); }
  .sy-shade-up { background: linear-gradient(180deg, rgba(0,0,0,0.2), rgba(0,0,0,0.65)), rgba(0,0,0, calc(0.55 - var(--p, 0) * 0.4)); }
  .sy-pinned-in { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; }
  .sy-num { font-size: clamp(72px, 16vw, 250px); font-weight: 600; letter-spacing: -0.06em; line-height: 0.86; font-variant-numeric: tabular-nums; text-shadow: 0 4px 60px rgba(0,0,0,0.35); }
  .sy-num-l { margin-top: 10px; font-size: clamp(20px, 2.4vw, 32px); font-weight: 500; color: var(--sy-ai); }
  .sy-num-note { margin-top: 18px; font-size: 15px; color: var(--sy-ink-2); max-width: 44ch; }
  .sy-meter {
    position: absolute; right: clamp(16px, 6vw, 96px); top: 22vh; bottom: 22vh;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--sy-ink-2);
  }
  .sy-meter-line { position: relative; flex: 1; width: 1px; background: rgba(255,255,255,0.3); }
  .sy-meter-dot {
    position: absolute; left: 50%; width: 12px; height: 12px; border-radius: 50%; background: var(--sy-a);
    box-shadow: 0 0 24px rgba(var(--sy-glow), 0.8); top: calc((1 - var(--p, 0)) * 100%); transform: translate(-50%, -50%);
  }
  .sy-path-list { list-style: none; padding: 0; margin: 0; display: grid; gap: clamp(10px, 2vh, 20px); }
  .sy-path-list li { display: flex; align-items: center; gap: 18px; opacity: 0.32; transition: opacity 0.5s ease, transform 0.5s ease; }
  .sy-path-list li.is-lit { opacity: 0.75; }
  .sy-path-list li.is-at { opacity: 1; transform: translateX(8px); }
  .sy-path-dot { width: 14px; height: 14px; border-radius: 50%; border: 2px solid #fff; flex: none; }
  .sy-path-list li.is-lit .sy-path-dot { background: var(--sy-a); border-color: var(--sy-a); }
  .sy-path-t { font-size: clamp(28px, 4.4vw, 60px); font-weight: 600; letter-spacing: -0.04em; line-height: 1; }
  .sy-path-list li.is-end .sy-path-t { font-size: clamp(44px, 8vw, 120px); }
  .sy-path-list li.is-end.is-lit .sy-path-t { color: var(--sy-ai); }

  /* finale */
  .sy-finale { position: relative; min-height: 100svh; display: flex; align-items: flex-end; overflow: hidden; background: #000; }
  .sy-finale > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .sy-shade-finale { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0.05) 20%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0.92) 100%); }
  .sy-finale-in { position: relative; padding-top: 36vh; padding-bottom: clamp(56px, 9vh, 104px); }
  .sy-finale-h { font-size: clamp(36px, 5.6vw, 84px); font-weight: 600; line-height: 1.02; letter-spacing: -0.045em; max-width: 18ch; }
  .sy-finale-b { margin-top: 22px; max-width: 52ch; font-size: clamp(17px, 1.5vw, 20px); line-height: 1.6; color: rgba(255,255,255,0.84); }
  .sy-facts { margin: clamp(32px, 5vh, 56px) 0 0; display: grid; grid-template-columns: repeat(var(--cols), 1fr); border-top: 1px solid rgba(255,255,255,0.2); }
  .sy-facts div { padding: 20px 20px 0 0; }
  .sy-facts dt { font-size: clamp(26px, 3.2vw, 46px); font-weight: 600; letter-spacing: -0.04em; font-variant-numeric: tabular-nums; }
  .sy-facts dd { margin: 4px 0 0; font-size: 15px; color: var(--sy-ink-2); }

  /* next */
  .sy-next { background: #000; border-top: 1px solid rgba(255,255,255,0.12); }
  .sy-next-in { display: grid; gap: 12px; padding-top: clamp(56px, 8vw, 96px); padding-bottom: clamp(56px, 8vw, 96px); color: #fff; text-decoration: none; position: relative; }
  .sy-next-k { font-size: 14px; color: var(--sy-ink-3); }
  .sy-next-t { font-size: clamp(30px, 4.6vw, 60px); font-weight: 600; letter-spacing: -0.035em; line-height: 1.04; max-width: 18ch; }
  .sy-next-arrow { position: absolute; right: clamp(16px, 5vw, 56px); bottom: clamp(56px, 8vw, 96px); transition: transform 0.3s ease; }
  .sy-next-in:hover .sy-next-arrow { transform: translateX(8px); }

  /* gauge */
  .sy-gauge { position: fixed; right: 22px; top: 22vh; bottom: 22vh; z-index: 20; width: 2px; opacity: 0; pointer-events: none; transition: opacity 0.4s ease; }
  .sy-gauge.is-on { opacity: 1; pointer-events: auto; }
  .sy-gauge-track { position: absolute; inset: 0; background: rgba(255,255,255,0.16); border-radius: 2px; }
  .sy-gauge-fill { position: absolute; left: 0; right: 0; top: 0; background: var(--sy-ai); border-radius: 2px; }
  .sy-gauge-tick { position: absolute; right: -5px; transform: translateY(-50%); display: flex; align-items: center; flex-direction: row-reverse; gap: 10px; color: rgba(255,255,255,0.5); text-decoration: none; font-size: 12px; white-space: nowrap; }
  .sy-gauge-dot { width: 12px; height: 12px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.5); background: var(--sy-deep); flex: none; }
  .sy-gauge-tick.is-past .sy-gauge-dot { background: var(--sy-ai); border-color: var(--sy-ai); }
  .sy-gauge-tick.is-at .sy-gauge-dot { background: var(--sy-ai); border-color: #fff; box-shadow: 0 0 16px rgba(var(--sy-glow), 0.8); }
  .sy-gauge-l { opacity: 0; transform: translateX(6px); transition: opacity 0.3s ease, transform 0.3s ease; }
  .sy-gauge-tick.is-at .sy-gauge-l, .sy-gauge:hover .sy-gauge-l { opacity: 1; transform: none; color: #fff; }

  /* credits */
  .sy-credits { background: #000; color: rgba(255,255,255,0.5); padding: 28px 0 40px; font-size: 13px; }
  .sy-credits summary { cursor: pointer; }
  .sy-credits p { margin: 12px 0 8px; }
  .sy-credits ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
  .sy-credits a { color: rgba(255,255,255,0.75); }
  @media (pointer: coarse) {
    .sy-toggle button { min-height: 40px; }
    .sy-credits summary { padding: 12px 0; }
    .sy-credits ul { gap: 0; }
    .sy-credits li { padding: 6px 0; }
  }

  /* ─── flat hero (no photo): short, carries the key facts ─── */
  .sy-hero-flat { padding: clamp(128px, 20vh, 200px) 0 clamp(56px, 9vh, 96px); background: radial-gradient(120% 90% at 85% 0%, rgba(var(--sy-glow), 0.28), transparent 60%); }
  .sy-hero-flat .sy-hero-h { max-width: 16ch; }
  .sy-hero-flat .sy-facts { max-width: 880px; }

  /* ─── narrowing: topic → seconds ─── */
  .sy-narrow ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .sy-narrow button {
    width: 100%; display: grid; grid-template-columns: 11rem 1fr 7.5rem; align-items: center; gap: 16px;
    padding: 14px 16px; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; background: rgba(255,255,255,0.03);
    color: #fff; font: inherit; text-align: left; cursor: pointer; transition: background-color 0.2s ease, border-color 0.2s ease;
  }
  .sy-narrow button:hover { background: rgba(255,255,255,0.06); }
  .sy-narrow button.is-on { border-color: var(--sy-a); background: rgba(var(--sy-glow), 0.12); }
  .sy-narrow-k { font-size: 13px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sy-ink-2); }
  .sy-narrow button.is-on .sy-narrow-k { color: var(--sy-ai); }
  .sy-narrow-track { height: 10px; display: flex; justify-content: center; }
  .sy-narrow-track span { height: 100%; border-radius: 999px; background: var(--sy-a); transition: width 0.9s cubic-bezier(.2,.7,.2,1); }
  .sy-narrow-v { font-size: 15px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
  .sy-narrow figcaption { margin-top: 18px; min-height: 5.5em; }
  .sy-narrow-b { font-size: clamp(16px, 1.4vw, 18px); line-height: 1.6; color: var(--sy-ink-2); max-width: 56ch; animation: sy-fade 0.35s ease; }
  @keyframes sy-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }

  /* ─── closing facts + link on ─── */
  .sy-outcome-link {
    margin-top: 32px; display: inline-flex; align-items: center; gap: 8px; padding: 12px 20px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,0.3); color: #fff; font-weight: 600; text-decoration: none;
  }
  .sy-outcome-link:hover { background: #fff; color: #000; }
  .sy-band-tight { padding: clamp(64px, 9vw, 112px) 0; }

  @media (max-width: 900px) {
    .sy-split, .sy-split-wide { grid-template-columns: 1fr; }
    .sy-tracks { grid-template-columns: 72px 1fr; }
    .sy-gauge { display: none; }
    .sy-right, .sy-left { justify-content: center; }
    .sy-facts { grid-template-columns: 1fr; }
    .sy-facts div { padding: 16px 0 0; }
    .sy-meter { display: none; }
    .sy-drift { grid-template-columns: 1fr 1fr; }
    .sy-drift img:first-child { grid-column: span 2; }
    .sy-tick { font-size: 26px; }
    .sy-mark-b { r: 6; }
    .sy-next-arrow { display: none; }
    .sy-still > img { opacity: 0.3; right: -30%; width: 110vw; }
    .sy-totals { grid-template-columns: 1fr; }
    .sy-waffle { max-width: 260px; gap: 6px; }
    .sy-bars li { grid-template-columns: 72px 1fr auto; font-size: 13px; }
    .sy-cols { height: 200px; gap: 3px; }
    .sy-col-l { font-size: 10px; }
    .sy-hero-h { font-size: clamp(36px, 10.5vw, 56px); max-width: none; }
    .sy-ch-h { font-size: clamp(36px, 10.5vw, 56px); }
    .sy-col-v { font-size: 11px; }
    .sy-narrow button { grid-template-columns: 1fr auto; gap: 8px 12px; }
    .sy-narrow-track { grid-column: 1 / -1; grid-row: 2; justify-content: flex-start; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sy-pin > img { transform: none; }
    .sy-hero-in { transform: none; opacity: 1; }
    .sy-cue span { animation: none; }
    .sy-rhythm g { opacity: 1; transform: none; transition: none; }
  }
`;
