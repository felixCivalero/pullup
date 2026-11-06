import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";
import { PITCHES } from "./pitch/index.js";
import { PitchPlayer } from "./pitch/PitchKit.jsx";

/* /admin/pitch — Felix's pitches, one card per client (its sheet ID links
   it to Sälj and Projekt); /admin/pitch/:slug plays one
   full screen over the admin (pitch/PitchKit.jsx). Owner only. Each pitch is
   code (pitch/<slug>.jsx), so a slide can carry any animation we program.
   Dela makes a share link (pullup.se/share/p/<token> → /s/<token>, migs 160-161): open to anyone
   who has it, without signing in, until it expires or is closed here. */
export function PitchPage() {
  const { slug } = useParams();
  return (
    <AdminShell title="Pitch" fill={!!slug}>
      {slug ? <Play slug={slug} /> : <List />}
    </AdminShell>
  );
}

const SHARE_DAYS = [[1, "1 dag"], [7, "7 dagar"], [30, "30 dagar"]];
// The link to send: /share/p/ gives link previews the pitch's own card and
// sends people on to /s/<token> (routes/adminPitch.js).
const shareUrl = (token) => `${window.location.origin}/share/p/${token}`;
const shortDate = (iso) => new Date(iso).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });

function List() {
  const [links, setLinks] = useState([]);
  const load = () => authenticatedFetch("/admin/pitch-links").then((r) => (r.ok ? r.json() : null)).then((d) => d && setLinks(d.links)).catch(() => {});
  useEffect(() => { load(); }, []);
  return (
    <div className="pl">
      <style>{LIST_CSS}</style>
      <header>
        <p className="mg-kicker">Byrå</p>
        <h1>Pitcher</h1>
        <p className="pl-sub">Öppna en och presentera. Pilar eller klick bläddrar, F ger helskärm, N visar dina anteckningar, Esc tar dig tillbaka. Dela ger en länk som bara den som har den kan öppna, tills den går ut.</p>
      </header>
      <div className="pl-grid">
        {PITCHES.map((p) => (
          <div key={p.slug} className="pl-card">
            <Link to={`/admin/pitch/${p.slug}`} className="pl-img">{p.cover && <img src={p.cover} alt="" />}</Link>
            <div className="pl-meta">
              <span>{p.client} · {p.prospectId}</span>
              <Link to={`/admin/pitch/${p.slug}`}><strong>{p.title}</strong></Link>
              <em>{p.slides} bilder · {p.date}</em>
              <nav className="pl-links">
                <Link to={`/admin/pitch/${p.slug}`}>Presentera</Link>
                {p.project && <Link to={`/admin/projects?kund=${p.prospectId}`}>Projekt</Link>}
                <Link to="/admin/sales">Sälj</Link>
              </nav>
              <Share pitch={p} links={links.filter((l) => l.slug === p.slug)} onChange={load} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Make a link, copy it, see who opened it, close it.
function Share({ pitch, links, onChange }) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [now] = useState(() => Date.now()); // when the page opened; good enough for "still open"
  const open = links.filter((l) => !l.revokedAt && new Date(l.expiresAt).getTime() > now);

  const copy = async (token) => {
    try { await navigator.clipboard.writeText(shareUrl(token)); } catch { /* the link is on screen anyway */ }
    setCopied(token);
    setTimeout(() => setCopied((c) => (c === token ? null : c)), 2000);
  };
  const create = async () => {
    setBusy(true);
    const r = await authenticatedFetch("/admin/pitch-links", { method: "POST", body: JSON.stringify({ slug: pitch.slug, prospectId: pitch.prospectId, days, share: pitch.share }) }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return;
    const link = await r.json();
    await onChange();
    copy(link.token);
  };
  const close = async (token) => {
    await authenticatedFetch(`/admin/pitch-links/${token}`, { method: "DELETE" }).catch(() => null);
    onChange();
  };

  return (
    <div className="pl-share">
      <div className="pl-share-new">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Hur länge länken är öppen">
          {SHARE_DAYS.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
        </select>
        <button type="button" onClick={create} disabled={busy}>{busy ? "Skapar…" : "Dela länk"}</button>
      </div>
      {open.map((l) => (
        <div key={l.token} className="pl-share-link">
          <code title={shareUrl(l.token)}>/share/p/{l.token.slice(0, 6)}…</code>
          <small>till {shortDate(l.expiresAt)} · {l.views} {l.views === 1 ? "visning" : "visningar"}</small>
          <button type="button" onClick={() => copy(l.token)}>{copied === l.token ? "Kopierad" : "Kopiera"}</button>
          <button type="button" className="pl-close" onClick={() => close(l.token)}>Stäng</button>
        </div>
      ))}
    </div>
  );
}

function Play({ slug }) {
  const navigate = useNavigate();
  const entry = PITCHES.find((p) => p.slug === slug);
  const [pitch, setPitch] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!entry) return undefined;
    let alive = true;
    entry.load().then((m) => alive && setPitch(m.pitch)).catch(() => alive && setFailed(true));
    return () => { alive = false; };
  }, [entry]);
  if (!entry) return <p style={{ padding: 24 }}>Den pitchen finns inte. <Link to="/admin/pitch">Till pitcherna</Link></p>;
  if (failed) return <p style={{ padding: 24 }}>Kunde inte ladda pitchen. Ladda om sidan.</p>;
  if (!pitch) return null;
  return <PitchPlayer pitch={pitch} onExit={() => navigate("/admin/pitch")} />;
}

const LIST_CSS = `
  .pl { max-width: 1180px; margin: 0 auto; padding: 40px clamp(16px, 4vw, 40px) 80px; }
  .pl h1 { font-size: clamp(40px, 6vw, 64px); letter-spacing: -0.045em; margin: 10px 0 8px; }
  .pl-sub { margin: 0 0 32px; color: #5f5e5a; font-size: 15px; max-width: 640px; }
  .pl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
  .pl-card { display: flex; flex-direction: column; text-decoration: none; color: inherit; background: #fbfaf7; border: 1px solid #7d7c77; border-radius: 10px; overflow: hidden; box-shadow: 3px 3px 0 rgba(0,0,0,.12); transition: transform .15s ease, box-shadow .15s ease; }
  .pl-card:hover { transform: translate(-2px, -2px); box-shadow: 5px 5px 0 rgba(0,0,0,.16); }
  .pl-img { display: block; aspect-ratio: 16 / 9; background: #151515; overflow: hidden; }
  .pl-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pl-meta { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px 16px; }
  .pl-meta span { font: 700 11px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .08em; text-transform: uppercase; color: #ec178f; }
  .pl-meta strong { font-size: 19px; letter-spacing: -0.02em; }
  .pl-meta em { font-style: normal; font-size: 13px; color: #6e6e73; }
  .pl-meta a { color: inherit; text-decoration: none; }
  .pl-links { display: flex; gap: 14px; margin-top: 8px; }
  .pl-links a { font: 700 11px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .06em; text-transform: uppercase; color: #3a3935; border-bottom: 1px solid #9b9a95; }
  .pl-links a:hover { color: #ec178f; border-color: #ec178f; }
  .pl-share { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; padding-top: 12px; border-top: 1px dashed #b7b6b1; }
  .pl-share-new { display: flex; gap: 6px; }
  .pl-share select, .pl-share button { font: 700 11px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .05em; text-transform: uppercase; border: 1px solid #7d7c77; border-radius: 5px; background: linear-gradient(180deg, #fbfaf7, #dddcd7); padding: 6px 8px; color: #111; cursor: pointer; }
  .pl-share-new button { background: #ec178f; border-color: #b80f6d; color: #fff; }
  .pl-share button:disabled { opacity: .6; cursor: default; }
  .pl-share-link { display: flex; align-items: center; gap: 8px; font-size: 12px; }
  .pl-share-link code { font: 12px ui-monospace, "SF Mono", Menlo, monospace; color: #3a3935; }
  .pl-share-link small { flex: 1; color: #6e6e73; font-size: 12px; }
  .pl-share-link button { padding: 3px 6px; font-size: 10px; }
  .pl-share-link .pl-close { color: #a3122b; }
`;
