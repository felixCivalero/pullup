import { useEffect, useRef, useState } from "react";
import {
  BookOpen, CalendarCheck, CalendarDays, Camera, ChartLine, Clapperboard, Compass, Contact, Globe,
  LayoutDashboard, Mail, Megaphone, MessageCircle, PenTool, Share2, Smartphone, Ticket, Type, Users, Workflow,
} from "lucide-react";
import { useT } from "./i18n.js";

/* The toolkit: everything we can build, always on the shelf. A direction
   lights up only the tools it needs — the point is "pulled in when needed",
   not "everything at once". Directions cycle on their own while the grid is
   on screen; a tap (or hover on a tile) takes over. */

const TOOLS = [
  ["strategy", Compass, "Brand strategy"],
  ["identity", PenTool, "Identity & design"],
  ["copy", Type, "Copywriting"],
  ["video", Clapperboard, "Short-form video"],
  ["photo", Camera, "Photography"],
  ["social", Share2, "Social channels"],
  ["campaigns", Megaphone, "Campaigns"],
  ["events", CalendarDays, "Events"],
  ["tickets", Ticket, "Ticketing"],
  ["booking", CalendarCheck, "Booking systems"],
  ["community", Users, "Community"],
  ["crm", Contact, "People CRM"],
  ["email", Mail, "Email"],
  ["whatsapp", MessageCircle, "WhatsApp"],
  ["tracking", ChartLine, "Tracking"],
  ["dashboards", LayoutDashboard, "Dashboards"],
  ["web", Globe, "Websites"],
  ["app", Smartphone, "Your own app"],
  ["print", BookOpen, "Print & journals"],
  ["automation", Workflow, "Automation"],
];

const DIRECTIONS = [
  ["Find the voice", ["strategy", "identity", "copy", "video", "photo"]],
  ["Show up everywhere", ["video", "photo", "copy", "social", "campaigns", "tracking"]],
  ["Fill the room", ["events", "tickets", "email", "whatsapp", "community", "campaigns"]],
  ["Know your people", ["crm", "community", "tracking", "dashboards", "email", "whatsapp"]],
  ["Own the platform", ["app", "web", "booking", "dashboards", "automation", "print"]],
];

export function Toolkit() {
  const t = useT();
  const [dir, setDir] = useState(0);
  const [auto, setAuto] = useState(true);
  const [hover, setHover] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!auto) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    let id = null;
    const start = () => { if (!id) id = setInterval(() => setDir((d) => (d + 1) % DIRECTIONS.length), 2600); };
    const stop = () => { clearInterval(id); id = null; };
    if (typeof IntersectionObserver === "undefined") { start(); return stop; }
    const obs = new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop()), { threshold: 0.25 });
    if (ref.current) obs.observe(ref.current);
    return () => { obs.disconnect(); stop(); };
  }, [auto]);

  const on = new Set(DIRECTIONS[dir][1]);
  return (
    <div className="tk" ref={ref}>
      <div className="tk-dirs" role="tablist" aria-label={t("Pick a direction")}>
        <span className="tk-dirs-k">{t("Your direction")}</span>
        {DIRECTIONS.map(([name], i) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={i === dir}
            className={`tk-dir${i === dir ? " is-on" : ""}${i === dir && auto ? " is-auto" : ""}`}
            onClick={() => { setAuto(false); setDir(i); }}
          >
            {t(name)}
          </button>
        ))}
      </div>
      <ul className="tk-grid">
        {TOOLS.map((tool, i) => {
          const [id, Icon, name] = tool;
          const lit = hover ? hover === id : on.has(id);
          return (
            <li
              key={id}
              className={`tk-tool${lit ? " is-on" : ""}`}
              style={{ "--i": i }}
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="tk-ico"><Icon size={26} strokeWidth={1.75} /></span>
              <span className="tk-name">{t(name)}</span>
            </li>
          );
        })}
      </ul>
      <p className="tk-foot">
        {t("Every tool is on the shelf. We pull in the ones your direction needs — and keep building as you grow.")}
      </p>
    </div>
  );
}

export const TOOLKIT_CSS = `
  .tk-dirs { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 20px; }
  .tk-dirs-k { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.7); margin-right: 6px; }
  .tk-dir {
    position: relative; overflow: hidden;
    font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    padding: 9px 16px; border-radius: 999px;
    color: #fff; background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.28);
    transition: background-color 0.25s ease, color 0.25s ease;
  }
  .tk-dir:hover { background: rgba(255,255,255,0.22); }
  .tk-dir.is-on { background: #fff; color: #D9480F; border-color: #fff; }
  .tk-dir.is-auto::after {
    content: ""; position: absolute; left: 0; bottom: 0; height: 2px; width: 100%;
    background: #D9480F; transform-origin: left; animation: tk-fill 2.6s linear;
  }
  @keyframes tk-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }

  .tk-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
  @media (min-width: 640px) { .tk-grid { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 1000px) { .tk-grid { grid-template-columns: repeat(5, 1fr); } }
  .tk-tool {
    display: flex; align-items: center; gap: 12px;
    padding: 16px; border-radius: 16px;
    background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.16);
    color: rgba(255,255,255,0.55);
    transition: background-color 0.35s ease, color 0.35s ease, transform 0.45s cubic-bezier(0.16,1,0.3,1), box-shadow 0.35s ease, border-color 0.35s ease;
    cursor: default;
  }
  .tk-ico {
    flex: none; width: 46px; height: 46px; border-radius: 12px; display: grid; place-items: center;
    background: rgba(255,255,255,0.1);
    transition: background-color 0.35s ease, color 0.35s ease, transform 0.45s cubic-bezier(0.16,1,0.3,1);
  }
  .tk-name { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.2; }
  .tk-tool.is-on {
    background: #fff; color: #000; border-color: #fff;
    transform: translateY(-4px);
    box-shadow: 0 18px 40px -18px rgba(0,0,0,0.45);
  }
  .tk-tool.is-on .tk-ico { background: #D9480F; color: #fff; transform: rotate(-6deg) scale(1.06); }
  .tk-foot { margin-top: 24px; max-width: 60ch; font-size: clamp(17px, 1.6vw, 20px); line-height: 1.5; color: #fff; font-weight: 500; }
  @media (prefers-reduced-motion: reduce) {
    .tk-tool, .tk-ico { transition: none; }
    .tk-dir.is-auto::after { animation: none; }
  }
  @media (max-width: 640px) {
    .tk-tool { padding: 12px; gap: 10px; border-radius: 14px; }
    .tk-ico { width: 38px; height: 38px; border-radius: 10px; }
    .tk-ico svg { width: 20px; height: 20px; }
    .tk-name { font-size: 13px; }
    .tk-dir { font-size: 13px; padding: 8px 12px; }
  }
`;
