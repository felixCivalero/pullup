import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Play } from "lucide-react";
import { Share, SHARE_CSS } from "./Share.jsx";

/* A project's Pitch view: the client's pitch itself (pitch/<slug>.jsx, the
   same one as under Pitch, never a copy), as the ground the project stands
   on. Every slide is listed and opens the pitch right there; Presentera and
   Dela work as on the Pitch page. */
export function ProjectPitch({ entry, projectName }) {
  const [pitch, setPitch] = useState(null);
  useEffect(() => {
    if (!entry) return undefined;
    let alive = true;
    entry.load().then((m) => alive && setPitch(m.pitch)).catch(() => {});
    return () => { alive = false; };
  }, [entry]);

  if (!entry) {
    return (
      <div className="pp">
        <style>{CSS}</style>
        <div className="pp-page">
          <p className="pp-kicker">Pitch · {projectName}</p>
          <h1>Ingen pitch än</h1>
          <p className="pp-lead">Pitchen är grunden i projektet: resan som strategin, buckets och tidslinjen bygger på. Be Claude bygga en till {projectName}, så kopplas den hit.</p>
          <Link to="/admin/pitch" className="pp-btn">Alla pitcher</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="pp">
      <style>{CSS + SHARE_CSS}</style>
      <div className="pp-page">
        <p className="pp-kicker">Pitch · grunden för projektet</p>
        <h1>{entry.title}</h1>
        <div className="pp-hero">
          <Link to={`/admin/pitch/${entry.slug}`} className="pp-cover">
            {entry.cover && <img src={entry.cover} alt="" />}
            <span><Play size={22} /> Presentera</span>
          </Link>
          <div className="pp-side">
            <p className="pp-lead">{entry.share?.description}</p>
            <Link to={`/admin/pitch/${entry.slug}`} className="pp-btn"><Play size={14} /> Presentera</Link>
            <Share pitch={entry} />
          </div>
        </div>
        {pitch && (
          <ol className="pp-slides">
            {pitch.slides.map((s, i) => (
              <li key={s.id}>
                <Link to={`/admin/pitch/${entry.slug}?s=${i + 1}`}>
                  <em>{String(i + 1).padStart(2, "0")}</em>
                  <span>{s.title || s.id}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

const CSS = `
  .pp { position: absolute; inset: 0; overflow-y: auto; background: #fbfbf9; }
  .pp-page { max-width: 1080px; margin: 0 auto; padding: 96px clamp(16px, 4vw, 40px) 100px; }
  .pp-kicker { margin: 0; font: 700 11.5px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: #ec178f; }
  .pp h1 { margin: 8px 0 24px; font-size: clamp(36px, 5vw, 56px); letter-spacing: -0.045em; line-height: 1; }
  .pp-hero { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(240px, 1fr); gap: 24px; align-items: start; }
  .pp-cover { position: relative; display: block; aspect-ratio: 16 / 9; border-radius: 14px; overflow: hidden; background: #151515; box-shadow: 4px 4px 0 rgba(0,0,0,.14); }
  .pp-cover img { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform .4s ease; }
  .pp-cover:hover img { transform: scale(1.03); }
  .pp-cover span { position: absolute; left: 18px; bottom: 16px; display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border-radius: 999px; background: rgba(0,0,0,.6); color: #fff; font-weight: 700; font-size: 15px; }
  .pp-side { display: flex; flex-direction: column; gap: 12px; }
  .pp-lead { margin: 0; font-size: 17px; line-height: 1.5; color: #3a3935; }
  .pp-btn { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; padding: 9px 16px; border-radius: 999px; background: #151515; color: #fff; text-decoration: none; }
  .pp-btn:hover { background: #ec178f; }
  .pp-slides { list-style: none; margin: 36px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
  .pp-slides a { display: flex; gap: 12px; align-items: baseline; padding: 12px 14px; border: 1px solid #e2e0da; border-radius: 10px; background: #fff; color: #151515; text-decoration: none; font-weight: 600; }
  .pp-slides a:hover { border-color: #151515; }
  .pp-slides em { font: 700 12px ui-monospace, "SF Mono", Menlo, monospace; font-style: normal; color: #ec178f; }
  @media (max-width: 760px) { .pp-hero { grid-template-columns: 1fr; } .pp-page { padding-top: 130px; } }
`;
