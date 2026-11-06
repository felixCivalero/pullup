/* eslint-disable react-refresh/only-export-components -- a pitch data module, not a component */
import { useMemo } from "react";
import { A } from "./PitchKit.jsx";
import { Backdrop, Credit, INK, MUTED, PAPER, PINK, body, h2, kicker, makeChapter, pad, useNow } from "./common.jsx";

/* Rami Huxley × PullUp — the Habibi punk project, the journey we're on
   together (P-666 in the sheet, still under Adam Dawood there; client since
   Oct 2026, weekly "Dawoodski to da moon"; renamed by Felix 2026-11-06). From the meetings doc: the content
   machinery is the baseline (30-min sprint every week, production, posting,
   analyse and tweak), the release of "Breakfast with Girls" (song + video) on
   22 Jan 2027 with deadlines 12 Dec (feature) and 18 Dec (song), the release
   package by kind, NYC shoots (rooftop, bike, streets, studio), filming twice
   a week, next songs overlapping, everything leading to habibipunk.com.
   Deliberately left out (this file is public once built): the label deal and
   the names on the feature list. Place photos: Wikimedia Commons, credited. */

const IMG = (f) => `/pitch/rami-huxley/${f}`;
const PHOTO = {
  skyline: { file: "skyline.jpg", credit: "Diliff, CC BY-SA 3.0" },
  rooftop: { file: "rooftop.jpg", credit: "Paulo Barcellos Jr., CC BY-SA 2.0" },
  street: { file: "street.jpg", credit: "Frank Schulenburg, CC BY-SA 4.0" },
  bridge: { file: "bridge.jpg", credit: "Nicolas Vollmer, CC BY 2.0" },
  studio: { file: "studio.jpg", credit: "Xalo Mustafa, CC BY-SA 4.0" },
};
const RELEASE = new Date("2027-01-22T00:00:00+01:00");

function Cover() {
  return (
    <div style={{ position: "absolute", inset: 0, background: INK, color: PAPER, overflow: "hidden" }}>
      <Backdrop src={IMG(PHOTO.skyline.file)} dur={20} dim={0.45} />
      <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 40 }}>
        <h1 style={{ fontSize: 150, fontWeight: 700, letterSpacing: -6, lineHeight: 1, display: "flex", gap: 40, alignItems: "baseline" }}>
          <A as="span" kind="left" d={0.3}>PullUp</A>
          <A as="span" kind="scale" d={0.8} style={{ color: PINK }}>×</A>
          <A as="span" kind="rise" d={1.1}>Rami Huxley</A>
        </h1>
        <A as="p" kind="fade" d={1.9} style={{ fontSize: 40, color: "#d8d8d4" }}>Habibi punk. To da moon.</A>
      </div>
      <Credit>{PHOTO.skyline.credit}</Credit>
    </div>
  );
}

// A live countdown to the release.
function Countdown() {
  const now = useNow();
  const left = Math.max(0, RELEASE - now);
  const parts = [
    [Math.floor(left / 864e5), "dagar"],
    [Math.floor(left / 36e5) % 24, "timmar"],
    [Math.floor(left / 6e4) % 60, "minuter"],
    [Math.floor(left / 1e3) % 60, "sekunder"],
  ];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 64, background: INK, color: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Release · 22 januari 2027</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 120, letterSpacing: -5 }}>Breakfast with Girls.</A>
        <A as="p" d={0.4} style={{ ...body, color: "#b5b5b0" }}>Låten och videon, samma dag.</A>
      </div>
      <A d={0.7} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }}>
        {parts.map(([n, label], i) => (
          <div key={label} style={{ borderTop: `3px solid ${i === 0 ? PINK : PAPER}`, paddingTop: 24 }}>
            <p style={{ fontSize: 180, fontWeight: 700, letterSpacing: -8, lineHeight: 1, fontVariantNumeric: "tabular-nums", color: i === 0 ? PINK : PAPER }}>{String(n).padStart(2, "0")}</p>
            <p style={{ ...body, color: "#b5b5b0" }}>{label}</p>
          </div>
        ))}
      </A>
    </div>
  );
}

function Road() {
  const steps = [
    ["Nu", "Maskinen går", "Sprint varje vecka, inspelning två gånger i veckan."],
    ["12 dec", "Featuren klar", "Rösten utifrån som lyfter låten."],
    ["18 dec", "Låten klar", "Master levererad, allt räknas bakåt härifrån."],
    ["22 jan", "Release", "Låt, video och hela paketet ute samma dag."],
  ];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 72, background: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Vägen dit</A>
        <A as="h2" d={0.15} style={h2}>Fyra datum. Allt räknas bakåt från det sista.</A>
      </div>
      <div style={{ position: "relative" }}>
        <A kind="wipe" d={0.5} dur={2} style={{ position: "absolute", left: 0, right: 0, top: 13, height: 4, background: INK }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40, position: "relative" }}>
          {steps.map(([date, title, p], n) => (
            <A key={date} d={0.7 + n * 0.45} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: n === 3 ? PINK : PAPER, border: `4px solid ${n === 3 ? PINK : INK}` }} />
              <p style={{ font: "600 26px ui-monospace, 'SF Mono', Menlo, monospace", color: n === 3 ? PINK : INK, marginTop: 12 }}>{date}</p>
              <h3 style={{ fontSize: 40, fontWeight: 700 }}>{title}</h3>
              <p style={{ ...body, fontSize: 27 }}>{p}</p>
            </A>
          ))}
        </div>
      </div>
    </div>
  );
}

// The content machinery: four steps going round, one lit at a time.
function Machine() {
  const now = useNow(1400);
  const on = Math.floor(now.getTime() / 1400) % 4;
  const steps = [
    ["Sprint", "30 minuter varje vecka. Vad funkade, vad gör vi nu."],
    ["Produktion", "Inspelning, event, redigering, planering."],
    ["Publicering", "Ut i alla kanaler, i rätt format."],
    ["Analys", "Vi läser siffrorna, ändrar och kör igen."],
  ];
  const pos = [[0, 0], [1, 0], [1, 1], [0, 1]];
  return (
    <div style={{ ...pad, display: "flex", gap: 96, alignItems: "center", background: INK, color: PAPER }}>
      <div style={{ width: 640, display: "flex", flexDirection: "column", gap: 28 }}>
        <A as="p" kind="fade" style={kicker}>Grunden</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 88 }}>Innehålls­maskinen.</A>
        <A as="p" d={0.4} style={{ ...body, color: "#b5b5b0" }}>Den går hela tiden, bredvid Rami, medan han lever artistlivet och gör musiken. Varje release åker med på den.</A>
      </div>
      <A kind="scale" d={0.5} style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        {pos.map(([c, r]) => {
          const n = r === 0 ? c : 3 - c;
          const [t, p] = steps[n];
          const lit = n === on;
          return (
            <div key={t} style={{ gridColumn: c + 1, gridRow: r + 1, borderRadius: 24, padding: 40, minHeight: 300, display: "flex", flexDirection: "column", gap: 14, background: lit ? PINK : "#222220", transition: "background .5s ease, transform .5s ease", transform: lit ? "scale(1.03)" : "none" }}>
              <p style={{ font: "600 22px ui-monospace, 'SF Mono', Menlo, monospace", color: lit ? "#fff" : PINK }}>{String(n + 1).padStart(2, "0")}</p>
              <h3 style={{ fontSize: 44, fontWeight: 700 }}>{t}</h3>
              <p style={{ fontSize: 27, lineHeight: 1.4, color: lit ? "#fff" : "#b5b5b0" }}>{p}</p>
            </div>
          );
        })}
      </A>
    </div>
  );
}

// The release package: one tile per piece, filling up by kind.
function Package() {
  const kinds = [
    ["Performative, high quality", 10, PINK],
    ["Performative, goofy / meme", 5, "#f6a623"],
    ["Lyrics cinematics", 5, "#3b82f6"],
    ["TikTok-musikvideo", 5, INK],
  ];
  const tiles = useMemo(() => kinds.flatMap(([k, n, c]) => Array.from({ length: n }, () => [k, c])), []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ ...pad, display: "flex", gap: 96, alignItems: "center", background: PAPER }}>
      <div style={{ width: 680, display: "flex", flexDirection: "column", gap: 28 }}>
        <A as="p" kind="fade" style={kicker}>Releasepaketet</A>
        <A as="h2" d={0.15} style={h2}>En master. Och allt som bär ut den.</A>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
          {kinds.map(([k, n, c], i) => (
            <A key={k} kind="left" d={0.5 + i * 0.25} style={{ display: "flex", alignItems: "center", gap: 18, borderTop: "1px solid #e2e0da", paddingTop: 14 }}>
              <span style={{ width: 22, height: 22, borderRadius: 6, background: c }} />
              <p style={{ fontSize: 30, fontWeight: 600, flex: 1 }}>{k}</p>
              <p style={{ fontSize: 30, fontWeight: 700 }}>{n}</p>
            </A>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
        {tiles.map(([, c], i) => (
          <A key={i} kind="scale" d={0.6 + i * 0.09} style={{ height: 136, borderRadius: 12, background: c, opacity: 0.92 }} />
        ))}
      </div>
    </div>
  );
}

const Rooftop = makeChapter({ src: IMG(PHOTO.rooftop.file), credit: PHOTO.rooftop.credit, label: "Inspelning · NYC", name: "Rooftop", line: "Staden under fötterna, låten i öronen. Bilden som säger att det här är på riktigt.", tag: "Performative, high quality" });
const Streets = makeChapter({ src: IMG(PHOTO.street.file), credit: PHOTO.street.credit, label: "Inspelning · NYC", name: "Streets", line: "Neon, diners och trottoarer. Adam mitt i ett New York som rör sig.", tag: "Performative, high quality" });
const Bike = makeChapter({ src: IMG(PHOTO.bridge.file), credit: PHOTO.bridge.credit, label: "Inspelning · NYC", name: "Bike", line: "Över bron, i takt med låten. Rörelse som går att klippa på beatet.", tag: "Performative, high quality" });
const Studio = makeChapter({ src: IMG(PHOTO.studio.file), credit: PHOTO.studio.credit, label: "Inspelning · NYC", name: "Studio", line: "Där låten blir till. Bakom kulisserna som publiken aldrig annars ser.", tag: "Performative, high quality" });

// Filming twice a week from now to the release: the calendar fills up.
function Rhythm() {
  const days = useMemo(() => {
    const out = [];
    const d = new Date("2026-11-02T12:00:00");
    while (d < RELEASE) {
      const dow = d.getDay();
      out.push({ shoot: dow === 2 || dow === 5, date: new Date(d) });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, []);
  const shoots = days.filter((d) => d.shoot).length;
  return (
    <div style={{ ...pad, display: "flex", gap: 96, alignItems: "center", background: PAPER }}>
      <div style={{ width: 640, display: "flex", flexDirection: "column", gap: 28 }}>
        <A as="p" kind="fade" style={kicker}>Rytmen</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 88 }}>Två inspelningar i veckan.</A>
        <A as="p" d={0.4} style={body}>Från nu till releasen blir det {shoots} inspelningsdagar. Varje dag ger material till flera bitar i paketet.</A>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 12 }}>
        {["mån", "tis", "ons", "tor", "fre", "lör", "sön"].map((w) => (
          <p key={w} style={{ font: "600 20px ui-monospace, 'SF Mono', Menlo, monospace", color: MUTED, textAlign: "center" }}>{w}</p>
        ))}
        {days.map((d, i) => (
          <A key={i} kind={d.shoot ? "scale" : "fade"} d={0.4 + i * 0.03} style={{ height: 52, borderRadius: 10, background: d.shoot ? PINK : "#ecebe6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 600, color: d.shoot ? "#fff" : "#9a9a95" }}>
            {d.date.getDate()}
          </A>
        ))}
      </div>
    </div>
  );
}

function World() {
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 56, background: INK, color: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Världen</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 110, letterSpacing: -5 }}>Allt leder hem.</A>
      </div>
      <A kind="scale" d={0.5} dur={1.1} style={{ alignSelf: "flex-start", fontSize: 120, fontWeight: 700, letterSpacing: -4, color: PINK, borderBottom: `6px solid ${PINK}` }}>habibipunk.com</A>
      <A as="p" d={1} style={{ ...body, color: "#b5b5b0", width: 1300 }}>Varje release bygger på den förra. Medan Breakfast with Girls går ut spelar vi redan in till nästa: Ringtone song och Punkadelic, så att maskinen aldrig står still.</A>
    </div>
  );
}

function Moon() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#07080d", color: PAPER, overflow: "hidden" }}>
      <style>{`
        @keyframes dwRise { from { transform: translate(-50%, 520px) } to { transform: translate(-50%, 0) } }
        @keyframes dwTwinkle { 0%, 100% { opacity: .25 } 50% { opacity: 1 } }
      `}</style>
      {Array.from({ length: 90 }, (_, i) => (
        <span key={i} style={{ position: "absolute", left: (i * 211) % 1920, top: (i * 137) % 1080, width: i % 7 ? 3 : 5, height: i % 7 ? 3 : 5, borderRadius: "50%", background: "#fff", animation: `dwTwinkle ${2 + (i % 5)}s ease-in-out ${(i % 9) * 0.3}s infinite` }} />
      ))}
      <div style={{ position: "absolute", left: "50%", top: 150, width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #fffaf0 0%, #e9e2d0 45%, #b9b2a3 100%)", boxShadow: "0 0 120px 30px rgba(255,248,230,.25)", animation: "dwRise 3.2s cubic-bezier(.2,.8,.2,1) .3s both" }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 150, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <A as="h1" d={2.6} style={{ fontSize: 130, fontWeight: 700, letterSpacing: -6, lineHeight: 1 }}>To da moon.</A>
        <A as="p" kind="fade" d={3.3} style={{ fontSize: 30, color: "#a9adb8" }}>PullUp × Rami Huxley · Habibi punk · 22 januari 2027</A>
      </div>
    </div>
  );
}

export const pitch = {
  slug: "rami-huxley",
  client: "Rami Huxley",
  title: "Habibi punk",
  slides: [
    { id: "cover", title: "PullUp × Rami Huxley", Slide: Cover, bg: INK, notes: "Resan vi är på tillsammans. Det här är strategin vi förhåller oss till varje vecka." },
    { id: "nedrakning", title: "Release", Slide: Countdown, bg: INK, notes: "Nedräkningen går live till 22 januari." },
    { id: "vagen", title: "Vägen dit", Slide: Road, bg: PAPER, notes: "12 dec featuren, 18 dec låten, 22 jan release. Allt räknas bakåt från releasen." },
    { id: "maskinen", title: "Innehållsmaskinen", Slide: Machine, bg: INK, notes: "Grunden i projektet: sprint, produktion, publicering, analys, varje vecka." },
    { id: "paketet", title: "Releasepaketet", Slide: Package, bg: PAPER, notes: "Paketet enligt mötesanteckningarna: 10 high quality, 5 goofy, 5 lyrics cinematics, 5 TikTok-musikvideor." },
    { id: "rooftop", title: "Rooftop", Slide: Rooftop, bg: INK },
    { id: "streets", title: "Streets", Slide: Streets, bg: INK },
    { id: "bike", title: "Bike", Slide: Bike, bg: INK },
    { id: "studio", title: "Studio", Slide: Studio, bg: INK, notes: "Inspelningsplatserna för high quality-bitarna i NYC: tak, cykel, gator, studio." },
    { id: "rytmen", title: "Rytmen", Slide: Rhythm, bg: PAPER, notes: "Inspelning två gånger i veckan, här tisdag och fredag som exempel." },
    { id: "varlden", title: "Världen", Slide: World, bg: INK, notes: "Allt leder till habibipunk.com. Nästa låtar spelas in parallellt." },
    { id: "manen", title: "To da moon", Slide: Moon, bg: "#07080d" },
  ],
};
