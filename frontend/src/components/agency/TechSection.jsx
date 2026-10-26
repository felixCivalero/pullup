import { Reveal } from "./Reveal.jsx";
import { useT } from "./i18n.js";

/* The front page's tech section, before the offer (Felix 2026-10-26): his
   actual skills as one scrolling row, then the products he built, each with a
   picture. Concrete on purpose — not "AI" talk anyone can claim. Every tool is
   in a stack he has shipped (pullup, kazikazi, growhouse repos); Kaijas and
   Growhouse are described in Felix's words. KaziKazi is in TestFlight — never
   say "in the App Store". */

const SKILLS = [
  "JavaScript", "TypeScript", "SQL", "GraphQL",
  "React", "React Native", "Expo", "Astro", "Vite", "Three.js",
  "Node.js", "Express", "Fastify", "REST APIs", "Queues and cron jobs",
  "PostgreSQL", "Supabase", "MongoDB", "Redis",
  "Stripe", "M-Pesa", "Shopify API", "Meta Graph API", "WhatsApp Cloud API", "Google APIs",
  "AWS", "nginx", "Cloudflare", "Sentry", "App Store and Google Play builds",
];
// Tool names stay as they are ("Express" must never become "Uttryck"); only
// these descriptions are translated.
const WORDS = new Set(["REST APIs", "Queues and cron jobs", "App Store and Google Play builds"]);

// [name, kind, line, stack, visual]. No Kaijas code on this machine, so its
// stack stays unsaid and its picture is a drawn seating plan, not a screenshot.
const BUILT = [
  ["Kaijas Musiksalong", "Booking and seating", "A custom booking and table-seating system, with a CRM connected to the till.", [], "kaijas"],
  ["Growhouse", "Tracking", "A tracking pixel that follows purchases back to organic Instagram posts.", ["Node.js", "GraphQL", "MongoDB", "Shopify"], "growhouse"],
  ["KaziKazi", "App for iOS and Android", "Daily work and errands in Kenya — M-Pesa payments, real-time chat, calls and maps.", ["TypeScript", "React Native", "Fastify", "Supabase"], "kazikazi"],
  ["PullUp", "Event platform", "The platform this site runs on — events, sign-ups, CRM and email with tracking.", ["React", "Node.js", "PostgreSQL"], "pullup"],
];

// A drawn floor plan: the stage, round tables with their seats, booked ones lit.
function SeatingPlan() {
  const t = useT();
  const tables = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) tables.push({ x: 70 + c * 86, y: 92 + r * 62, booked: [0, 1, 3, 5, 6, 9, 10].includes(r * 4 + c) });
  }
  return (
    <svg className="tx-plan" viewBox="0 0 400 280" role="img" aria-label={t("A drawn seating plan: a stage and twelve tables, seven of them booked")}>
      <rect x="110" y="20" width="180" height="34" rx="6" className="tx-plan-stage" />
      <text x="200" y="42" textAnchor="middle" className="tx-plan-t">{t("Stage")}</text>
      {tables.map(({ x, y, booked }, i) => (
        <g key={i} className={booked ? "is-booked" : undefined}>
          {[0, 1, 2, 3].map((s) => {
            const a = (s * Math.PI) / 2 + Math.PI / 4;
            return <circle key={s} cx={x + Math.cos(a) * 22} cy={y + Math.sin(a) * 22} r="4.5" className="tx-plan-seat" />;
          })}
          <circle cx={x} cy={y} r="14" className="tx-plan-table" />
          <text x={x} y={y + 4} textAnchor="middle" className="tx-plan-n">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

function Visual({ kind }) {
  if (kind === "kaijas") return <SeatingPlan />;
  if (kind === "growhouse") return <img className="tx-fill" src="/built/growhouse-dashboard.webp" alt="" loading="lazy" decoding="async" />;
  if (kind === "kazikazi") {
    return (
      <div className="tx-phones">
        <img src="/built/kazikazi-feed.webp" alt="" loading="lazy" decoding="async" />
        <img src="/built/kazikazi-create.webp" alt="" loading="lazy" decoding="async" />
      </div>
    );
  }
  return (
    <div className="tx-browser">
      <span className="tx-browser-bar" aria-hidden="true"><i /><i /><i /><b>pullup.se/pullup</b></span>
      <img src="/built/pullup-event-platform.webp" alt="" loading="lazy" decoding="async" />
    </div>
  );
}

export function TechSection() {
  const t = useT();
  return (
    <section id="tech" className="fl-sec fl-rule tx" data-pc-section="tech" data-pc-order="5">
      <div className="fl-wrap">
        <Reveal><h2 className="fl-h2">{t("My technical skills")}</h2></Reveal>
      </div>
      <div className="tx-row" aria-label={t("My technical skills")}>
        <ul className="tx-track">
          {[0, 1].map((copy) =>
            SKILLS.map((s) => (
              <li key={`${copy}-${s}`} aria-hidden={copy === 1 || undefined}>{WORDS.has(s) ? t(s) : s}</li>
            )),
          )}
        </ul>
      </div>
      <div className="fl-wrap">
        <Reveal><h2 className="fl-h2 tx-h2">{t("Products I've built")}</h2></Reveal>
        <div className="tx-built">
          {BUILT.map(([name, kind, line, stack, visual], i) => (
            <Reveal key={name} delay={0.05 * (i % 2)}>
              <article className="tx-card">
                <div className={`tx-vis tx-vis-${visual}`}><Visual kind={visual} /></div>
                <div className="tx-body">
                  <p className="tx-k">{t(kind)}</p>
                  <h3>{name}</h3>
                  <p className="tx-line">{t(line)}</p>
                  {stack.length > 0 && (
                    <ul className="tx-stack">{stack.map((s) => <li key={s}>{s}</li>)}</ul>
                  )}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export const TECH_CSS = `
  .tx { --tx-bg: #0b0b0c; --tx-line: rgba(255,255,255,0.1); --mono: ui-monospace, "SF Mono", Menlo, monospace; }

  /* skills: one row, sliding sideways on its own; still for reduced motion */
  .tx-row { margin-top: clamp(28px, 3.4vw, 44px); overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
  .tx-track { list-style: none; margin: 0; padding: 0; display: flex; gap: 10px; width: max-content; animation: tx-slide 60s linear infinite; }
  .tx-row:hover .tx-track { animation-play-state: paused; }
  .tx-track li { flex: none; padding: 10px 16px; border-radius: 999px; border: 1px solid var(--rule); background: #fafaf9; font-family: var(--mono); font-size: 14px; white-space: nowrap; color: #222; }
  @keyframes tx-slide { to { transform: translateX(calc(-50% - 5px)); } }
  @media (prefers-reduced-motion: reduce) {
    .tx-row { overflow-x: auto; }
    .tx-track { animation: none; }
  }

  /* products */
  .tx-h2 { margin-top: clamp(64px, 8vw, 104px); }
  .tx-built { margin-top: clamp(28px, 3.4vw, 44px); display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: 16px; }
  .tx-built > div { height: 100%; }
  .tx-card { height: 100%; display: flex; flex-direction: column; border-radius: 22px; overflow: hidden; background: var(--tx-bg); color: #fff; border: 1px solid #1d1d20; }
  .tx-vis {
    position: relative; aspect-ratio: 16 / 10; overflow: hidden; display: grid; place-items: center;
    background:
      radial-gradient(60% 70% at 70% 0%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 70%),
      radial-gradient(circle, rgba(255,255,255,0.09) 1px, transparent 1.2px) 0 0 / 18px 18px,
      #111113;
    border-bottom: 1px solid var(--tx-line);
  }
  .tx-fill { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 15%; }
  .tx-phones { position: absolute; inset: 0; display: flex; justify-content: center; align-items: flex-start; gap: 18px; padding-top: 9%; }
  .tx-phones img { width: 34%; border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.12); }
  .tx-phones img:first-child { transform: rotate(-5deg) translateY(6%); }
  .tx-phones img:last-child { transform: rotate(4deg); }
  .tx-browser { position: absolute; left: 9%; right: 9%; top: 11%; border-radius: 12px 12px 0 0; overflow: hidden; background: #fff; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
  .tx-browser-bar { display: flex; align-items: center; gap: 6px; padding: 9px 12px; background: #1c1c1f; }
  .tx-browser-bar i { width: 9px; height: 9px; border-radius: 50%; background: #3a3a3e; }
  .tx-browser-bar b { margin-left: 10px; font-family: var(--mono); font-size: 11px; font-weight: 400; color: #9a9aa0; }
  .tx-browser img { display: block; width: 100%; }
  .tx-plan { width: 86%; height: auto; }
  .tx-plan-stage { fill: color-mix(in srgb, var(--accent) 22%, transparent); stroke: var(--accent); }
  .tx-plan-t { fill: #fff; font-family: var(--mono); font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; }
  .tx-plan-table { fill: #1c1c1f; stroke: rgba(255,255,255,0.28); }
  .tx-plan-seat { fill: rgba(255,255,255,0.22); }
  .tx-plan-n { fill: rgba(255,255,255,0.6); font-family: var(--mono); font-size: 10px; }
  .tx-plan .is-booked .tx-plan-table { fill: var(--accent); stroke: var(--accent); }
  .tx-plan .is-booked .tx-plan-seat { fill: var(--accent); }
  .tx-plan .is-booked .tx-plan-n { fill: #fff; }
  .tx-body { flex: 1; display: flex; flex-direction: column; padding: clamp(22px, 2.4vw, 30px); }
  .tx-k { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); }
  .tx-body h3 { margin-top: 8px; font-size: clamp(24px, 2.2vw, 30px); font-weight: 700; letter-spacing: -0.03em; }
  .tx-line { margin-top: 8px; font-size: 16px; line-height: 1.5; color: rgba(255,255,255,0.72); }
  .tx-stack { list-style: none; margin: auto 0 0; padding: 18px 0 0; display: flex; flex-wrap: wrap; gap: 6px; }
  .tx-stack li { font-family: var(--mono); font-size: 12px; padding: 5px 10px; border-radius: 999px; border: 1px solid var(--tx-line); color: rgba(255,255,255,0.8); }
`;
