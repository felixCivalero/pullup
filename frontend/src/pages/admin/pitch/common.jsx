/* eslint-disable react-refresh/only-export-components -- shared pitch pieces, not a page */
import { useEffect, useState } from "react";
import { A } from "./PitchKit.jsx";

/* What every pitch shares: PullUp's colours and type, the photo credit line
   (Wikimedia Commons photos must name the photographer and licence on the
   slide), a full-screen place chapter and a ticking clock. */

export const INK = "#151515";
export const PAPER = "#fbfbf9";
export const PINK = "#ec178f";
export const MUTED = "#5f5f5f";

export const kicker = { font: "600 24px/1 ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: 4, textTransform: "uppercase", color: PINK };
export const h2 = { fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.04 };
export const body = { fontSize: 32, lineHeight: 1.45, color: MUTED };
export const pad = { position: "absolute", inset: 0, padding: 128 };

export function Credit({ children, dark }) {
  return <p style={{ position: "absolute", right: 40, bottom: 28, fontSize: 18, color: dark ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.7)" }}>Foto: {children} · Wikimedia Commons</p>;
}

// A photo that fills the slide and slowly pushes in.
export function Backdrop({ src, alt = "", dur = 16, dim = 0 }) {
  return (
    <>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <A as="img" kind="zoom" dur={dur} src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: 1 - dim }} />
      </div>
    </>
  );
}

// One place, full screen: the photo, the label, the name, why it matters.
export function makeChapter({ src, credit, label, name, line, tag }) {
  function Chapter() {
    return (
      <div style={{ position: "absolute", inset: 0, background: INK, color: PAPER, overflow: "hidden" }}>
        <Backdrop src={src} alt={name} />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.75) 100%)" }} />
        <div style={{ position: "absolute", left: 128, right: 128, bottom: 120, display: "flex", flexDirection: "column", gap: 20 }}>
          <A as="p" kind="fade" d={0.4} style={{ ...kicker, color: "#fff" }}>{label}</A>
          <A as="h2" d={0.6} dur={1.2} style={{ fontSize: 168, fontWeight: 700, letterSpacing: -7, lineHeight: 0.95 }}>{name}</A>
          <A as="p" d={1.1} style={{ fontSize: 38, lineHeight: 1.35, color: "rgba(255,255,255,.9)", width: 1240 }}>{line}</A>
          {tag && (
            <A as="p" kind="scale" d={1.7} style={{ alignSelf: "flex-start", marginTop: 8, font: "600 22px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: 2, textTransform: "uppercase", background: PINK, color: "#fff", padding: "10px 16px", borderRadius: 8 }}>{tag}</A>
          )}
        </div>
        {credit && <Credit>{credit}</Credit>}
      </div>
    );
  }
  return Chapter;
}

// The time now, ticking every second.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
