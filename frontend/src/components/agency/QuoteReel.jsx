import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Testimonials.jsx";
import { WORDS } from "./testimonialsData.js";
import { useT } from "./i18n.js";

/* What clients say, one at a time and big, on black straight after the
   opening scene. Words come in one by one; a thin bar per person fills while
   theirs is on, then the next one comes. Hover, focus or leaving the screen
   pauses it; the bars jump; swipe on phones. Reduced motion: no auto-advance,
   no word animation. Same words as Testimonials (WORDS), real people only. */

const LIVE = WORDS.filter((w) => w.quote);
const HOLD = 7000;

function Words({ text, from = 0 }) {
  return text.split(" ").map((word, i) => (
    <span key={i}>
      {i > 0 && " "}
      <span className="qr-w" style={{ animationDelay: `${(from + i) * 0.028}s` }}>{word}</span>
    </span>
  ));
}

export function QuoteReel() {
  const t = useT();
  const [at, setAt] = useState(0);
  const [hold, setHold] = useState(false);
  const [inView, setInView] = useState(false);
  const [still, setStill] = useState(false);
  const ref = useRef(null);
  const touch = useRef(null);
  const paused = hold || !inView || still;

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const seen = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.35 });
    seen.observe(el);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => {
      seen.disconnect();
      media.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const id = setTimeout(() => setAt((i) => (i + 1) % LIVE.length), HOLD);
    return () => clearTimeout(id);
  }, [at, paused]);

  const go = (step) => setAt((i) => (i + step + LIVE.length) % LIVE.length);
  const w = LIVE[at];
  const lead = w.lead ? t(w.lead) : "";
  const quote = t(w.quote);
  const long = !lead && quote.length > 150;

  return (
    <section
      ref={ref}
      className={`qr${still ? " is-still" : ""}`}
      data-pc-tone="dark"
      data-pc-section="words"
      data-pc-order="2"
      id="words"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touch.current ?? e.changedTouches[0].clientX);
        if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}
    >
      <small className="qr-kicker">{t("In their words")}</small>
      <figure key={at} className={`qr-quote${long ? " is-long" : ""}`} aria-live="polite">
        <blockquote>
          {lead && <b><Words text={`“${lead}`} /></b>}
          <Words text={lead ? `${quote}”` : `“${quote}”`} from={lead ? lead.split(" ").length : 0} />
        </blockquote>
        <figcaption>
          <Avatar key={w.who} person={w} className="qr-mono" />
          <span><b>{w.who}</b>{t(w.org)}</span>
        </figcaption>
      </figure>
      <ol className="qr-nav">
        {LIVE.map((p, i) => (
          <li key={p.who}>
            <button type="button" aria-label={p.who} aria-current={i === at} onClick={() => setAt(i)}>
              <i className="qr-track">
                <i
                  key={i === at ? `on-${at}` : "off"}
                  className={i < at ? "is-done" : i === at ? "is-on" : ""}
                  style={{ animationDuration: `${HOLD}ms`, animationPlayState: paused ? "paused" : "running" }}
                />
              </i>
              <span>{p.who}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

const PAD = "padding-left: clamp(20px, 3.4vw, 48px); padding-right: clamp(20px, 3.4vw, 48px);";

export const QUOTE_CSS = `
  .qr { ${PAD} padding-top: clamp(88px, 12vw, 160px); padding-bottom: clamp(48px, 7vw, 88px); min-height: 100svh; display: flex; flex-direction: column; justify-content: space-between; gap: 48px; background: #0a0a0a; color: #fff; }
  .qr-kicker { font-size: 15px; font-weight: 600; color: #ec178f; }
  .qr-quote { margin: 0; }
  .qr blockquote { margin: 0; max-width: 17em; font-size: clamp(32px, 4.8vw, 80px); line-height: 1.02; letter-spacing: -0.045em; font-weight: 600; }
  .qr blockquote b { display: block; margin-bottom: .35em; color: #ec178f; font-weight: 700; }
  .qr-quote.is-long blockquote { max-width: 22em; font-size: clamp(26px, 3.4vw, 54px); line-height: 1.08; }
  .qr-w { display: inline-block; animation: qr-in .8s cubic-bezier(.16,1,.3,1) both; }
  @keyframes qr-in { from { opacity: 0; transform: translateY(.45em); filter: blur(10px); } to { opacity: 1; transform: none; filter: none; } }
  .qr figcaption { display: flex; align-items: center; gap: 14px; margin-top: clamp(28px, 3.4vw, 44px); animation: qr-in .8s .35s cubic-bezier(.16,1,.3,1) both; }
  .qr figcaption img, .qr-mono { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; flex: none; }
  .qr-mono { display: grid; place-items: center; background: #ec178f; color: #0a0a0a; font-size: 15px; font-weight: 700; }
  .qr figcaption > span:last-child { display: grid; font-size: 15px; line-height: 1.3; color: rgba(255,255,255,.6); }
  .qr figcaption b { font-size: 18px; color: #fff; letter-spacing: -0.02em; }
  .qr-nav { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(${LIVE.length}, minmax(0, 1fr)); gap: 10px; }
  .qr-nav button { display: grid; gap: 12px; width: 100%; padding: 8px 0; border: 0; background: none; color: rgba(255,255,255,.45); font: inherit; font-size: 13px; font-weight: 500; text-align: left; cursor: pointer; transition: color .2s ease; }
  .qr-nav button:hover, .qr-nav button[aria-current="true"] { color: #fff; }
  .qr-track { display: block; height: 2px; background: rgba(255,255,255,.18); overflow: hidden; }
  .qr-track > i { display: block; height: 100%; background: #fff; transform: scaleX(0); transform-origin: left; }
  .qr-track > i.is-done { transform: none; }
  .qr-track > i.is-on { animation: qr-fill linear forwards; }
  @keyframes qr-fill { to { transform: none; } }
  .qr.is-still .qr-w, .qr.is-still figcaption { animation: none; }
  .qr.is-still .qr-track > i.is-on { animation: none; transform: none; }
  @media (max-width: 759px) {
    .qr { min-height: 92svh; }
    .qr-nav { gap: 6px; }
    .qr-nav span { display: none; }
  }
`;
