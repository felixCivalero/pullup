import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AdminShell } from "./AdminShell.jsx";
import { PITCHES } from "./pitch/index.js";
import { PitchPlayer } from "./pitch/PitchKit.jsx";

/* /admin/pitch/:slug — plays a client's pitch full screen over the admin
   (pitch/PitchKit.jsx); Esc goes back to that client's project. Pitches live
   under Projekt (the Pitch view, pitch/ProjectPitch.jsx), so /admin/pitch on
   its own goes there. Owner only. Each pitch is code (pitch/<slug>.jsx), so a
   slide can carry any animation we program. Share links: pitch/Share.jsx. */
export function PitchPage() {
  const { slug } = useParams();
  return (
    <AdminShell title="Pitch" fill={!!slug}>
      {slug ? <Play slug={slug} /> : <Navigate to="/admin/projects?vy=pitch" replace />}
    </AdminShell>
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
  if (!entry) return <p style={{ padding: 24 }}>Den pitchen finns inte. <Link to="/admin/projects">Till projekten</Link></p>;
  if (failed) return <p style={{ padding: 24 }}>Kunde inte ladda pitchen. Ladda om sidan.</p>;
  if (!pitch) return null;
  return <PitchPlayer pitch={pitch} onExit={() => navigate(`/admin/projects?kund=${entry.prospectId}&vy=pitch`)} />;
}
