import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AgencyShell } from "../../components/agency/AgencyShell.jsx";
import { AgencyOffer } from "../../components/agency/AgencyOffer.jsx";
import { DeckTeaser } from "../../components/agency/DeckTeaser.jsx";
import { Reveal } from "../../components/agency/Reveal.jsx";
import { CaseRail, CaseSpine, StoryMark } from "../../components/agency/CaseNav.jsx";
import { caseBySlug, casePath, nextCase } from "../../components/agency/agencyData.js";
import { initTracking, trackPageView } from "../../lib/track.js";
import { CASE_CONTENT } from "./caseContent.js";

/* /work/:slug — one template for the typographic cases. Every numbered story
   opens the same way: "Story 0N / 05", its title, then the four-step spine
   (Start → What we did → What we made → Result) before the long read, and
   closes on the rail of all stories. Adam Flambo has his own photographic
   page at /work/adam-flambo with the same opening and rail. */

const fmt = (n) => n.toLocaleString("en-US");
const compact = (n) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function Chapter({ n, label, title, body }) {
  return (
    <section className="pc-section pc-rule cs-chapter">
      <div className="pc-wrap pc-split">
        <div>
          <p className="pc-label"><span>{n}</span>{label}</p>
          <Reveal><h2 className="cs-chapter-h">{title}</h2></Reveal>
        </div>
        <div className="pc-prose">
          {body.map((p, i) => (
            <Reveal key={i} delay={i * 0.06}>
              <p className={i === 0 ? "pc-lead" : undefined}>{p}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Statement({ text }) {
  return (
    <section className="pc-dark cs-statement" data-pc-tone="dark">
      <div className="pc-wrap">
        <Reveal><p className="cs-statement-t">{text}</p></Reveal>
      </div>
    </section>
  );
}

function Steps({ label, title, items }) {
  return (
    <section className="pc-section pc-rule">
      <div className="pc-wrap">
        <p className="pc-label">{label}</p>
        <Reveal><h2 className="pc-h2">{title}</h2></Reveal>
        <ol className={`cs-steps cs-steps-${items.length}`}>
          {items.map((it, i) => (
            <li key={it.t}>
              <Reveal delay={i * 0.07}>
                <p className="cs-step-k">{it.k}</p>
                <h3>{it.t}</h3>
                <p className="cs-step-b">{it.b}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Quote({ text, who, role }) {
  return (
    <section className="pc-section pc-rule">
      <div className="pc-wrap">
        <Reveal>
          <figure className="cs-quote">
            <blockquote>“{text}”</blockquote>
            <figcaption><strong>{who}</strong>{role && <span>{role}</span>}</figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

const METRICS = [
  ["views", "Views"],
  ["interactions", "Interactions"],
  ["followers", "Followers"],
];

function Channels({ label, title, period, rows, totals }) {
  const [metric, setMetric] = useState("views");
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  const max = sorted[0][metric];
  return (
    <section className="pc-section pc-rule cs-channels" data-pc-section="results" data-pc-order="5">
      <div className="pc-wrap">
        <p className="pc-label">{label}</p>
        <Reveal><h2 className="pc-h2">{title}</h2></Reveal>
        <div className="cs-totals">
          {METRICS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              className={`cs-total${metric === k ? " is-on" : ""}`}
              onClick={() => setMetric(k)}
              aria-pressed={metric === k}
            >
              <span className="cs-total-v" title={fmt(totals[k])}>{compact(totals[k])}</span>
              <span className="cs-total-l">{l}</span>
            </button>
          ))}
        </div>
        <p className="cs-channels-hint">By channel · tap a total to switch</p>
        <ul className="cs-bars">
          {sorted.map((r) => (
            <li key={r.channel}>
              <span className="cs-bar-name">{r.channel}</span>
              <span className="cs-bar-track">
                <span className="cs-bar-fill" style={{ width: `${Math.max((r[metric] / max) * 100, 1.5)}%` }} />
              </span>
              <span className="cs-bar-v">{fmt(r[metric])}</span>
            </li>
          ))}
        </ul>
        <p className="cs-source">Source: channel analytics, {period}. Accumulated per channel.</p>
      </div>
    </section>
  );
}

function ImageBlock({ src, alt, caption }) {
  if (!src) return null;
  return (
    <figure className="cs-image">
      <img src={src} alt={alt || ""} loading="lazy" decoding="async" />
      {caption && <figcaption className="pc-wrap">{caption}</figcaption>}
    </figure>
  );
}


// The edit, as a loop: the playhead reviews the raw take frame by frame
// (cuts get marked), the cut frames collapse, then the final cut plays —
// with the phone showing whichever beat is under the playhead.
const LOOP_MS = 12000;
const REVIEW = 0.45; // 0 → REVIEW: raw take reviewed
const COLLAPSE = 0.6; // REVIEW → COLLAPSE: the cuts held up, marked; then they fall out and the final cut plays

function Reel({ label, title, body, beats }) {
  const ref = useRef(null);
  const [t, setT] = useState(0.99);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return undefined;
    let raf = null;
    let start = null;
    const tick = (now) => {
      if (start == null) start = now;
      setT(((now - start) % LOOP_MS) / LOOP_MS);
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && raf == null) raf = requestAnimationFrame(tick);
      if (!e.isIntersecting && raf != null) {
        cancelAnimationFrame(raf);
        raf = null;
        start = null;
      }
    }, { threshold: 0.25 });
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, []);

  const final = t >= REVIEW;
  const playing = t >= COLLAPSE;
  const phase = !final ? "raw" : !playing ? "cut" : "final";
  // playhead position across the strip for the current pass
  const head = phase === "raw" ? t / REVIEW : phase === "cut" ? 1 : (t - COLLAPSE) / (1 - COLLAPSE);

  // which frames are visible in this pass, and where each one sits
  const cells = [];
  beats.forEach((b, bi) => {
    for (let i = 0; i < b.frames; i++) cells.push({ bi, i, cut: b.cut.includes(i) });
  });
  const shown = playing ? cells.filter((c) => !c.cut) : cells;
  const at = Math.min(shown.length - 1, Math.floor(head * shown.length));
  const beat = phase === "cut" ? beats.length - 1 : shown[Math.max(0, at)].bi;
  const reviewedUpTo = phase === "raw" ? at : cells.length; // raw pass marks frames as it goes

  return (
    <section className="pc-section pc-rule cs-reel" ref={ref}>
      <div className="pc-wrap">
        <p className="pc-label">{label}</p>
        <Reveal><h2 className="pc-h2">{title}</h2></Reveal>
        <Reveal delay={0.06}><p className="cs-reel-body">{body}</p></Reveal>
        <div className="cs-reel-grid">
          <div className="cs-phone" aria-hidden="true">
            <div className="cs-phone-bars">
              {beats.map((b, i) => (
                <span key={b.t}>
                  <i style={{ transform: `scaleX(${i < beat ? 1 : i > beat ? 0 : phase === "cut" ? 1 : beatProgress(shown, at, head, i)})` }} />
                </span>
              ))}
            </div>
            <div className="cs-phone-screen" key={beat}>
              <p className="cs-phone-k">{String(beat + 1).padStart(2, "0")} · {beats[beat].t}</p>
              <p className="cs-phone-line">{beats[beat].line}</p>
              <span className="cs-phone-sub" />
              <span className="cs-phone-sub is-short" />
            </div>
            <p className="cs-phone-tag">Li Karlsén · BKM</p>
          </div>

          <div className="cs-edit">
            <div className="cs-edit-top">
              <span className={`cs-edit-phase${phase === "raw" ? " is-on" : ""}`}>1 · Raw take</span>
              <span className={`cs-edit-phase${phase === "cut" ? " is-on" : ""}`}>2 · Frame by frame</span>
              <span className={`cs-edit-phase${phase === "final" ? " is-on" : ""}`}>3 · Final cut</span>
            </div>
            <div className="cs-track">
              <div className="cs-strip">
                {beats.map((b, bi) => (
                  <div
                    key={b.t}
                    className={`cs-seg${bi === beat ? " is-now" : ""}`}
                    style={{ "--n": playing ? b.frames - b.cut.length : b.frames }}
                  >
                    <span className="cs-seg-name">{b.t}</span>
                    <div className="cs-frames">
                      {Array.from({ length: b.frames }, (_, i) => {
                        const idx = cells.findIndex((c) => c.bi === bi && c.i === i);
                        const cut = b.cut.includes(i);
                        const seen = idx <= reviewedUpTo;
                        return (
                          <span
                            key={i}
                            className={`cs-frame${seen ? " is-seen" : ""}${cut && seen ? " is-cut" : ""}${cut && phase === "cut" ? " is-flag" : ""}${cut && playing ? " is-gone" : ""}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <span className="cs-head" style={{ left: `${Math.min(100, head * 100)}%` }} />
            </div>
            <div className="cs-edit-legend">
              <span><i className="is-keep" />Kept</span>
              <span><i className="is-cut" />Cut — spent breath, moved nothing</span>
            </div>
            <ol className="cs-beats">
              {beats.map((b, i) => (
                <li key={b.t} className={i === beat ? "is-now" : undefined}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <b>{b.t}</b>
                  <em>{b.line}</em>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}

// How far the playhead is through beat `bi` (0–1) in the current pass.
function beatProgress(shown, at, head, bi) {
  const first = shown.findIndex((c) => c.bi === bi);
  const count = shown.filter((c) => c.bi === bi).length;
  if (first < 0 || !count) return 0;
  const pos = head * shown.length - first;
  return Math.max(0, Math.min(1, pos / count));
}

const BLOCKS = { chapter: Chapter, statement: Statement, steps: Steps, quote: Quote, channels: Channels, image: ImageBlock, reel: Reel };

export default function CasePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const meta = caseBySlug(slug);
  const content = CASE_CONTENT[slug];

  useEffect(() => {
    if (!content) return;
    initTracking();
    trackPageView(`case_${slug}`);
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = `${meta.client} — PullUp`;
    return () => {
      document.title = prev;
    };
  }, [slug, content, meta]);

  if (!meta || !content) return <Navigate to="/#stories" replace />;

  const next = nextCase(slug);
  const c = content;

  return (
    <AgencyShell css={CASE_CSS}>
      <section
        className={`pc-dark cs-hero${c.depth ? " cs-hero-depth" : ""}`}
        data-pc-tone="dark"
        data-pc-section="case_hero"
        data-pc-order="1"
      >
        {c.depth && <span className="cs-line" aria-hidden="true" />}
        <div className="pc-wrap cs-hero-in">
          <Reveal>
            <p className="pc-eyebrow cs-eyebrow">
              {meta.spine ? <><StoryMark slug={slug} /> — {meta.name}</> : `${meta.name} · ${meta.kicker}`}
            </p>
          </Reveal>
          <Reveal delay={0.08}><h1 className="cs-hero-h">{meta.title}</h1></Reveal>
          <Reveal delay={0.16}><p className="cs-hero-sub">{c.sub}</p></Reveal>
          {c.heroStat && (
            <Reveal delay={0.24} className="cs-herostat">
              <span className="cs-herostat-v">{c.heroStat.v}</span>
              <span className="cs-herostat-l">{c.heroStat.l}</span>
            </Reveal>
          )}
        </div>
      </section>

      {meta.spine ? (
        <section className="pc-casespine" data-pc-section="spine" data-pc-order="2">
          <div className="pc-wrap">
            <p className="pc-label">The story in four steps</p>
            <CaseSpine spine={meta.spine} page />
          </div>
        </section>
      ) : (
        <section className="cs-facts" data-pc-section="facts" data-pc-order="2">
          <dl className="pc-wrap cs-facts-in">
            {c.facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {c.stats && (
        <section className="cs-stats" data-pc-section="stats" data-pc-order="3">
          <div className={`pc-wrap cs-stats-in cs-stats-${c.stats.length}`}>
            {c.stats.map((s, i) => (
              <Reveal key={s.l} delay={i * 0.08} className="cs-stat">
                <span className="cs-stat-v">{s.v}</span>
                <span className="cs-stat-l">{s.l}</span>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {c.blocks.map((b, i) => {
        const Block = BLOCKS[b.type];
        return Block ? <Block key={i} {...b} /> : null;
      })}

      <section className="cs-next" data-pc-section="next_case" data-pc-order="80">
        <a
          className="pc-wrap cs-next-in"
          href={casePath(next.slug)}
          onClick={(e) => {
            e.preventDefault();
            navigate(casePath(next.slug));
          }}
        >
          <span className="cs-next-k">Next story — <StoryMark slug={next.slug} /> · {next.client}</span>
          <span className="cs-next-t">{next.title}</span>
          <ArrowRight className="cs-next-arrow" size={36} strokeWidth={1.5} />
        </a>
      </section>

      <CaseRail slug={meta.spine ? slug : "bkm"} />
      <DeckTeaser source={`case_${slug}`} />
      <AgencyOffer source={`case_${slug}`} />
    </AgencyShell>
  );
}

const CASE_CSS = `
  /* ─── hero ─── */
  .cs-hero {
    position: relative; overflow: hidden;
    min-height: 88svh;
    display: flex; align-items: flex-end;
    padding: 140px 0 clamp(56px, 8vw, 104px);
  }
  .cs-hero-in { position: relative; z-index: 1; }
  .cs-hero-h {
    font-size: clamp(44px, min(7.6vw, 11vh), 112px);
    font-weight: 600; line-height: 0.98; letter-spacing: -0.045em;
    max-width: 16ch;
  }
  .cs-hero-sub {
    margin-top: clamp(24px, 3.4vh, 40px); max-width: 60ch;
    font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; color: rgba(255,255,255,0.7);
  }
  .cs-herostat {
    margin-top: clamp(36px, 6vh, 64px);
    display: flex; align-items: baseline; flex-wrap: wrap; gap: 6px 18px;
    border-top: 1px solid rgba(255,255,255,0.16); padding-top: 24px;
  }
  .cs-herostat-v { font-size: clamp(56px, 9vw, 132px); font-weight: 600; letter-spacing: -0.05em; line-height: 0.9; font-variant-numeric: tabular-nums; }
  .cs-herostat-l { font-size: 16px; color: rgba(255,255,255,0.6); }

  /* Li — the dive: deep gradient + a guide line descending through the hero */
  .cs-hero-depth {
    background:
      radial-gradient(120% 70% at 50% -10%, rgba(255,255,255,0.10), transparent 60%),
      linear-gradient(180deg, #111 0%, #050505 55%, #000 100%);
  }
  .cs-line {
    position: absolute; top: 0; bottom: 0; right: clamp(24px, 12vw, 200px);
    width: 1px; background: linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.04));
  }
  .cs-line::after {
    content: ""; position: absolute; left: -3px; top: 0;
    width: 7px; height: 7px; border-radius: 50%; background: #fff;
    animation: cs-descend 9s cubic-bezier(0.45,0,0.55,1) infinite;
  }
  @keyframes cs-descend { 0% { top: 6%; opacity: 0; } 10% { opacity: 1; } 85% { opacity: 1; } 100% { top: 94%; opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .cs-line::after { animation: none; top: 60%; } }

  /* ─── facts ─── */
  .cs-facts { border-bottom: 1px solid var(--pc-line); }
  .cs-facts-in {
    margin: 0 auto; display: grid; grid-template-columns: repeat(2, 1fr);
  }
  @media (min-width: 900px) { .cs-facts-in { grid-template-columns: repeat(4, 1fr); } }
  .cs-facts-in > div { padding: 26px 16px 26px 0; }
  .cs-facts dt { font-size: 12px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--pc-grey); margin-bottom: 8px; }
  .cs-facts dd { margin: 0; font-size: 16px; font-weight: 500; line-height: 1.4; }

  /* ─── stats ─── */
  .cs-stats { padding: clamp(56px, 8vw, 104px) 0; border-bottom: 1px solid var(--pc-line); }
  .cs-stats-in { display: grid; grid-template-columns: 1fr; gap: 32px; }
  @media (min-width: 800px) { .cs-stats-in { grid-template-columns: repeat(3, 1fr); gap: 0; } }
  .cs-stat { display: grid; gap: 10px; }
  @media (min-width: 800px) { .cs-stat + .cs-stat { border-left: 1px solid var(--pc-line); padding-left: clamp(24px, 3vw, 40px); } }
  .cs-stat-v { font-size: clamp(52px, 6.6vw, 96px); font-weight: 600; line-height: 0.95; letter-spacing: -0.05em; font-variant-numeric: tabular-nums; }
  .cs-stat-l { font-size: 15px; color: var(--pc-grey); }

  /* ─── chapter ─── */
  .cs-chapter-h { font-size: clamp(30px, 3.8vw, 48px); font-weight: 600; line-height: 1.06; letter-spacing: -0.03em; max-width: 14ch; }

  /* ─── statement ─── */
  .cs-statement { padding: clamp(88px, 14vw, 180px) 0; }
  .cs-statement-t { font-size: clamp(32px, 5.4vw, 72px); font-weight: 600; line-height: 1.05; letter-spacing: -0.035em; max-width: 20ch; }

  /* ─── steps ─── */
  .cs-steps { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: 1fr; border-top: 1px solid var(--pc-black); }
  @media (min-width: 900px) {
    .cs-steps-3 { grid-template-columns: repeat(3, 1fr); }
    .cs-steps-4 { grid-template-columns: repeat(4, 1fr); }
    .cs-steps > li + li { border-left: 1px solid var(--pc-line); padding-left: clamp(20px, 2.4vw, 32px); }
    .cs-steps > li:not(:last-child) { padding-right: clamp(20px, 2.4vw, 32px); }
  }
  .cs-steps > li { padding-top: 28px; padding-bottom: 28px; border-bottom: 1px solid var(--pc-line); }
  .cs-step-k { font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); margin-bottom: 14px !important; font-variant-numeric: tabular-nums; }
  .cs-steps h3 { font-size: 26px; font-weight: 600; letter-spacing: -0.025em; margin-bottom: 12px !important; }
  .cs-step-b { font-size: 16px; line-height: 1.55; color: #333; }

  /* ─── quote ─── */
  .cs-quote blockquote { font-size: clamp(26px, 3.4vw, 44px); line-height: 1.22; letter-spacing: -0.02em; max-width: 28ch; }
  .cs-quote figcaption { margin-top: 32px; display: flex; flex-direction: column; gap: 2px; font-size: 15px; }
  .cs-quote figcaption strong { font-weight: 600; }
  .cs-quote figcaption span { color: var(--pc-grey); }

  /* ─── channels (STIGA) ─── */
  .cs-totals { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--pc-black); }
  .cs-total {
    background: none; border: 0; border-bottom: 2px solid transparent; color: inherit; font: inherit; cursor: pointer;
    text-align: left; padding: 24px 12px 20px 0; display: grid; gap: 8px; opacity: 0.4;
    transition: opacity 0.2s ease, border-color 0.2s ease;
  }
  .cs-total:hover { opacity: 0.75; }
  .cs-total.is-on { opacity: 1; border-bottom-color: var(--pc-black); }
  .cs-total-v { font-size: clamp(24px, 4.4vw, 60px); font-weight: 600; letter-spacing: -0.04em; line-height: 1; font-variant-numeric: tabular-nums; }
  .cs-total-l { font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); }
  .cs-channels-hint { margin-top: 36px !important; margin-bottom: 8px !important; font-size: 13px; color: var(--pc-grey); }
  .cs-bars { list-style: none; padding: 0; margin: 0; }
  .cs-bars li {
    display: grid; grid-template-columns: 96px 1fr auto; align-items: center; gap: 16px;
    padding: 18px 0; border-bottom: 1px solid var(--pc-line);
  }
  .cs-bar-name { font-size: 16px; font-weight: 600; }
  .cs-bar-track { height: 10px; background: rgba(0,0,0,0.06); border-radius: 999px; overflow: hidden; }
  .cs-bar-fill { display: block; height: 100%; background: var(--pc-black); border-radius: 999px; transition: width 0.7s cubic-bezier(0.16,1,0.3,1); }
  .cs-bar-v { font-size: 16px; font-weight: 500; font-variant-numeric: tabular-nums; min-width: 9ch; text-align: right; }
  .cs-source { margin-top: 20px !important; font-size: 13px; color: var(--pc-grey); }

  /* ─── image ─── */
  .cs-image { margin: 0; }
  .cs-image img { display: block; width: 100%; max-height: 88vh; object-fit: cover; }
  .cs-image figcaption { padding-top: 14px; padding-bottom: 14px; font-size: 13px; color: var(--pc-grey); }

  /* ─── next case ─── */
  .cs-next { border-top: 1px solid var(--pc-line); }
  .cs-next-in {
    display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 12px 24px;
    padding-top: clamp(56px, 9vw, 120px); padding-bottom: clamp(56px, 9vw, 120px);
    color: inherit; text-decoration: none;
  }
  .cs-next-k { grid-column: 1 / -1; font-size: 13px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--pc-grey); }
  .cs-next-t { font-size: clamp(32px, 5vw, 64px); font-weight: 600; line-height: 1.02; letter-spacing: -0.035em; max-width: 18ch; }
  .cs-next-arrow { transition: transform 0.25s ease; margin-bottom: 8px; }
  .cs-next-in:hover .cs-next-arrow { transform: translateX(8px); }


  /* ─── reel (Li): the edit, frame by frame ─── */
  .cs-reel-body { margin: -12px 0 clamp(36px, 5vw, 56px); max-width: 60ch; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; color: #333; }
  .cs-reel-grid { display: grid; grid-template-columns: 1fr; gap: clamp(28px, 4vw, 56px); align-items: center; }
  @media (min-width: 900px) { .cs-reel-grid { grid-template-columns: 300px 1fr; } }
  .cs-phone {
    position: relative; justify-self: center; width: min(300px, 78vw); aspect-ratio: 9 / 16;
    background: #000; color: #fff; border-radius: 34px; padding: 18px 18px 22px;
    box-shadow: 0 0 0 8px #111, 0 40px 80px -40px rgba(0,0,0,0.6);
    display: flex; flex-direction: column; overflow: hidden;
  }
  .cs-phone-bars { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .cs-phone-bars span { height: 3px; border-radius: 3px; background: rgba(255,255,255,0.25); overflow: hidden; }
  .cs-phone-bars i { display: block; height: 100%; background: #fff; transform-origin: 0 50%; }
  .cs-phone-screen { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 14px; animation: cs-beat-in 0.45s cubic-bezier(0.16,1,0.3,1); }
  @keyframes cs-beat-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .cs-phone-k { font-size: 12px; font-weight: 500; letter-spacing: 0.12em; text-transform: uppercase; color: #D9480F; }
  .cs-phone-line { font-size: 30px; font-weight: 600; line-height: 1.05; letter-spacing: -0.035em; }
  .cs-phone-sub { display: block; height: 8px; width: 82%; border-radius: 4px; background: rgba(255,255,255,0.18); }
  .cs-phone-sub.is-short { width: 54%; }
  .cs-phone-tag { font-size: 12px; color: rgba(255,255,255,0.5); }

  .cs-edit { min-width: 0; }
  .cs-edit-top { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
  .cs-edit-phase {
    font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase;
    padding: 7px 12px; border-radius: 999px; border: 1px solid var(--pc-line); color: var(--pc-grey);
    transition: background-color 0.25s ease, color 0.25s ease, border-color 0.25s ease;
  }
  .cs-edit-phase.is-on { background: #000; border-color: #000; color: #fff; }
  .cs-track { position: relative; padding-top: 26px; }
  .cs-strip { display: flex; gap: 6px; }
  .cs-seg { flex: var(--n, 1) 1 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; transition: flex-grow 0.6s ease; }
  .cs-seg-name {
    position: absolute; top: 0; font-size: 12px; font-weight: 600; letter-spacing: -0.01em; color: var(--pc-grey);
    transition: color 0.2s ease;
  }
  .cs-seg { position: relative; }
  .cs-seg .cs-seg-name { top: -26px; left: 0; white-space: nowrap; }
  .cs-seg.is-now .cs-seg-name { color: #000; }
  .cs-frames { display: flex; gap: 3px; height: 64px; padding: 6px; border-radius: 10px; background: #f3f3f1; transition: background-color 0.2s ease; }
  .cs-seg.is-now .cs-frames { background: #e8e8e4; }
  .cs-frame {
    position: relative; flex: 1 1 0; min-width: 0; border-radius: 4px;
    background: #d6d6d2;
    transition: flex-grow 0.6s cubic-bezier(0.16,1,0.3,1), margin 0.6s ease, opacity 0.4s ease, background-color 0.2s ease;
  }
  .cs-frame.is-seen { background: #000; }
  .cs-frame.is-cut { background: transparent; box-shadow: inset 0 0 0 1.5px #D9480F; }
  .cs-frame.is-cut::after {
    content: ""; position: absolute; inset: 0;
    background: linear-gradient(to top right, transparent calc(50% - 1px), #D9480F calc(50% - 1px), #D9480F calc(50% + 1px), transparent calc(50% + 1px));
  }
  .cs-frame.is-flag { animation: cs-flag 0.5s ease-in-out infinite alternate; }
  @keyframes cs-flag { from { background-color: rgba(217,72,15,0); } to { background-color: rgba(217,72,15,0.22); } }
  .cs-frame.is-gone { flex-grow: 0.0001; margin: 0 -1.5px; opacity: 0; }
  .cs-head {
    position: absolute; top: 18px; bottom: -8px; width: 2px; margin-left: -1px; background: #D9480F; border-radius: 2px;
    pointer-events: none;
  }
  .cs-head::before { content: ""; position: absolute; top: -6px; left: -5px; width: 12px; height: 12px; border-radius: 50%; background: #D9480F; }
  .cs-edit-legend { margin-top: 22px; display: flex; flex-wrap: wrap; gap: 8px 22px; font-size: 13px; color: var(--pc-grey); }
  .cs-edit-legend span { display: inline-flex; align-items: center; gap: 8px; }
  .cs-edit-legend i { width: 14px; height: 18px; border-radius: 3px; display: inline-block; }
  .cs-edit-legend .is-keep { background: #000; }
  .cs-edit-legend .is-cut { box-shadow: inset 0 0 0 1.5px #D9480F; background: linear-gradient(to top right, transparent 45%, #D9480F 45%, #D9480F 55%, transparent 55%); }
  .cs-beats { list-style: none; padding: 0; margin: 28px 0 0; border-top: 1px solid var(--pc-black); }
  .cs-beats li {
    display: grid; grid-template-columns: 40px 120px 1fr; align-items: baseline; gap: 12px;
    padding: 14px 0; border-bottom: 1px solid var(--pc-line); color: var(--pc-grey);
    transition: color 0.25s ease;
  }
  .cs-beats li span { font-size: 13px; font-variant-numeric: tabular-nums; }
  .cs-beats li b { font-size: 17px; font-weight: 600; }
  .cs-beats li em { font-style: normal; font-size: 15px; }
  .cs-beats li.is-now { color: #000; }
  .cs-beats li.is-now span { color: #D9480F; }
  @media (max-width: 640px) {
    .cs-frames { height: 48px; padding: 4px; gap: 2px; }
    .cs-seg-name { font-size: 11px; }
    .cs-beats li { grid-template-columns: 28px 1fr; }
    .cs-beats li em { grid-column: 2; }
    .cs-phone { width: min(230px, 62vw); border-radius: 28px; padding: 14px 14px 16px; }
    .cs-phone-line { font-size: 22px; }
    .cs-edit-phase { padding: 6px 9px; font-size: 10px; }
  }
  @media (max-width: 640px) {
    .cs-hero { min-height: 92svh; padding: 112px 0 48px; }
    .cs-hero-h { font-size: clamp(38px, 11vw, 52px); }
    .cs-hero-sub { font-size: 17px; }
    .cs-facts-in > div { padding: 20px 12px 20px 0; }
    .cs-facts dd { font-size: 15px; }
    .cs-stat-v { font-size: 56px; }
    .cs-steps h3 { font-size: 22px; }
    .cs-step-b { font-size: 15px; }
    .cs-quote blockquote { font-size: 24px; }
    .cs-total { padding: 18px 8px 16px 0; }
    .cs-total-v { font-size: 34px; letter-spacing: -0.04em; }
    .cs-total-l { font-size: 11px; }
    .cs-bars li { grid-template-columns: 78px 1fr; gap: 6px 12px; padding: 14px 0; }
    .cs-bar-v { grid-column: 2; text-align: left; font-size: 14px; color: var(--pc-grey); }
    .cs-bar-name { grid-row: span 2; font-size: 15px; }
    .cs-next-arrow { width: 28px; height: 28px; }
  }
`;
