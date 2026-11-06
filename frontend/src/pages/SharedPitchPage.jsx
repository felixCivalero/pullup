import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_BASE } from "../lib/env.js";
import { PITCHES } from "./admin/pitch/index.js";
import { PitchPlayer } from "./admin/pitch/PitchKit.jsx";

/* /s/:token — a pitch shared with a link (mig 160, routes/adminPitch.js).
   Open to anyone who has the token, no sign-in; the server says which pitch
   and whether the link is still open (unknown, expired and closed all read
   the same). Kept out of search engines (noindex here and in robots.txt). */
export function SharedPitchPage() {
  const { token } = useParams();
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/pitch-links/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("closed"))))
      .then(async ({ slug }) => {
        const entry = PITCHES.find((p) => p.slug === slug);
        if (!entry) throw new Error("closed");
        const { pitch } = await entry.load();
        if (!alive) return;
        document.title = `PullUp × ${pitch.client}`;
        setState({ status: "ok", pitch });
      })
      .catch(() => alive && setState({ status: "closed" }));
    return () => { alive = false; };
  }, [token]);

  if (state.status === "ok") return <PitchPlayer pitch={state.pitch} />;
  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, background: "#0b0b0b", color: "#f2f1ec", font: "16px -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif", padding: 24, textAlign: "center" }}>
      {state.status === "loading" ? (
        <p style={{ color: "#9a9a95" }}>Laddar…</p>
      ) : (
        <>
          <p style={{ fontSize: 22, fontWeight: 600 }}>Den här länken är inte öppen längre.</p>
          <p style={{ color: "#9a9a95" }}>Hör av dig till felix@pullup.se så skickar vi en ny.</p>
        </>
      )}
    </div>
  );
}
