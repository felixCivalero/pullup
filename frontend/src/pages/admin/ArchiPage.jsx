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
export function ArchiPage() {
  const [models, setModels] = useState(null);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    let alive = true;
    authenticatedFetch("/admin/archi/models")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setModels(d.models);
        setCurrent(d.models[0]?.id || null);
      })
      .catch(() => alive && setError(true));
    return () => { alive = false; };
  }, []);

  const model = models?.find((m) => m.id === current) || null;

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

        <div className="ar-bar">
          <b>Archi</b>
          {models && models.length > 1 ? (
            <select value={current || ""} onChange={(e) => setCurrent(e.target.value)}>
              {models.map((m) => <option key={m.id} value={m.id}>{m.venue} · {m.name}</option>)}
            </select>
          ) : model ? <span>{model.venue} · {model.name}</span> : null}
        </div>
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
  .ar-bar { position: absolute; top: 14px; left: 14px; display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 999px; background: rgba(255,255,255,0.92); box-shadow: 0 4px 18px rgba(0,0,0,0.2); font-size: 13px; color: #0a0a0a; }
  .ar-bar b { font-size: 13px; letter-spacing: -0.01em; }
  .ar-bar span { color: #6e6e73; }
  .ar-bar select { font: inherit; font-size: 13px; border: 0; background: none; color: #0a0a0a; }
  .ar-help { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); margin: 0; padding: 7px 12px; border-radius: 999px; background: rgba(0,0,0,0.45); color: rgba(255,255,255,0.85); font-size: 12px; white-space: nowrap; pointer-events: none; }
  @media (max-width: 620px) { .ar-help { white-space: normal; text-align: center; width: calc(100% - 32px); border-radius: 14px; } }
  .ar-msg { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); margin: 0; color: rgba(255,255,255,0.8); font-size: 14px; }
  .ar-loading { padding: 10px 14px; border-radius: 12px; background: rgba(0,0,0,0.6); color: #fff; font: 600 13px -apple-system, BlinkMacSystemFont, sans-serif; white-space: nowrap; }
`;
