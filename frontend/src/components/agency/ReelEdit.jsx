import { useEffect, useRef, useState } from "react";

/* Li Karlsén's edit, as a loop: one reel in four beats. The playhead reviews
   the raw take frame by frame (cuts get marked), the cut frames collapse,
   then the final cut plays — the phone shows whichever beat is under the
   playhead. Full size on her case page; `compact` on the landing card. */
const LOOP_MS = 12000;
const REVIEW = 0.45; // 0 → REVIEW: raw take reviewed
const COLLAPSE = 0.6; // REVIEW → COLLAPSE: the cuts held up, marked; then they fall out and the final cut plays

export function ReelEdit({ beats, compact = false }) {
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
  <div className={`cs-reel-grid${compact ? " is-compact" : ""}`} ref={ref}>
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
        <span><i className="is-cut" />{compact ? "Cut" : "Cut — spent breath, moved nothing"}</span>
      </div>
      {!compact && (
      <ol className="cs-beats">
        {beats.map((b, i) => (
          <li key={b.t} className={i === beat ? "is-now" : undefined}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <b>{b.t}</b>
            <em>{b.line}</em>
          </li>
        ))}
      </ol>
      )}
    </div>
  </div>
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

