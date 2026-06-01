import { useMemo, useState, useEffect } from "react";

// SceneFrame — renders an AI-authored generative hero (the "go nuts" zone).
//
// The model writes a self-contained animated scene (markup + <style> + <script>;
// canvas / WebGL / CSS motion). We render it in a locked-down iframe so it can
// look like ANYTHING but can never collect data or talk to the network:
//   • sandbox="allow-scripts" with NO allow-same-origin  → opaque origin, no
//     access to the parent page, cookies, or storage; no identity to auth with.
//   • CSP default-src 'none'                             → no fetch/XHR/socket,
//     no form submission, no external scripts. Images/fonts are display-only.
// So all real data collection stays in PullUp's native chrome (the Register
// button + RSVP form) that layers OVER this — the scene is pure background, so
// it's pointer-events:none.
//
// Same component in the editor preview and the live page (preview == real).

// The model returns a FRAGMENT (markup + <style>/<script>) — we own the
// document shell, the CSP, and the base styles, so the scene is always
// transparent + full-bleed and the security boundary is never up to the model.
function composeDoc(html) {
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src https: data: blob:; media-src https: data: blob:; font-src data:;">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}
  canvas,svg,video{display:block}
  *{box-sizing:border-box}
</style>
</head><body>${html || ""}</body></html>`;
}

// A still fallback for reduced-motion, the OG/share crawler, and any browser
// where the sandbox can't run — so the hero never renders blank.
function PosterFallback({ poster, palette }) {
  if (poster) {
    return (
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <img
          src={poster}
          alt=""
          draggable={false}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
        />
      </div>
    );
  }
  const c = Array.isArray(palette) && palette.length ? palette : ["#0a0617", "#1a1230"];
  const a = c[0] || "#0a0617";
  const b = c[1] || c[0] || "#1a1230";
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 0,
        background: `radial-gradient(circle at 25% 30%, ${b}, transparent 60%), linear-gradient(135deg, ${a}, ${b})`,
      }}
    />
  );
}

export function SceneFrame({ html, poster = null, palette = null }) {
  const doc = useMemo(() => composeDoc(html), [html]);

  // Honor the OS reduced-motion setting → show the still poster instead.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  if (!html || reduceMotion) {
    return <PosterFallback poster={poster} palette={palette} />;
  }

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      {/* Poster sits underneath as an instant paint while the scene boots. */}
      <PosterFallback poster={poster} palette={palette} />
      <iframe
        title="hero scene"
        srcDoc={doc}
        sandbox="allow-scripts"
        scrolling="no"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          border: 0,
          display: "block",
          pointerEvents: "none", // decorative background; CTA layers over it
        }}
      />
    </div>
  );
}

export default SceneFrame;
