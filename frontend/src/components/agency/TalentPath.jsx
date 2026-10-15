import { Reveal } from "./Reveal.jsx";
import { useT } from "./i18n.js";

/* The bench: specialists pulled in the moment a brand's direction calls for
   them — never staffed up in advance. One example path, left to right: what
   the brand is heading for, who we pull in, what gets built — and underneath,
   the brand's infrastructure stacking up as it grows. Roles only, no names or
   headcounts (none verified). */

const PATH = [
  { goal: "Find the direction", pull: ["Strategist", "Brand designer", "Copywriter"], built: "Strategy & identity" },
  { goal: "Show up every week", pull: ["Filmmaker", "Editor", "Photographer"], built: "Content system" },
  { goal: "Gather the people", pull: ["Event producer", "Community lead"], built: "Community, events & CRM" },
  { goal: "See what works", pull: ["Data analyst", "Developer"], built: "Tracking & dashboards" },
  { goal: "Own the platform", pull: ["Product designer", "App developer"], built: "Your own app" },
];

export function TalentPath() {
  const t = useT();
  return (
    <div className="tp">
      <ol className="tp-path">
        {PATH.map((s, i) => (
          <li key={s.goal} className="tp-step" style={{ "--i": i }}>
            <Reveal delay={i * 0.08} className="tp-col">
              <p className="tp-n">{String(i + 1).padStart(2, "0")}</p>
              <p className="tp-goal">{t(s.goal)}</p>
              <p className="tp-k">{t("Pulled in")}</p>
              <ul className="tp-pull">
                {s.pull.map((r) => <li key={r}>{t(r)}</li>)}
              </ul>
              <p className="tp-k">{t("Built")}</p>
              <p className="tp-built">{t(s.built)}</p>
              <div className="tp-stack" aria-hidden="true">
                {PATH.slice(0, i + 1).map((l, j) => (
                  <span key={l.built} className={j === i ? "is-new" : undefined} style={{ "--j": j }} />
                ))}
              </div>
            </Reveal>
          </li>
        ))}
      </ol>
      <div className="tp-foot">
        <span className="tp-axis">{t("Your brand's direction")} →</span>
        <span className="tp-note">{t("An example path — every brand's is different.")}</span>
      </div>
    </div>
  );
}

export const TALENT_CSS = `
  .tp-h2 { max-width: 18ch; }
  .tp-lede { margin: -16px 0 clamp(32px, 4vw, 48px); max-width: 60ch; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.55; color: #333; }
  .tp-path { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: 1fr; gap: 10px; }
  @media (min-width: 1000px) { .tp-path { grid-template-columns: repeat(5, 1fr); } }
  .tp-step, .tp-col { height: 100%; }
  .tp-col {
    display: flex; flex-direction: column; gap: 8px;
    border: 1px solid var(--pc-black); border-radius: 18px; padding: 20px 18px 18px;
  }
  .tp-n { font-size: 13px; font-weight: 600; color: #D9480F; font-variant-numeric: tabular-nums; }
  .tp-goal { font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.15; min-height: 2.3em; }
  .tp-k { margin-top: 10px; font-size: 11px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--pc-grey); }
  .tp-pull { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .tp-pull li { font-size: 13px; font-weight: 500; padding: 5px 10px; border-radius: 999px; background: #000; color: #fff; }
  .tp-built { font-size: 15px; font-weight: 600; color: #D9480F; }
  .tp-stack { margin-top: auto; padding-top: 16px; display: flex; flex-direction: column-reverse; gap: 3px; }
  .tp-stack span {
    height: 10px; border-radius: 3px;
    background: color-mix(in srgb, #D9480F calc(18% + var(--j) * 6%), #f1f1ee);
    transform: scaleX(0); transform-origin: left;
    transition: transform 0.7s cubic-bezier(0.16,1,0.3,1) calc(0.3s + var(--j) * 0.08s);
  }
  .tp-stack span.is-new { background: #D9480F; }
  .pc-reveal.is-in .tp-stack span { transform: none; }
  @media (prefers-reduced-motion: reduce) { .tp-stack span { transition: none; transform: none; } }
  .tp-foot { margin-top: 16px; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 20px; }
  .tp-axis { font-size: 14px; font-weight: 600; }
  .tp-note { font-size: 12px; color: var(--pc-grey); }
  @media (max-width: 999px) {
    .tp-goal { min-height: 0; }
    .tp-stack { flex-direction: row; padding-top: 12px; }
    .tp-stack span { flex: 1; height: 8px; }
  }
`;
