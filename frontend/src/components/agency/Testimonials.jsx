import { useState } from "react";
import { WORDS } from "./testimonialsData.js";
import { useT } from "./i18n.js";

/* What clients say — small cards, three across, under the logo band (a swipeable
   row on phones). Words in testimonialsData.js. */
const LIVE = WORDS.filter((w) => w.quote);
const initials = (name) => name.split(" ").map((p) => p[0]).slice(0, 2).join("");

// The person's photo, or their initials until the file is there (or if it
// fails to load). Photos live in public/landing/people/.
export function Avatar({ person, className }) {
  const [broken, setBroken] = useState(false);
  if (person.photo && !broken) {
    return (
      <img
        // A pre-rendered page may fail the image before React is listening.
        ref={(img) => { if (img?.complete && img.naturalWidth === 0) setBroken(true); }}
        src={person.photo}
        alt=""
        loading="lazy"
        decoding="async"
        style={person.focus ? { objectPosition: person.focus } : undefined}
        onError={() => setBroken(true)}
      />
    );
  }
  return <span className={className} aria-hidden="true">{initials(person.who)}</span>;
}

export function Testimonials() {
  const t = useT();
  if (!LIVE.length) return null;
  return (
    <ul className="tm">
      {LIVE.map((w) => (
        <li key={w.who} className={`tm-card${!w.lead && t(w.quote).length < 60 ? " is-short" : ""}`}>
          <blockquote>
            {w.lead && <b className="tm-lead">“{t(w.lead)}</b>}
            {w.lead ? `${t(w.quote)}”` : `“${t(w.quote)}”`}
          </blockquote>
          <p className="tm-by">
            <Avatar person={w} className="tm-mono" />
            <span><b>{w.who}</b>{t(w.org)}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}

export const TESTIMONIALS_CSS = `
  .tm { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
  @media (min-width: 720px) { .tm { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  @media (min-width: 1080px) { .tm { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
  .tm-card { border: 1px solid rgba(0,0,0,0.12); border-radius: 18px; padding: 20px 20px 18px; display: flex; flex-direction: column; justify-content: space-between; gap: 20px; background: #fff; }
  .tm-card blockquote { margin: 0; font-size: 15.5px; line-height: 1.45; font-weight: 500; letter-spacing: -0.01em; color: #0a0a0a; }
  .tm-lead { display: block; margin-bottom: 8px; font-size: clamp(22px, 2vw, 26px); line-height: 1.12; font-weight: 700; letter-spacing: -0.03em; }
  .tm-card.is-short blockquote { font-size: clamp(22px, 2vw, 26px); line-height: 1.12; font-weight: 700; letter-spacing: -0.03em; }
  .tm-by { display: flex; align-items: center; gap: 10px; }
  .tm-by img, .tm-mono { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; flex: none; }
  .tm-mono { display: grid; place-items: center; background: #f2f2f2; color: #0a0a0a; font-size: 12px; font-weight: 700; letter-spacing: 0.02em; }
  .tm-by > span:last-child { display: grid; font-size: 13px; color: #6e6e73; line-height: 1.3; }
  .tm-by b { font-size: 14px; color: #0a0a0a; letter-spacing: -0.01em; }
  /* phones: one swipeable row */
  @media (max-width: 719px) {
    .tm { grid-auto-flow: column; grid-auto-columns: 78%; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; margin: 0 calc(-1 * clamp(16px, 5vw, 56px)); padding: 0 clamp(16px, 5vw, 56px) 4px; }
    .tm::-webkit-scrollbar { display: none; }
    .tm-card { scroll-snap-align: start; scroll-margin-left: clamp(16px, 5vw, 56px); }
  }
`;
