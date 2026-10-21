import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AgencyShell } from "../AgencyShell.jsx";
import { AgencyOffer } from "../AgencyOffer.jsx";
import { DeckTeaser } from "../DeckTeaser.jsx";
import { Reveal } from "../Reveal.jsx";
import { ReelEdit } from "../ReelEdit.jsx";
import { CaseRail, CaseSpine, StoryMark } from "../CaseNav.jsx";
import { caseBySlug, casePath, nextCase } from "../agencyData.js";
import { useT } from "../i18n.js";
import { initTracking, trackPageView } from "../../../lib/track.js";
import { STORY_CSS } from "./storyCss.js";
import { reduceMotion, usePinProgress } from "./storyHooks.js";

/* The scroll-told story page every case uses (/work/:slug). A story is data
   (pages/stories/<slug>.jsx): a theme, a hero, chapters for the depth gauge
   and a list of blocks. Photographs pin to the viewport while cards scroll
   over them; figures sit on solid bands between them.

   Honesty rules travel with the kit: figures only draw numbers the registry
   (agencyData) or Felix confirmed, illustrative shapes say so on the figure,
   and stock photos are credited at the bottom (licences require it).

   Blocks:
     scene   { anchor?, img, alt, pos, chapter?: [n, label, title], cards: [{ k, h, b }] }
     band    { anchor?, tone?, k?, h?, body?, layout?, tight?, node }   solid band, figure in `node`
     quote   { anchor?, img, n, label, text, who, role }
     still   { img, line, em }                                  one quiet sentence
     drift   { imgs: [] }                                       three frames between chapters
     count   { anchor?, img, alt, pos, n, label, from, to, fmt, unit, note, top, bottom }
     path    { anchor?, img, alt, pos, n, label, steps: [], note }
     finale  { img, alt, k, h, body?, facts: [[v, l]] }
   Every block takes `section` + `order` for scroll-depth tracking.
   A hero without `img` is a short, flat hero (no pinned photo) that can carry
   `facts` — for stories told in figures rather than photographs. */

const anchorId = (a) => (a ? `sy-${a}` : undefined);

// True once the element has been in view (figures animate in once).
function useSeen(threshold = 0.3) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setSeen(true);
        obs.disconnect();
      }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, seen];
}

function ChapterMark({ n, label }) {
  const t = useT();
  return (
    <p className="sy-ch">
      <span className="sy-ch-n">{n}</span>
      <span className="sy-ch-l">{t(label)}</span>
    </p>
  );
}

/* ─── blocks ─── */

function Scene({ anchor, img, alt, pos = "center", chapter, cards, section, order }) {
  const ref = useRef(null);
  const t = useT();
  usePinProgress(ref);
  return (
    <section ref={ref} id={anchorId(anchor)} className="sy-scene" style={{ "--n": cards.length + (chapter ? 1 : 0) }} data-pc-section={section} data-pc-order={order}>
      <div className="sy-pin">
        <img src={img} alt={t(alt)} style={{ objectPosition: pos }} loading="lazy" decoding="async" />
        <span className="sy-shade" aria-hidden="true" />
      </div>
      <div className="sy-cards">
        {chapter && (
          <div className="sy-slot sy-slot-open">
            <Reveal>
              <ChapterMark n={chapter[0]} label={chapter[1]} />
              <h2 className="sy-ch-h">{t(chapter[2])}</h2>
            </Reveal>
          </div>
        )}
        {cards.map((c, i) => (
          <div key={i} className={`sy-slot ${i % 2 ? "sy-right" : "sy-left"}`}>
            <Reveal>
              <div className="sy-card">
                {c.k && <p className="sy-card-k">{t(c.k)}</p>}
                {c.h && <h3 className="sy-card-h">{t(c.h)}</h3>}
                {c.b && <p className="sy-card-b">{t(c.b)}</p>}
              </div>
            </Reveal>
          </div>
        ))}
      </div>
    </section>
  );
}

function Band({ anchor, tone = "deep", k, h, body, layout = "split", tight = false, node, section, order }) {
  const t = useT();
  const copy = (k || h || body) && (
    <div>
      {k && <p className="sy-k">{t(k)}</p>}
      {h && <Reveal><h2 className="sy-h2">{t(h)}</h2></Reveal>}
      {body && <Reveal delay={0.06}><p className="sy-prose">{t(body)}</p></Reveal>}
    </div>
  );
  return (
    <section id={anchorId(anchor)} className={`sy-band sy-tone-${tone}${tight ? " sy-band-tight" : ""}`} data-pc-section={section} data-pc-order={order}>
      <div className={`pc-wrap${layout === "stack" ? "" : ` sy-split sy-${layout}`}`}>
        {copy}
        {node && <div className="sy-fig">{node}</div>}
      </div>
    </section>
  );
}

function Quote({ anchor, img, n, label, text, who, role, section, order }) {
  const t = useT();
  return (
    <section id={anchorId(anchor)} className="sy-quote" data-pc-section={section} data-pc-order={order}>
      <img src={img} alt="" aria-hidden="true" loading="lazy" decoding="async" />
      <span className="sy-shade-quote" aria-hidden="true" />
      <div className="pc-wrap sy-quote-in">
        {n && <ChapterMark n={n} label={label} />}
        <Reveal>
          <figure>
            <blockquote>“{t(text)}”</blockquote>
            <figcaption><strong>{who}</strong>{role && <span>{t(role)}</span>}</figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  );
}

function Still({ img, line, em, section, order }) {
  const t = useT();
  return (
    <section className="sy-still" data-pc-section={section} data-pc-order={order}>
      {img && <img src={img} alt="" aria-hidden="true" loading="lazy" decoding="async" />}
      <div className="pc-wrap">
        <Reveal><p className="sy-still-t">{t(line)}{em && <><br /><em>{t(em)}</em></>}</p></Reveal>
      </div>
    </section>
  );
}

function Drift({ imgs }) {
  return (
    <section className="sy-drift" aria-hidden="true">
      {imgs.map((src) => <img key={src} src={src} alt="" loading="lazy" decoding="async" />)}
    </section>
  );
}

const compactNum = (v) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const smooth = (q) => q * q * (3 - 2 * q);

/* Pinned count: the number runs from → to as you scroll through. Only the two
   ends are data — the caption (`note`) has to say so. */
function Count({ anchor, img, alt, pos = "center", n, label, from = 0, to, fmt, unit, note, top, bottom, section, order }) {
  const t = useT();
  const ref = useRef(null);
  const numRef = useRef(null);
  const show = fmt || ((v, done) => (done ? compactNum(to) : compactNum(v)));
  usePinProgress(ref, (p) => {
    if (!numRef.current) return;
    const q = reduceMotion() ? 1 : Math.min(Math.max((p - 0.08) / 0.78, 0), 1);
    numRef.current.textContent = show(from + (to - from) * smooth(q), q >= 1);
  });
  return (
    <section ref={ref} id={anchorId(anchor)} className="sy-pinned sy-count" data-pc-section={section} data-pc-order={order}>
      <div className="sy-pin">
        <img src={img} alt={t(alt)} style={{ objectPosition: pos }} loading="lazy" decoding="async" />
        <span className="sy-shade sy-shade-up" aria-hidden="true" />
        <div className="pc-wrap sy-pinned-in">
          {n && <ChapterMark n={n} label={label} />}
          {top && (
            <div className="sy-meter" aria-hidden="true">
              <span>{t(top)}</span>
              <span className="sy-meter-line"><span className="sy-meter-dot" /></span>
              <span>{t(bottom)}</span>
            </div>
          )}
          <p className="sy-num">
            <span ref={numRef} aria-hidden="true">{show(from, false)}</span>
            <span className="sy-sr">{show(to, true)}</span>
          </p>
          <p className="sy-num-l">{t(unit)}</p>
          {note && <p className="sy-num-note">{t(note)}</p>}
        </div>
      </div>
    </section>
  );
}

/* Pinned path: steps light up one by one as you scroll; the last one lands big. */
function Path({ anchor, img, alt, pos = "center", n, label, steps, note, section, order }) {
  const t = useT();
  const ref = useRef(null);
  const [at, setAt] = useState(reduceMotion() ? steps.length - 1 : 0);
  usePinProgress(ref, (p) => {
    if (reduceMotion()) return;
    const i = Math.min(steps.length - 1, Math.floor(Math.min(Math.max((p - 0.05) / 0.8, 0), 0.9999) * steps.length));
    setAt((cur) => (cur === i ? cur : i));
  });
  return (
    <section ref={ref} id={anchorId(anchor)} className="sy-pinned sy-path" style={{ "--steps": steps.length }} data-pc-section={section} data-pc-order={order}>
      <div className="sy-pin">
        <img src={img} alt={t(alt)} style={{ objectPosition: pos }} loading="lazy" decoding="async" />
        <span className="sy-shade sy-shade-up" aria-hidden="true" />
        <div className="pc-wrap sy-pinned-in">
          {n && <ChapterMark n={n} label={label} />}
          <ol className="sy-path-list">
            {steps.map((s, i) => (
              <li key={s} className={`${i <= at ? "is-lit" : ""}${i === at ? " is-at" : ""}${i === steps.length - 1 ? " is-end" : ""}`}>
                <span className="sy-path-dot" />
                <span className="sy-path-t">{t(s)}</span>
              </li>
            ))}
          </ol>
          {note && <p className="sy-num-note">{t(note)}</p>}
        </div>
      </div>
    </section>
  );
}

function Finale({ img, alt, pos = "center", k, h, body, facts, section, order }) {
  const t = useT();
  return (
    <section className="sy-finale" data-pc-section={section} data-pc-order={order}>
      <img src={img} alt={t(alt)} style={{ objectPosition: pos }} loading="lazy" decoding="async" />
      <span className="sy-shade-finale" aria-hidden="true" />
      <div className="pc-wrap sy-finale-in">
        {k && <Reveal><p className="sy-k">{t(k)}</p></Reveal>}
        <Reveal delay={0.06}><h2 className="sy-finale-h">{t(h)}</h2></Reveal>
        {body && <Reveal delay={0.1}><p className="sy-finale-b">{t(body)}</p></Reveal>}
        {facts && (
          <Reveal delay={0.14}>
            <dl className="sy-facts" style={{ "--cols": facts.length }}>
              {facts.map(([v, l]) => (
                <div key={l}><dt>{t(v)}</dt><dd>{t(l)}</dd></div>
              ))}
            </dl>
          </Reveal>
        )}
      </div>
    </section>
  );
}

const BLOCKS = { scene: Scene, band: Band, quote: Quote, still: Still, drift: Drift, count: Count, path: Path, finale: Finale };

/* ─── figures (placed in a band's `node`) ─── */

/* A grid of cells, some lit. `states` toggles between versions (Before / Now). */
export function Waffle({ cells, cols = 4, states, label, legend }) {
  const t = useT();
  const [i, setI] = useState(states.length - 1);
  const [ref, seen] = useSeen();
  const lit = new Set(seen ? states[i].lit : []);
  return (
    <figure className="sy-waffle-fig" ref={ref}>
      {states.length > 1 && (
        <div className="sy-toggle" role="group">
          {states.map((s, j) => (
            <button key={s.label} type="button" className={j === i ? "is-on" : undefined} aria-pressed={j === i} onClick={() => setI(j)}>
              {t(s.label)}
            </button>
          ))}
        </div>
      )}
      <div className="sy-waffle" style={{ "--cols": cols }} role="img" aria-label={t(states[i].aria || label)}>
        {Array.from({ length: cells }, (_, c) => (
          <span key={c} className={`sy-cell${lit.has(c) ? " is-lit" : ""}`} style={{ transitionDelay: `${c * 0.03}s` }} />
        ))}
      </div>
      <figcaption>
        {states[i].value && <span className="sy-waffle-v">{t(states[i].value)}</span>}
        {legend.map(([cls, l]) => (
          <span key={l} className="sy-key"><i className={`sy-sw sy-sw-${cls}`} />{t(l)}</span>
        ))}
      </figcaption>
    </figure>
  );
}

/* Numbered rows; `tracks` draws two lines fusing into one beside them. */
export function Steps({ items, tracks = false }) {
  const t = useT();
  const list = (
    <ol className="sy-steps">
      {items.map(([k, h, b], i) => (
        <li key={h}>
          <Reveal delay={i * 0.07}>
            <p className="sy-step-k">{t(k)}</p>
            <h3>{t(h)}</h3>
            <p>{t(b)}</p>
          </Reveal>
        </li>
      ))}
    </ol>
  );
  if (!tracks) return list;
  return (
    <div className="sy-tracks">
      <svg className="sy-tracks-svg" viewBox="0 -16 200 336" aria-hidden="true">
        <path className="sy-track sy-track-a" d="M50 0 V120 C50 170 100 170 100 210 V320" />
        <path className="sy-track sy-track-b" d="M150 0 V120 C150 170 100 170 100 210 V320" />
        <text x="50" y="-4" className="sy-track-t" textAnchor="middle">A</text>
        <text x="150" y="-4" className="sy-track-t" textAnchor="middle">B</text>
        <circle cx="100" cy="210" r="6" className="sy-track-node" />
      </svg>
      {list}
    </div>
  );
}

/* A year at a pace: two marks a week, a taller one about monthly. A rhythm,
   not a log — the caption says so. */
export function Rhythm({ weekly, monthly, aria, source, weeks = 52 }) {
  const t = useT();
  const [hover, setHover] = useState(null);
  const [ref, seen] = useSeen();
  const monthWeeks = new Set(Array.from({ length: 12 }, (_, m) => Math.round(m * (weeks / 12)) + 1));
  const W = 20;
  const H = 150;
  return (
    <div className="sy-rhythm-wrap">
      <div className="sy-legend">
        <span className="sy-key"><i className="sy-sw sy-sw-b sy-sw-dot" />{t(weekly)}</span>
        <span className="sy-key"><i className="sy-sw sy-sw-a" />{t(monthly)}</span>
      </div>
      <div className={`sy-rhythm${seen ? " is-on" : ""}`} ref={ref}>
        <svg viewBox={`0 0 ${weeks * W} ${H}`} role="img" aria-label={t(aria)} onMouseLeave={() => setHover(null)}>
          <line x1="0" x2={weeks * W} y1={H - 22} y2={H - 22} className="sy-axis" />
          {Array.from({ length: weeks }, (_, i) => {
            const wk = i + 1;
            const x = i * W + W / 2;
            return (
              <g key={wk} className={hover === wk ? "is-hover" : undefined} style={{ transitionDelay: `${i * 0.012}s` }}>
                {monthWeeks.has(wk) && <rect x={x - 3} y={20} width="6" height={H - 44} rx="3" className="sy-mark-a" />}
                <circle cx={x} cy={H - 54} r="4.5" className="sy-mark-b" />
                <circle cx={x} cy={H - 38} r="4.5" className="sy-mark-b" />
                <rect x={i * W} y="0" width={W} height={H} fill="transparent" onMouseEnter={() => setHover(wk)} onTouchStart={() => setHover(wk)} />
              </g>
            );
          })}
          <text x="0" y={H - 4} className="sy-tick">{t("Week 1")}</text>
          <text x={weeks * W} y={H - 4} textAnchor="end" className="sy-tick">{t("Week 52")}</text>
        </svg>
        {hover && (
          <div className="sy-tip" style={{ left: `${((hover - 0.5) / weeks) * 100}%` }}>
            <strong>{t("Week {n}", { n: hover })}</strong>
            <span>{t(weekly)}</span>
            {monthWeeks.has(hover) && <span className="sy-tip-a">{t(monthly)}</span>}
          </div>
        )}
      </div>
      <p className="sy-source">{t(source)}</p>
    </div>
  );
}

const fmtFull = (n) => n.toLocaleString("en-US");

/* Horizontal bars per channel with a metric switch (totals are the buttons). */
export function ChannelBars({ rows, metrics, source }) {
  const t = useT();
  const [metric, setMetric] = useState(metrics[0][0]);
  const [ref, seen] = useSeen();
  const sorted = [...rows].sort((a, b) => b[metric] - a[metric]);
  const max = sorted[0][metric];
  return (
    <div className={`sy-bars-wrap${seen ? " is-on" : ""}`} ref={ref}>
      <div className="sy-totals">
        {metrics.map(([k, l]) => {
          const total = rows.reduce((a, r) => a + r[k], 0);
          return (
            <button key={k} type="button" className={metric === k ? "is-on" : undefined} aria-pressed={metric === k} onClick={() => setMetric(k)}>
              <span className="sy-total-v" title={fmtFull(total)}>{compactNum(total)}</span>
              <span className="sy-total-l">{t(l)}</span>
            </button>
          );
        })}
      </div>
      <ul className="sy-bars">
        {sorted.map((r) => (
          <li key={r.label} title={`${r.label}: ${fmtFull(r[metric])}`}>
            <span className="sy-bar-name">{r.label}</span>
            <span className="sy-bar-track"><span className="sy-bar-fill" style={{ width: seen ? `${Math.max((r[metric] / max) * 100, 1.5)}%` : 0 }} /></span>
            <span className="sy-bar-v">{fmtFull(r[metric])}</span>
          </li>
        ))}
      </ul>
      <p className="sy-source">{t(source)}</p>
    </div>
  );
}

/* Ordered columns (events in sequence), one series, hover for the value. */
export function Columns({ rows, unit, source, aria }) {
  const t = useT();
  const [hover, setHover] = useState(null);
  const [ref, seen] = useSeen();
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <div className={`sy-cols-wrap${seen ? " is-on" : ""}`} ref={ref}>
      <div className="sy-cols" role="img" aria-label={t(aria)} onMouseLeave={() => setHover(null)}>
        {rows.map(([l, v], i) => (
          <div key={l} className={`sy-col${hover === i ? " is-hover" : ""}`} onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)}>
            <span className="sy-col-v">{v}</span>
            <span className="sy-col-bar" style={{ height: seen ? `${(v / max) * 100}%` : 0, transitionDelay: `${i * 0.05}s` }} />
            <span className="sy-col-l">{l}</span>
          </div>
        ))}
      </div>
      <p className="sy-source">{hover != null ? `${rows[hover][0]} · ${rows[hover][1]} ${t(unit)}` : t(source)}</p>
    </div>
  );
}

// Li's edit desk — the existing ReelEdit loop on a paper card.
export function ReelDesk({ beats }) {
  return (
    <div className="sy-desk">
      <ReelEdit beats={beats} />
    </div>
  );
}

/* From a topic down to seconds: one row per level, each bar narrower than the
   last. Pick a level to read what was decided there. The widths show the
   narrowing, not a measurement — `note` says so. */
export function Narrow({ levels, note }) {
  const t = useT();
  const [i, setI] = useState(0);
  const [ref, seen] = useSeen();
  return (
    <figure className="sy-narrow" ref={ref}>
      <ol>
        {levels.map((l, j) => (
          <li key={l.k}>
            <button type="button" className={j === i ? "is-on" : undefined} aria-pressed={j === i} onClick={() => setI(j)}>
              <span className="sy-narrow-k">{String(j + 1).padStart(2, "0")} · {t(l.k)}</span>
              <span className="sy-narrow-track" aria-hidden="true">
                <span style={{ width: seen ? `${l.w}%` : "0%", transitionDelay: `${j * 0.1}s` }} />
              </span>
              <span className="sy-narrow-v">{t(l.v)}</span>
            </button>
          </li>
        ))}
      </ol>
      <figcaption>
        <p className="sy-narrow-b" key={i}>{t(levels[i].b)}</p>
        {note && <p className="sy-source">{t(note)}</p>}
      </figcaption>
    </figure>
  );
}

// Closing facts (optional) and a link on to another story.
export function Outcome({ facts, link }) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className="sy-outcome">
      {facts && (
        <dl className="sy-facts" style={{ "--cols": facts.length }}>
          {facts.map(([v, l]) => (
            <div key={l}><dt>{t(v)}</dt><dd>{t(l)}</dd></div>
          ))}
        </dl>
      )}
      {link && (
        <a
          className="sy-outcome-link"
          href={casePath(link[1])}
          onClick={(e) => {
            e.preventDefault();
            navigate(casePath(link[1]));
          }}
        >
          {t(link[0])} <ArrowRight size={18} />
        </a>
      )}
    </div>
  );
}

/* ─── right-edge chapter gauge ─── */
function DepthGauge({ rootRef, chapters }) {
  const t = useT();
  const [state, setState] = useState({ p: 0, at: 0, ticks: [] });
  useEffect(() => {
    let raf = null;
    const run = () => {
      raf = null;
      const root = rootRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      const top = r.top + window.scrollY;
      const span = Math.max(r.height - window.innerHeight, 1);
      const p = Math.min(Math.max((window.scrollY - top) / span, 0), 1);
      const ticks = chapters.map(([id]) => {
        const el = document.getElementById(anchorId(id));
        if (!el) return 0;
        return Math.min(Math.max((el.getBoundingClientRect().top + window.scrollY - top) / span, 0), 1);
      });
      let at = 0;
      ticks.forEach((tk, i) => {
        if (p >= tk - 0.002) at = i;
      });
      setState((s) => (Math.abs(s.p - p) < 0.001 && s.at === at && s.ticks.length ? s : { p, at, ticks }));
    };
    const on = () => {
      if (raf == null) raf = requestAnimationFrame(run);
    };
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    run();
    const late = setTimeout(run, 600);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      clearTimeout(late);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [rootRef, chapters]);
  const visible = state.p > 0.001 && state.p < 0.999;
  return (
    <nav className={`sy-gauge${visible ? " is-on" : ""}`} aria-label={t("Chapters")}>
      <span className="sy-gauge-track" aria-hidden="true">
        <span className="sy-gauge-fill" style={{ height: `${state.p * 100}%` }} />
      </span>
      {chapters.map(([id, label], i) => (
        <a
          key={id}
          href={`#${anchorId(id)}`}
          className={`sy-gauge-tick${i === state.at ? " is-at" : ""}${i < state.at ? " is-past" : ""}`}
          style={{ top: `${(state.ticks[i] ?? i / (chapters.length - 1)) * 100}%` }}
          onClick={(e) => {
            e.preventDefault();
            document.getElementById(anchorId(id))?.scrollIntoView({ behavior: "smooth" });
          }}
        >
          <span className="sy-gauge-dot" />
          <span className="sy-gauge-l">{t(label)}</span>
        </a>
      ))}
    </nav>
  );
}

/* ─── the page ─── */
export function StoryPage({ story }) {
  const t = useT();
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const heroRef = useRef(null);
  usePinProgress(heroRef);
  const { slug, theme, hero, chapters, blocks, credits, creditNote } = story;
  const meta = caseBySlug(slug);
  const next = nextCase(slug);

  useEffect(() => {
    initTracking();
    trackPageView(`case_${slug}`);
    window.scrollTo(0, 0);
    const prev = document.title;
    document.title = `${meta.client} — PullUp`;
    return () => {
      document.title = prev;
    };
  }, [slug, meta]);

  const vars = {
    "--sy-surface": theme.surface,
    "--sy-mid": theme.mid,
    "--sy-deep": theme.deep,
    "--sy-abyss": theme.abyss,
    "--sy-a": theme.a,
    "--sy-ai": theme.ai,
    "--sy-b": theme.b,
    "--sy-glow": theme.glow,
  };

  return (
    <AgencyShell css={STORY_CSS}>
      <div className="sy" ref={rootRef} style={vars} data-pc-tone="dark">
        <DepthGauge rootRef={rootRef} chapters={chapters} />

        {hero.img ? (
          <section ref={heroRef} id={anchorId(chapters[0][0])} className="sy-hero" data-pc-section="case_hero" data-pc-order="1">
            <div className="sy-pin">
              <img src={hero.img} alt={t(hero.alt)} style={{ objectPosition: hero.pos || "center" }} fetchPriority="high" decoding="async" />
              <span className="sy-shade sy-shade-hero" aria-hidden="true" />
              <div className="pc-wrap sy-hero-in">
                <Reveal><p className="sy-eyebrow"><StoryMark slug={slug} /> — {meta.name}</p></Reveal>
                <Reveal delay={0.08}><h1 className="sy-hero-h">{t(meta.title)}</h1></Reveal>
                <Reveal delay={0.16}><p className="sy-hero-sub">{t(hero.sub)}</p></Reveal>
                <p className="sy-cue" aria-hidden="true"><span />{t(hero.cue || "Scroll")}</p>
              </div>
            </div>
          </section>
        ) : (
          <section id={anchorId(chapters[0][0])} className="sy-hero-flat" data-pc-section="case_hero" data-pc-order="1">
            <div className="pc-wrap">
              <Reveal><p className="sy-eyebrow"><StoryMark slug={slug} /> — {meta.name}</p></Reveal>
              <Reveal delay={0.08}><h1 className="sy-hero-h">{t(meta.title)}</h1></Reveal>
              <Reveal delay={0.16}><p className="sy-hero-sub">{t(hero.sub)}</p></Reveal>
              {hero.facts && (
                <Reveal delay={0.22}>
                  <dl className="sy-facts" style={{ "--cols": hero.facts.length }}>
                    {hero.facts.map(([v, l]) => (
                      <div key={l}><dt>{t(v)}</dt><dd>{t(l)}</dd></div>
                    ))}
                  </dl>
                </Reveal>
              )}
            </div>
          </section>
        )}

        <section className="sy-spine" data-pc-section="spine" data-pc-order="2">
          <div className="pc-wrap">
            <p className="pc-label">{t("The story in four steps")}</p>
            <CaseSpine spine={meta.spine} page />
          </div>
        </section>

        {blocks.map((b, i) => {
          const Block = BLOCKS[b.type];
          return Block ? <Block key={i} {...b} /> : null;
        })}

        <section className="sy-next" data-pc-section="next_case" data-pc-order="80">
          <a
            className="pc-wrap sy-next-in"
            href={casePath(next.slug)}
            onClick={(e) => {
              e.preventDefault();
              navigate(casePath(next.slug));
            }}
          >
            <span className="sy-next-k">{t("Next story")} — <StoryMark slug={next.slug} /> · {next.client}</span>
            <span className="sy-next-t">{t(next.title)}</span>
            <ArrowRight className="sy-next-arrow" size={36} strokeWidth={1.5} />
          </a>
        </section>
      </div>

      <CaseRail slug={slug} />
      <DeckTeaser source={`case_${slug}`} />
      <AgencyOffer source={`case_${slug}`} />

      {(credits?.length || creditNote) && (
        <section className="sy-credits">
          <div className="pc-wrap">
            <details>
              <summary>{t("Photo credits")}</summary>
              <p>{t(creditNote || "Placeholder photography from Wikimedia Commons, used under the licences below.")}</p>
              {credits?.length > 0 && (
                <ul>
                  {credits.map(([title, by, lic, href]) => (
                    <li key={href}>
                      <a href={href} target="_blank" rel="noreferrer">{title}</a> — {by} · {lic}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </div>
        </section>
      )}
    </AgencyShell>
  );
}
