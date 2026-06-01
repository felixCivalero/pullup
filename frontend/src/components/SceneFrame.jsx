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
  // Watchdog (runs FIRST, before the scene): a broken scene shouldn't blank the
  // hero or spam the console. We report failure to the parent so it can swap to
  // the poster (and unmount this iframe, which kills any error spam). We catch:
  //   • thrown errors / unhandled rejections, and
  //   • broken WebGL — wrap drawArrays/drawElements for the first frames and
  //     flag if gl.getError() is non-zero (the "no valid shader program" case).
  // If nothing fails shortly after boot we report "ok" and keep the scene.
  const watchdog = `<script>(function(){
  var done=false;
  function fail(){if(done)return;done=true;try{parent.postMessage({__pullupScene:"error"},"*")}catch(e){}}
  function ok(){try{parent.postMessage({__pullupScene:"ok"},"*")}catch(e){}}
  addEventListener("error",fail,true);
  addEventListener("unhandledrejection",fail);
  try{
    var ps=[];
    if(window.WebGLRenderingContext)ps.push(WebGLRenderingContext.prototype);
    if(window.WebGL2RenderingContext)ps.push(WebGL2RenderingContext.prototype);
    var n=0;
    ps.forEach(function(p){["drawArrays","drawElements"].forEach(function(fn){
      var o=p[fn];if(!o)return;
      p[fn]=function(){var r=o.apply(this,arguments);
        if(n<40){n++;try{if(this.getError&&this.getError()!==0)fail()}catch(e){}}
        return r;};
    })});
  }catch(e){}
  setTimeout(function(){if(!done)ok()},1800);
})();</scr`+`ipt>`;
  return `<!doctype html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src https: data: blob:; media-src https: data: blob:; font-src data:;">
<style>
  html,body{margin:0;padding:0;width:100%;height:100%;background:transparent;overflow:hidden}
  canvas,svg,video{display:block}
  *{box-sizing:border-box}
</style>
${watchdog}
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

  // Watchdog: if the scene throws or its WebGL program is broken, the iframe
  // posts {__pullupScene:"error"}. We drop to the poster AND unmount the iframe
  // — which kills the broken context (and its console-error spam). Re-arm when
  // the scene code changes (a new build gets a fresh chance).
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [doc]);
  useEffect(() => {
    function onMsg(e) {
      if (e?.data && e.data.__pullupScene === "error") setFailed(true);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  if (!html || reduceMotion || failed) {
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
