import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, Center, Environment, Html, OrbitControls, useGLTF, useProgress } from "@react-three/drei";
import { authenticatedFetch } from "../../lib/api.js";
import { AdminShell } from "./AdminShell.jsx";

/* /admin/archi — Archi, simplest version: walk around a venue in 3D (the
   SpaceFill viewer from ~/Projects/archi.pullup — same camera, light and
   sunset environment, orbit controls), without its upload, material chat or
   object placement. Models come from the private "archi" bucket as
   short-lived links (routes/adminArchi.js). The long-term idea: AI-generated
   visualisations of concerts and events in real venues. */
// Venues on the way, listed for the feel of the picker until they have a model.
const SOON = ["Münchenbryggeriet", "Fotografiska", "Cirkus", "Berns", "Annexet"];

export function ArchiPage() {
  const [models, setModels] = useState(null);
  const [error, setError] = useState(false);
  const [venue, setVenue] = useState(null);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/admin/archi/models")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setModels(d.models);
        setVenue(d.models[0]?.venue || null);
        setCurrent(d.models[0]?.id || null);
      })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);

  const venues = models ? [...new Set(models.map((m) => m.venue))] : [];
  const soon = SOON.filter((v) => !venues.includes(v));
  const versions = (models || []).filter((m) => m.venue === venue);
  const model = versions.find((m) => m.id === current) || null;
  const pick = (v) => { setVenue(v); setCurrent(models.find((m) => m.venue === v)?.id || null); };

  return (
    <AdminShell title="Archi" fill>
      <style>{CSS}</style>
      <div className="ar">
        {/* Start high and at an angle (Bounds keeps the direction, sets the distance). */}
        <Canvas shadows camera={{ position: [70, 55, 90], fov: 50, near: 0.1, far: 5000 }}>
          <ambientLight intensity={0.5} />
          <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
          <Suspense fallback={null}>
            <Environment preset="sunset" />
          </Suspense>
          {model && (
            <Suspense fallback={<Loading />}>
              <Bounds fit clip observe margin={0.9}>
                {/* Venues are exported in site coordinates (km from origin) — centre them. */}
                <Center>
                  <Venue url={model.url} />
                </Center>
              </Bounds>
            </Suspense>
          )}
          <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxDistance={1500} />
        </Canvas>

        {models && (
          <nav className="ar-venues" aria-label="Venues">
            <b>Venues</b>
            {venues.map((v) => (
              <button key={v} className={v === venue ? "is-on" : ""} onClick={() => pick(v)}>
                <span>{v}</span>
                <small>{models.filter((m) => m.venue === v).length > 1 ? `${models.filter((m) => m.venue === v).length} modeller` : models.find((m) => m.venue === v).name}</small>
              </button>
            ))}
            {soon.map((v) => (
              <button key={v} className={`is-soon ${v === venue ? "is-on" : ""}`} onClick={() => pick(v)}>
                <span>{v}</span>
                <small>Kommer snart</small>
              </button>
            ))}
          </nav>
        )}
        {versions.length > 1 && (
          <select className="ar-version" value={current || ""} onChange={(e) => setCurrent(e.target.value)}>
            {versions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {models && venue && !versions.length && (
          <p className="ar-msg"><b>{venue}</b><br />Den här lokalen är inte modellerad än.</p>
        )}
        <p className="ar-help">Dra för att rotera · högerklick eller två fingrar för att flytta · scrolla eller nyp för att zooma</p>
        {error && <p className="ar-msg">Kunde inte hämta modellerna.</p>}
        {models && !models.length && <p className="ar-msg">Inga modeller i Archi än.</p>}
      </div>
    </AdminShell>
  );
}

function Venue({ url }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} />;
}

function Loading() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="ar-loading">Laddar modellen… {Math.round(progress)} %</div>
    </Html>
  );
}

const CSS = `
  .ar { position: relative; width: 100%; height: 100%; background: linear-gradient(#2b2a33, #0d0c12); }
  .ar canvas { touch-action: none; }
  .ar-venues { position: absolute; top: 14px; left: 14px; width: 220px; display: grid; gap: 2px; padding: 8px; border-radius: 16px; background: rgba(255,255,255,0.92); box-shadow: 0 4px 18px rgba(0,0,0,0.2); color: #0a0a0a; }
  .ar-venues b { padding: 4px 8px 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #6e6e73; }
  .ar-venues button { display: grid; gap: 1px; text-align: left; font: inherit; border: 0; border-radius: 10px; padding: 8px 10px; background: none; color: inherit; cursor: pointer; }
  .ar-venues button:hover { background: rgba(0,0,0,0.05); }
  .ar-venues button.is-on { background: #0a0a0a; color: #fff; }
  .ar-venues button span { font-size: 13.5px; font-weight: 600; letter-spacing: -0.01em; }
  .ar-venues button small { font-size: 11.5px; opacity: 0.6; }
  .ar-venues button.is-soon span { opacity: 0.55; }
  .ar-venues button.is-soon.is-on span { opacity: 0.8; }
  .ar-version { position: absolute; top: 14px; right: 14px; font: inherit; font-size: 13px; padding: 8px 12px; border: 0; border-radius: 999px; background: rgba(255,255,255,0.92); box-shadow: 0 4px 18px rgba(0,0,0,0.2); color: #0a0a0a; }
  @media (max-width: 620px) {
    .ar-venues { left: 0; right: 0; top: 10px; width: auto; margin: 0 16px; display: flex; overflow-x: auto; border-radius: 14px; scrollbar-width: none; }
    .ar-venues b { display: none; }
    .ar-venues button { flex: none; }
    .ar-version { top: auto; bottom: 60px; right: 16px; }
  }
  .ar-help { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); margin: 0; padding: 7px 12px; border-radius: 999px; background: rgba(0,0,0,0.45); color: rgba(255,255,255,0.85); font-size: 12px; white-space: nowrap; pointer-events: none; }
  @media (max-width: 620px) { .ar-help { white-space: normal; text-align: center; width: calc(100% - 32px); border-radius: 14px; } }
  .ar-msg { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); margin: 0; color: rgba(255,255,255,0.8); font-size: 14px; text-align: center; line-height: 1.5; }
  .ar-msg b { font-size: 20px; color: #fff; letter-spacing: -0.02em; }
  .ar-loading { padding: 10px 14px; border-radius: 12px; background: rgba(0,0,0,0.6); color: #fff; font: 600 13px -apple-system, BlinkMacSystemFont, sans-serif; white-space: nowrap; }
`;
