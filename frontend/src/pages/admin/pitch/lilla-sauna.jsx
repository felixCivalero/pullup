/* eslint-disable react-refresh/only-export-components -- a pitch data module, not a component */
import { useEffect, useState } from "react";
import { A, CountUp } from "./PitchKit.jsx";

/* Lilla Sauna × PullUp (Felix, 2026-11-06). First meeting (6 Nov, 09:00)
   was the brand point: the sauna itself is already right, its surroundings
   set the association. This pitch is the whole plan, told as a journey:
   Lilla Sauna across Sweden, every new place a cinematic chapter that sells
   its town, village or view; the founder at the centre of the story, Adam
   Flambo filming the feeling of a sauna; every new place an event, with
   Adam's photowalks pulling people in; Eldboken along for the ride; kick-off
   at the Kungsholmen opening on 1 December. The sketches are Gemini edits of
   their own sauna; place photos are from Wikimedia Commons, credited on the
   slide (CC BY-SA). Adam's numbers: his PullUp case (CASE_TODAY, 2026-10-15). */

const IMG = (f) => `/pitch/lilla-sauna/${f}`;
const INK = "#151515";
const PAPER = "#fbfbf9";
const PINK = "#ec178f";
const MUTED = "#5f5f5f";

const kicker = { font: "600 24px/1 ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: 4, textTransform: "uppercase", color: PINK };
const h2 = { fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.04 };
const body = { fontSize: 32, lineHeight: 1.45, color: MUTED };
const pad = { position: "absolute", inset: 0, padding: 128 };

// Wikimedia Commons, CC BY-SA: the photographer and licence go on the slide.
const PLACES = {
  abisko: { file: "place-abisko.jpg", credit: "Pavel.shyshkouski, CC BY-SA 4.0" },
  hogakusten: { file: "place-hoga-kusten.jpg", credit: "Pudelek, CC BY-SA 4.0" },
  faro: { file: "place-faro.jpg", credit: "Janna-Marie Lindblom, CC BY-SA 4.0" },
  osterlen: { file: "place-osterlen.jpg", credit: "Icy2008, CC BY-SA 4.0" },
  fjallen: { file: "place-fjallen.jpg", credit: "Arild Vågen, CC BY-SA 3.0" },
  skargarden: { file: "place-skargarden.jpg", credit: "Christof46, CC BY-SA 4.0" },
  siljan: { file: "place-siljan.jpg", credit: "Arild Vågen, CC BY-SA 4.0" },
  bohuslan: { file: "place-bohuslan.jpg", credit: "Marcusroos, CC BY-SA 3.0" },
  kungsholmen: { file: "place-kungsholmen.jpg", credit: "Julian Herzog, CC BY 4.0" },
};
const Credit = ({ children, dark }) => (
  <p style={{ position: "absolute", right: 40, bottom: 28, fontSize: 18, color: dark ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.7)" }}>Foto: {children} · Wikimedia Commons</p>
);

/* ─── 1. Where Lilla Sauna stands ─── */

function Cover() {
  return (
    <div style={{ position: "absolute", inset: 0, background: INK, color: PAPER, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <A as="img" kind="zoom" dur={20} src={IMG(PLACES.abisko.file)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.55, display: "block" }} />
      </div>
      <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 40 }}>
        <h1 style={{ fontSize: 150, fontWeight: 700, letterSpacing: -6, lineHeight: 1, display: "flex", gap: 40, alignItems: "baseline" }}>
          <A as="span" kind="left" d={0.3}>PullUp</A>
          <A as="span" kind="scale" d={0.8} style={{ color: PINK }}>×</A>
          <A as="span" kind="rise" d={1.1}>Lilla Sauna</A>
        </h1>
        <A as="p" kind="fade" d={1.9} style={{ fontSize: 40, color: "#d8d8d4" }}>En resa genom Sverige, en bastu i taget.</A>
      </div>
      <Credit>{PLACES.abisko.credit}</Credit>
    </div>
  );
}

function SiteTest() {
  return (
    <div style={{ ...pad, display: "flex", gap: 80, alignItems: "center", background: PAPER }}>
      <div style={{ width: 560, display: "flex", flexDirection: "column", gap: 28 }}>
        <A as="p" kind="fade" style={kicker}>Sajttestet</A>
        <h2 style={{ fontSize: 200, fontWeight: 700, letterSpacing: -8, lineHeight: 1, color: PINK }}>
          <CountUp to={68} d={0.3} />
          <span style={{ fontSize: 56, letterSpacing: -1, color: INK }}> /100</span>
        </h2>
        <A as="p" d={1.2} style={body}>Grunden sitter. Det som saknas är att se vad som säljer, och att fånga dem som inte bokar i dag.</A>
      </div>
      <A kind="wipe" d={0.6} style={{ flex: 1, height: 824, borderRadius: 20, overflow: "hidden", border: "1px solid #e4e4e0", background: "#fff" }}>
        <img src={IMG("test.jpg")} alt="Sajttestet för lillasauna.se" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </A>
    </div>
  );
}

function Today() {
  return (
    <div style={{ ...pad, display: "flex", gap: 80, alignItems: "center", background: PAPER }}>
      <div style={{ width: 720, display: "flex", flexDirection: "column", gap: 28 }}>
        <A as="p" kind="fade" style={kicker}>I dag</A>
        <A as="h2" d={0.2} style={h2}>Bastun är en av många saker i flödet.</A>
        <A as="p" d={0.6} style={body}>Event, jordgubbar, HYROX, en dusch vid ett höghus. Allt är äkta. Men bastun syns sällan, och när den syns är det omgivningen som tar plats.</A>
      </div>
      <A kind="scale" d={0.4} style={{ flex: 1, height: 824, borderRadius: 20, overflow: "hidden" }}>
        <img src={IMG("igrid.jpg")} alt="Lilla Saunas Instagram-flöde i dag" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </A>
    </div>
  );
}

function Sketch() {
  const pics = [
    ["ruin.jpg", "Bastun inbäddad i grönska i en gammal stenruin", 600],
    ["split-dyn-sjo.jpg", "Bastun på dynen vid havet och vid en dimmig sjö", 420],
    ["split-villa-dyn.jpg", "Bastun vid en modern villa och på dynen", 600],
  ];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 44, background: INK, color: PAPER }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <A as="p" kind="fade" style={kicker}>Skiss</A>
          <A as="h2" d={0.15} style={h2}>Samma bastu. En ny plats.</A>
        </div>
        <A as="p" kind="fade" d={1.6} style={{ ...body, color: "#a9a9a4", width: 560, textAlign: "right" }}>Byt miljö, och uttrycket blir modernt och skandinaviskt.</A>
      </div>
      <div style={{ display: "flex", gap: 24, justifyContent: "space-between" }}>
        {pics.map(([f, alt, w], n) => (
          <A key={f} d={0.4 + n * 0.25} style={{ width: w, height: 640, borderRadius: 20, overflow: "hidden" }}>
            <A as="img" kind="zoom" src={IMG(f)} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </A>
        ))}
      </div>
    </div>
  );
}

/* ─── 2. The journey ─── */

/* Sweden, roughly: coastline and borders as lon/lat, projected flat with the
   width squeezed by cos(62°) so it keeps its shape. Enough for a map that
   fills up with dots; not for navigation. */
const proj = ([lon, lat]) => [40 + (lon - 10.9) * 26.2, 20 + (69.1 - lat) * 55.7];
const OUTLINE = [[13.36,55.34],[13.8,55.43],[14.35,55.55],[14.3,55.93],[14.86,56.17],[15.59,56.16],[16.36,56.66],[16.45,57.2],[16.64,57.76],[16.75,58.2],[16.9,58.5],[17.6,58.75],[17.95,58.9],[18.5,59.1],[18.9,59.4],[18.7,59.76],[18.45,60.34],[17.6,60.6],[17.15,60.67],[17.3,61.2],[17.1,61.73],[17.3,62.39],[17.94,62.63],[18.72,63.29],[19.5,63.55],[20.26,63.83],[20.9,64.3],[21.0,64.75],[21.6,65.2],[22.15,65.58],[23.2,65.75],[24.13,65.83],[23.7,66.5],[23.37,67.2],[23.0,67.9],[22.48,68.44],[21.0,68.85],[20.55,69.06],[19.9,68.6],[18.1,68.45],[17.4,68.1],[16.5,67.6],[16.1,67.1],[15.0,66.15],[14.5,65.6],[14.0,65.1],[13.6,64.5],[12.9,64.1],[12.1,63.3],[12.3,62.6],[12.3,62.1],[12.8,61.5],[12.8,61.0],[12.5,60.4],[12.3,59.88],[11.8,59.3],[11.5,59.0],[11.17,58.93],[11.25,58.5],[11.43,58.27],[11.8,57.95],[11.9,57.7],[12.1,57.4],[12.25,57.1],[12.6,56.85],[12.85,56.67],[12.85,56.43],[12.45,56.3],[12.7,56.04],[12.98,55.6],[13.15,55.37]];
const GOTLAND = [[18.1,56.92],[18.35,57.05],[18.75,57.3],[18.9,57.5],[19.35,57.95],[19.1,58.0],[18.7,57.85],[18.4,57.6],[18.15,57.35]];
const OLAND = [[16.4,56.2],[16.55,56.35],[16.75,56.75],[17.05,57.35],[16.95,57.35],[16.6,56.8],[16.4,56.4]];
const pathOf = (pts) => `M${pts.map((p) => proj(p).map((v) => v.toFixed(1)).join(",")).join("L")}Z`;
// Today: Södermalm, Täby, Vaxholm, Åkersberga.
const NOW = [[18.07,59.31],[18.0,59.48],[18.36,59.40],[18.33,59.49]];
const KUNGS = proj([18.03, 59.335]);
// Where the journey could go: examples, not promises. Named ones get a label.
const NEXT = [
  ["Ales stenar", 14.05, 55.38, 1], ["Kivik", 14.23, 55.68], ["Torekov", 12.62, 56.42], ["Varberg", 12.25, 57.1],
  ["Smögen", 11.22, 58.35, 1], ["Koster", 11.0, 58.9], ["Marstrand", 11.58, 57.89], ["Kinnekulle", 13.4, 58.6],
  ["Vättern", 14.5, 58.0, 1], ["Kalmar", 16.36, 56.66], ["Öland", 16.6, 56.8], ["Västervik", 16.64, 57.76],
  ["Fårö", 19.1, 57.93, 1], ["Visby", 18.29, 57.64], ["Sandhamn", 18.92, 59.29], ["Grisslehamn", 18.82, 60.1],
  ["Siljan", 15.12, 60.89, 1], ["Sälen", 13.27, 61.16], ["Funäsdalen", 12.53, 62.54], ["Åre", 13.08, 63.4, 1],
  ["Storsjön", 14.6, 63.17], ["Höga kusten", 18.4, 62.95, 1], ["Umeå", 20.26, 63.83], ["Luleå skärgård", 22.4, 65.45],
  ["Jokkmokk", 19.83, 66.6], ["Ammarnäs", 16.2, 65.96], ["Kiruna", 20.23, 67.85], ["Abisko", 18.83, 68.35, 1],
];

function SwedenMap() {
  return (
    <svg viewBox="0 0 640 820" style={{ width: "100%", height: "100%", overflow: "visible" }}>
      {[OUTLINE, GOTLAND, OLAND].map((pts, n) => (
        <path key={n} d={pathOf(pts)} className="ls-land" />
      ))}
      {NOW.map((p, n) => {
        const [x, y] = proj(p);
        return <circle key={n} cx={x} cy={y} r={6} fill={INK} className="pk-a pk-scale" style={{ "--d": `${2.2 + n * 0.08}s`, transformBox: "fill-box", transformOrigin: "center" }} />;
      })}
      <circle cx={KUNGS[0]} cy={KUNGS[1]} r={10} className="ls-ring" />
      <circle cx={KUNGS[0]} cy={KUNGS[1]} r={10} fill={PINK} className="pk-a pk-scale" style={{ "--d": "2.8s", transformBox: "fill-box", transformOrigin: "center" }} />
      <text x={KUNGS[0] + 22} y={KUNGS[1] - 16} className="pk-a pk-fade" style={{ "--d": "3s", fill: PINK, fontSize: 26, fontWeight: 700 }}>Kungsholmen · 1 dec</text>
      {NEXT.map(([name, lon, lat, label], n) => {
        const [x, y] = proj([lon, lat]);
        return (
          <g key={name} className="pk-a pk-scale" style={{ "--d": `${3.6 + n * 0.16}s`, transformBox: "fill-box", transformOrigin: "center" }}>
            <circle cx={x} cy={y} r={7} fill={PAPER} stroke={INK} strokeWidth={3} />
            {label && <text x={x + 14} y={y + 8} style={{ fill: INK, fontSize: 23, fontWeight: 600 }}>{name}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Journey() {
  return (
    <div style={{ ...pad, display: "flex", alignItems: "center", gap: 64, background: PAPER }}>
      <style>{`
        .ls-land { fill: #f1f0ec; stroke: ${INK}; stroke-width: 2.4; stroke-linejoin: round; stroke-dasharray: 3200; stroke-dashoffset: 3200; animation: lsDraw 2.2s cubic-bezier(.6,0,.3,1) .2s forwards; }
        .ls-ring { fill: none; stroke: ${PINK}; stroke-width: 3; opacity: 0; transform-box: fill-box; transform-origin: center; animation: lsRing 1.8s ease-out 3.1s infinite; }
        @keyframes lsDraw { to { stroke-dashoffset: 0 } }
        @keyframes lsRing { 0% { opacity: .9; transform: scale(1) } 100% { opacity: 0; transform: scale(3.4) } }
      `}</style>
      <div style={{ width: 860, display: "flex", flexDirection: "column", gap: 28 }}>
        <A as="p" kind="fade" style={kicker}>Resan</A>
        <A as="h2" d={0.2} style={{ ...h2, fontSize: 92 }}>Lilla Sauna, över hela Sverige.</A>
        <A as="p" d={0.6} style={body}>En liten bastu på varje plats värd att åka till. Från Ales stenar till Abisko. Varje ny plats blir ett nytt kapitel, och kartan är berättelsen.</A>
        <A d={3.4} kind="fade" style={{ display: "flex", gap: 56, marginTop: 24 }}>
          <div><p style={{ fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>4</p><p style={{ ...body, fontSize: 26 }}>platser i dag</p></div>
          <div><p style={{ fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1, color: PINK }}>{NEXT.length}+</p><p style={{ ...body, fontSize: 26 }}>platser att åka till</p></div>
        </A>
      </div>
      <div style={{ flex: 1, height: 824 }}>
        <SwedenMap />
      </div>
    </div>
  );
}

// One place, full screen: the photo, the region, the name, why you'd go.
function chapter(key, n, region, name, line, shoot) {
  const place = PLACES[key];
  function Chapter() {
    return (
      <div style={{ position: "absolute", inset: 0, background: INK, color: PAPER, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
          <A as="img" kind="zoom" dur={16} src={IMG(place.file)} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,.72) 100%)" }} />
        <div style={{ position: "absolute", left: 128, right: 128, bottom: 120, display: "flex", flexDirection: "column", gap: 20 }}>
          <A as="p" kind="fade" d={0.4} style={{ ...kicker, color: "#fff" }}>Kapitel {String(n).padStart(2, "0")} · {region}</A>
          <A as="h2" d={0.6} dur={1.2} style={{ fontSize: 168, fontWeight: 700, letterSpacing: -7, lineHeight: 0.95 }}>{name}</A>
          <A as="p" d={1.1} style={{ fontSize: 38, lineHeight: 1.35, color: "rgba(255,255,255,.9)", width: 1240 }}>{line}</A>
          {shoot && (
            <A as="p" kind="scale" d={1.7} style={{ alignSelf: "flex-start", marginTop: 8, font: "600 22px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: 2, textTransform: "uppercase", background: PINK, color: "#fff", padding: "10px 16px", borderRadius: 8 }}>Shoot: {shoot}</A>
          )}
        </div>
        <Credit>{place.credit}</Credit>
      </div>
    );
  }
  return Chapter;
}
const Abisko = chapter("abisko", 1, "Lappland", "Abisko", "Polarnatt, norrsken och Torneträsk. Bastun lyser i mörkret, doppet sker under himlen.", "bastun under norrskenet");
const HogaKusten = chapter("hogakusten", 2, "Ångermanland", "Höga kusten", "Världsarvet där klipporna stupar ner i havet. Utsikten är halva upplevelsen.", "bastun på klippkanten");
const Faro = chapter("faro", 3, "Gotland", "Fårö", "Raukar, kalksten och ett ljus som inte finns någon annanstans. Bastu i solnedgången vid Langhammars.", "bastun bland raukarna");
const Osterlen = chapter("osterlen", 4, "Skåne", "Österlen", "Ales stenar på klinten och Östersjön nedanför. Äppelodlingar och långa sensommarkvällar.", "bastun vid Ales stenar");

/* The arrival: the empty iconic place first, then their own sauna (the
   cut-out PNG) lands in it, as the artistic shoot would place it. Cycles
   through three places. `x`/`bottom` = where it stands in that photo, `w` =
   its width, `night` dims it to the photo's light. */
const ARRIVALS = [
  { key: "faro", name: "Fårö", shoot: "Bland raukarna vid Langhammars", x: 1340, bottom: 170, w: 340 },
  { key: "abisko", name: "Abisko", shoot: "Under norrskenet vid Torneträsk", x: 1250, bottom: 110, w: 300, night: true },
  { key: "hogakusten", name: "Höga kusten", shoot: "På klippkanten över havet", x: 1560, bottom: 215, w: 130 },
];

function Arrival() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => (n + 1) % ARRIVALS.length), 6500);
    return () => clearInterval(t);
  }, []);
  const a = ARRIVALS[i];
  const place = PLACES[a.key];
  return (
    <div style={{ position: "absolute", inset: 0, background: INK, color: PAPER, overflow: "hidden" }}>
      <style>{`
        @keyframes lsLand { 0% { opacity: 0; transform: translate(-50%, -60px) scale(.92) } 60% { opacity: 1; transform: translate(-50%, 6px) scale(1) } 100% { opacity: 1; transform: translate(-50%, 0) scale(1) } }
        @keyframes lsShadow { 0% { opacity: 0; transform: translateX(-50%) scaleX(.4) } 100% { opacity: 1; transform: translateX(-50%) scaleX(1) } }
        @keyframes lsGlow { 0%, 100% { opacity: .55 } 50% { opacity: .85 } }
      `}</style>
      <div key={a.key} style={{ position: "absolute", inset: 0 }}>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", animation: "pkFade .9s ease both" }}>
          <A as="img" kind="zoom" dur={9} src={IMG(place.file)} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(0,0,0,.6) 0%, rgba(0,0,0,.15) 45%, rgba(0,0,0,0) 70%), linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,0) 35%)" }} />
        {/* the sauna lands: shadow on the ground, warm light, then the cabin */}
        <div style={{ position: "absolute", left: a.x, bottom: a.bottom - 14, width: a.w * 1.1, height: 40, borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(0,0,0,.6) 0%, rgba(0,0,0,0) 70%)", animation: "lsShadow .8s ease-out 1.6s both" }} />
        <div style={{ position: "absolute", left: a.x, bottom: a.bottom + a.w * 0.35, width: a.w * 1.6, height: a.w * 1.1, transform: "translateX(-50%)", borderRadius: "50%", background: "radial-gradient(ellipse at center, rgba(255,170,80,.45) 0%, rgba(255,170,80,0) 65%)", animation: "lsGlow 3s ease-in-out 2.4s infinite both" }} />
        <img src={IMG("sauna-icon-lg.png")} alt="Lilla Saunas bastu" style={{ position: "absolute", left: a.x, bottom: a.bottom, width: a.w, transform: "translateX(-50%)", filter: a.night ? "brightness(.7) saturate(.9) drop-shadow(0 10px 18px rgba(0,0,0,.6))" : "drop-shadow(0 12px 20px rgba(0,0,0,.45))", animation: "lsLand 1.3s cubic-bezier(.2,.8,.2,1) 1.4s both" }} />
        <div style={{ position: "absolute", left: 128, bottom: 128, width: 760, display: "flex", flexDirection: "column", gap: 18 }}>
          <A as="p" kind="fade" d={0.2} style={kicker}>Ankomsten · {a.name}</A>
          <A as="p" d={2.6} style={{ fontSize: 40, lineHeight: 1.3, fontWeight: 600 }}>{a.shoot}.</A>
        </div>
        <Credit>{place.credit}</Credit>
      </div>
      <div style={{ position: "absolute", left: 128, top: 128, width: 900, display: "flex", flexDirection: "column", gap: 20 }}>
        <h2 style={{ ...h2, fontSize: 88 }}>Så förklarar vi att vi är här.</h2>
        <p style={{ fontSize: 30, lineHeight: 1.45, color: "rgba(255,255,255,.88)" }}>Varje ny plats börjar med en bild: bastun i platsens mest ikoniska miljö. Lilla Sauna blir en del av hur platsen ser ut.</p>
      </div>
    </div>
  );
}

function Montage() {
  const more = [
    ["fjallen", "Jämtlandsfjällen", "Fjällbastu efter en dag på fjället."],
    ["skargarden", "Stockholms skärgård", "Röda bodar och kvällsdopp från klippan."],
    ["siljan", "Siljan", "Stilla vatten och midsommarljus i Dalarna."],
    ["bohuslan", "Bohuslän", "Granithällar och Västerhavet."],
  ];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 48, background: INK, color: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Och vidare</A>
        <A as="h2" d={0.15} style={h2}>Varje plats säljer in sin egen värld.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, flex: 1 }}>
        {more.map(([key, name, line], n) => (
          <A key={key} d={0.4 + n * 0.2} style={{ position: "relative", borderRadius: 20, overflow: "hidden" }}>
            <A as="img" kind="zoom" dur={18} src={IMG(PLACES[key].file)} alt={name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 45%, rgba(0,0,0,.75) 100%)" }} />
            <div style={{ position: "absolute", left: 28, right: 28, bottom: 28, display: "flex", flexDirection: "column", gap: 8 }}>
              <h3 style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1, lineHeight: 1.05 }}>{name}</h3>
              <p style={{ fontSize: 24, lineHeight: 1.35, color: "rgba(255,255,255,.85)" }}>{line}</p>
            </div>
          </A>
        ))}
      </div>
      <p style={{ position: "absolute", right: 40, bottom: 28, fontSize: 18, color: "rgba(255,255,255,.55)" }}>
        Foto: {more.map(([k]) => PLACES[k].credit).join(" · ")} · Wikimedia Commons
      </p>
    </div>
  );
}

/* ─── 3. The story and how it's told ─── */

function Icon() {
  const marks = [
    ["Formen", "Mjuka hörn och mörkt trä."],
    ["Fönstret", "Ramar in platsen, åt båda hållen."],
    ["Skorstenen", "Riktig vedeld, man ser det direkt."],
  ];
  return (
    <div style={{ position: "absolute", inset: 0, background: PAPER, display: "flex" }}>
      <div style={{ width: 1010, height: 1080, overflow: "hidden" }}>
        <A as="img" kind="zoom" dur={18} src={IMG("ruin.jpg")} alt="Skiss: bastun inbäddad i grönska i en gammal stenruin" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ flex: 1, padding: "128px 128px 128px 96px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32 }}>
        <A as="p" kind="fade" style={kicker}>Igenkänning</A>
        <A as="h2" d={0.2} style={{ ...h2, fontSize: 84 }}>Bastun är<br />en ikon i sig.</A>
        <A as="p" d={0.5} style={body}>Man känner igen den var den än står: i en ruin, på en dyn, under norrskenet. Den behöver ingen logga.</A>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          {marks.map(([t, p], n) => (
            <A key={t} kind="left" d={0.9 + n * 0.2} style={{ display: "flex", gap: 24, alignItems: "baseline", borderTop: "1px solid #e2e0da", paddingTop: 16 }}>
              <h3 style={{ fontSize: 32, fontWeight: 700, width: 210 }}>{t}</h3>
              <p style={{ ...body, fontSize: 28, flex: 1 }}>{p}</p>
            </A>
          ))}
        </div>
      </div>
      <A as="img" kind="scale" d={1.7} src={IMG("sauna-icon.png")} alt="" style={{ position: "absolute", right: 128, top: 110, width: 120 }} />
    </div>
  );
}

function Episode() {
  const frames = [
    ["place-fjallen.jpg", "Vägen dit", "Landskapet öppnar sig."],
    ["place-hoga-kusten.jpg", "Platsen", "Varför just här."],
    ["inside.jpg", "Värmen", "Elden, ångan, tystnaden."],
    ["isvak.jpg", "Doppet", "Kylan som väcker allt."],
    ["varmen.jpg", "Kvällen", "Ljuset i fönstret."],
  ];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 56, background: INK, color: PAPER }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <A as="p" kind="fade" style={kicker}>Ett avsnitt per plats</A>
          <A as="h2" d={0.15} style={{ ...h2, width: 1100 }}>Adam filmar känslan av att basta.</A>
        </div>
        <A as="p" kind="fade" d={0.6} style={{ ...body, color: "#a9a9a4", width: 520 }}>Cinematiskt, från vägen dit till ljuset i fönstret. Man ska känna värmen genom skärmen.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16 }}>
        {frames.map(([f, t, p], n) => (
          <A key={t} kind="left" d={0.7 + n * 0.22} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ height: 460, borderRadius: 16, overflow: "hidden" }}>
              <A as="img" kind="zoom" dur={14} src={IMG(f)} alt={t} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <p style={{ font: "600 22px ui-monospace, 'SF Mono', Menlo, monospace", color: PINK }}>{String(n + 1).padStart(2, "0")}</p>
            <h3 style={{ fontSize: 34, fontWeight: 700 }}>{t}</h3>
            <p style={{ fontSize: 24, color: "#a9a9a4" }}>{p}</p>
          </A>
        ))}
      </div>
    </div>
  );
}

function Photowalk() {
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 72, background: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Photowalks</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 92, width: 1500 }}>Adam tar med sig publiken.</A>
        <A as="p" d={0.4} style={{ ...body, width: 1300 }}>Vid vissa stopp leder Adam en photowalk. Hans community kommer dit, och då kommer folk till platsen, inte bara till flödet.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
        {[[10, "photowalks hittills"], [180, "unika som dykt upp"], [364, "i hans community"]].map(([n, label], i) => (
          <A key={label} d={0.7 + i * 0.2} style={{ borderTop: `3px solid ${INK}`, paddingTop: 28 }}>
            <p style={{ fontSize: 150, fontWeight: 700, letterSpacing: -6, lineHeight: 1, color: i === 1 ? PINK : INK }}><CountUp to={n} d={0.8 + i * 0.2} /></p>
            <p style={{ ...body, fontSize: 30 }}>{label}</p>
          </A>
        ))}
      </div>
      <p style={{ position: "absolute", left: 128, bottom: 64, fontSize: 22, color: MUTED }}>Adam Flambos events på PullUp, per 15 oktober 2026.</p>
    </div>
  );
}

function Hosts() {
  const hosts = [
    ["abisko", "Abisko"],
    ["faro", "Fårö"],
    ["hogakusten", "Höga kusten"],
  ];
  return (
    <div style={{ ...pad, display: "flex", gap: 72, alignItems: "center", background: INK, color: PAPER }}>
      <div style={{ width: 760, display: "flex", flexDirection: "column", gap: 28 }}>
        <A as="p" kind="fade" style={kicker}>Caretaking creator</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 84 }}>En ung värd på varje plats.</A>
        <A as="p" d={0.5} style={{ ...body, color: "#b5b5b0" }}>På varje ort hittar vi en lokal kreatör som tar hand om bastun och om innehållet. Platsens egen röst, varje vecka.</A>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 12 }}>
          {[["Service", "Ved, städ och gäster: bastun är alltid redo."], ["Community", "Stammisar, lokala kvällar, folk som kommer tillbaka."], ["Content", "Platsen inifrån, från någon som bor där."]].map(([t, p], n) => (
            <A key={t} kind="left" d={0.8 + n * 0.2} style={{ display: "flex", gap: 24, alignItems: "baseline", borderTop: "1px solid #3a3a37", paddingTop: 18 }}>
              <h3 style={{ fontSize: 32, fontWeight: 700, width: 220, color: PINK }}>{t}</h3>
              <p style={{ fontSize: 28, lineHeight: 1.4, color: "#d8d8d4", flex: 1 }}>{p}</p>
            </A>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
        {hosts.map(([key, name], n) => (
          <A key={key} d={0.6 + n * 0.25} style={{ position: "relative", height: 760, borderRadius: 20, overflow: "hidden" }}>
            <A as="img" kind="zoom" dur={16} src={IMG(PLACES[key].file)} alt={name} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,.8) 100%)" }} />
            <div style={{ position: "absolute", left: 24, right: 24, bottom: 28, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
              <p style={{ font: "600 20px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: 2, textTransform: "uppercase", background: PINK, color: "#fff", padding: "6px 10px", borderRadius: 6 }}>Värd sökes</p>
              <h3 style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{name}</h3>
            </div>
          </A>
        ))}
      </div>
    </div>
  );
}

function Events() {
  const cards = [
    ["Eventet", "Öppningen på plats, på bestämda tider."],
    ["Photowalken", "Adam och hans publik, på andra tider."],
    ["Platsen", "Resten av tiden upptäcker man en ort man annars aldrig åkt till."],
  ];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 64, background: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Varje ny plats</A>
        <A as="h2" d={0.15} style={{ ...h2, width: 1500 }}>Varje ny plats blir ett event, och en egen värld.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28 }}>
        {cards.map(([t, p], n) => (
          <A key={t} d={0.5 + n * 0.18} style={{ background: "#f1f0ec", borderRadius: 20, padding: 40, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ fontSize: 36, fontWeight: 700 }}>{t}</h3>
            <p style={{ ...body, fontSize: 28 }}>{p}</p>
          </A>
        ))}
        <A d={1.2} kind="scale" style={{ background: INK, color: PAPER, borderRadius: 20, padding: 40, display: "flex", flexDirection: "column", gap: 14 }}>
          <h3 style={{ fontSize: 36, fontWeight: 700, color: PINK }}>Eldboken</h3>
          <p style={{ ...body, fontSize: 28, color: "#d8d8d4" }}>Följer med på resan, ut till varje plats i Sverige.</p>
        </A>
      </div>
      <A as="p" kind="fade" d={1.7} style={body}>Varje plats får sitt eget kapitel i sociala medier: före, under och efter.</A>
    </div>
  );
}

function Kickoff() {
  return (
    <div style={{ position: "absolute", inset: 0, background: INK, color: PAPER, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <A as="img" kind="zoom" dur={18} src={IMG(PLACES.kungsholmen.file)} alt="Stadshuset på Kungsholmen en kväll, ljusen speglas i vattnet" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(8,10,20,.82) 0%, rgba(8,10,20,.35) 55%, rgba(8,10,20,.1) 100%)" }} />
      <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <A as="p" kind="fade" style={kicker}>Kick-off · Kapitel ett</A>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <A as="h1" kind="scale" d={0.3} dur={1.1} style={{ fontSize: 240, fontWeight: 700, letterSpacing: -11, lineHeight: 0.95, color: PINK }}>1 december.</A>
          <A as="h2" d={0.9} style={{ ...h2, fontSize: 88 }}>Kungsholmen, vid vattnet.</A>
        </div>
        <A as="p" d={1.4} style={{ fontSize: 34, lineHeight: 1.45, width: 1200, color: "rgba(255,255,255,.9)" }}>Adam och jag gör starten med er: öppningen blir första eventet, första filmen och första pricken på kartan.</A>
      </div>
      <Credit>{PLACES.kungsholmen.credit}</Credit>
    </div>
  );
}

/* Their sauna as an icon: lifted out of their own photo (macOS subject
   lift), a transparent PNG that pops up all over the map. */
const ICON = IMG("sauna-icon.png");
const ICON_RATIO = 258 / 240;

// Every place on the journey, then many more inside the country: a seeded
// scatter over Sweden's outline, so the map fills the same way every time.
function insideOutline(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const EVERYWHERE = (() => {
  const poly = OUTLINE.map(proj);
  const pts = [...NOW.map(proj), KUNGS, ...NEXT.map(([, lon, lat]) => proj([lon, lat]))];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let tries = 0;
  while (pts.length < 62 && tries < 5000) {
    tries += 1;
    const x = 60 + rnd() * 360;
    const y = 30 + rnd() * 770;
    if (!insideOutline(x, y, poly)) continue;
    if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < 40)) continue;
    pts.push([x, y]);
  }
  return pts;
})();

function End() {
  return (
    <div style={{ ...pad, display: "flex", alignItems: "center", gap: 48, background: "#0d0f16", color: PAPER }}>
      <style>{`
        .ls-dark { fill: #e9e6df; stroke: #e9e6df; stroke-width: 2; stroke-linejoin: round; stroke-dasharray: 3200; stroke-dashoffset: 3200; animation: lsDraw 1.8s cubic-bezier(.6,0,.3,1) .1s forwards; }
        .ls-pop { opacity: 0; transform-box: fill-box; transform-origin: 50% 100%; animation: lsPop .55s cubic-bezier(.3,1.7,.5,1) forwards; filter: drop-shadow(0 4px 6px rgba(0,0,0,.6)); }
        @keyframes lsDraw { to { stroke-dashoffset: 0 } }
        @keyframes lsPop { from { opacity: 0; transform: scale(0) translateY(10px) } to { opacity: 1; transform: none } }
      `}</style>
      <div style={{ width: 900, display: "flex", flexDirection: "column", gap: 40 }}>
        <A as="p" kind="fade" style={kicker}>PullUp × Lilla Sauna</A>
        <A as="h1" d={0.3} style={{ fontSize: 112, fontWeight: 700, letterSpacing: -5, lineHeight: 1.02 }}>Bastun är redan rätt. Nu ger vi den hela Sverige.</A>
        <A as="p" kind="fade" d={1.2} style={{ fontSize: 30, color: "#a9adb8" }}>Felix Civalero Stolpe · 070-961 15 60<br />felix@pullup.se · pullup.se</A>
      </div>
      <div style={{ flex: 1, height: 824 }}>
        <svg viewBox="0 0 640 820" style={{ width: "100%", height: "100%", overflow: "visible" }}>
          {[OUTLINE, GOTLAND, OLAND].map((pts, n) => <path key={n} d={pathOf(pts)} className="ls-dark" />)}
          {EVERYWHERE.map(([x, y], n) => {
            // Stockholm first, then faster and faster across the country.
            const delay = 1.4 + 5 * Math.pow(n / EVERYWHERE.length, 0.6);
            const big = n === NOW.length; // Kungsholmen
            const w = big ? 72 : 44;
            return <image key={n} href={ICON} x={x - w / 2} y={y - w * ICON_RATIO} width={w} height={w * ICON_RATIO} className="ls-pop" style={{ animationDelay: `${delay.toFixed(2)}s` }} />;
          })}
        </svg>
      </div>
    </div>
  );
}

export const pitch = {
  slug: "lilla-sauna",
  client: "Lilla Sauna",
  title: "Lilla Sauna över hela Sverige",
  date: "2026-11",
  slides: [
    { id: "cover", title: "PullUp × Lilla Sauna", Slide: Cover, bg: INK, notes: "Förra gången: bastun och associationen. I dag: hela resan." },
    { id: "test", title: "Sajttestet", Slide: SiteTest, bg: PAPER, notes: "Ingen mätning, ingen Meta- eller TikTok-pixel, inget mejlfält, ingen egen sammanfattning för AI. Allt går att fixa snabbt." },
    { id: "nu", title: "I dag", Slide: Today, bg: PAPER, notes: "Inget i flödet är fel, det är levande. Poängen är associationen: bastun, det snyggaste de har, syns sällan." },
    { id: "skiss", title: "Skiss", Slide: Sketch, bg: INK, notes: "Skisser med deras egen bastu. Samma form, samma fönster, bara ett annat sammanhang." },
    { id: "resan", title: "Resan", Slide: Journey, bg: PAPER, notes: "Kartan ritar Sverige, tänder de fyra platserna runt Stockholm, Kungsholmen i rosa, sedan alla platser resan kan gå till. Exempel, inte löften." },
    { id: "abisko", title: "Abisko", Slide: Abisko, bg: INK, notes: "Låt bilden stå. Säg platsen och känslan, inget mer." },
    { id: "hoga-kusten", title: "Höga kusten", Slide: HogaKusten, bg: INK },
    { id: "faro", title: "Fårö", Slide: Faro, bg: INK },
    { id: "osterlen", title: "Österlen", Slide: Osterlen, bg: INK },
    { id: "ankomsten", title: "Ankomsten", Slide: Arrival, bg: INK, notes: "Det här är artistic shooten: på varje ikonisk plats placerar vi bastun estetiskt i landskapet, så att ankomsten blir en bild. Lilla Sauna associeras med det vackraste på platsen. Bilden växlar själv mellan Fårö, Abisko och Höga kusten; vänta in en eller två." },
    { id: "vidare", title: "Och vidare", Slide: Montage, bg: INK, notes: "Fjäll, skärgård, sjö, västkust: varje landskap ger bastun en ny värld att säljas in i." },
    { id: "ikon", title: "Igenkänning", Slide: Icon, bg: PAPER, notes: "Bastun är redan en ikon: formen, fönstret, skorstenen. Därför funkar den i vilken miljö som helst och blir varumärket på varje bild." },
    { id: "avsnitt", title: "Ett avsnitt", Slide: Episode, bg: INK, notes: "Så ser ett avsnitt ut: vägen dit, platsen, värmen, doppet, kvällen. Adam filmar allt cinematiskt." },
    { id: "photowalk", title: "Photowalks", Slide: Photowalk, bg: PAPER, notes: "Adam drar folk. Hans photowalks på PullUp: 10 stycken, 180 unika som kommit, 364 i communityn (per 15 oktober)." },
    { id: "vard", title: "En värd på varje plats", Slide: Hosts, bg: INK, notes: "På varje plats en ung, content-tung lokal kreatör som sköter bastun: service, community och innehåll. Platsens egen röst, och den som håller igång den när vi inte är där." },
    { id: "event", title: "Varje ny plats", Slide: Events, bg: PAPER, notes: "Eventet och photowalken på olika tider. Berätta själv vad Eldboken är." },
    { id: "kickoff", title: "Kick-off", Slide: Kickoff, bg: INK, notes: "Själva pitchen: får vi göra starten med er den 1 december?" },
    { id: "slut", title: "Hela Sverige", Slide: End, bg: "#0d0f16", notes: "Låt kartan fyllas med bastur innan du säger något. Sedan: vad tänker ni? Föreslå nästa steg." },
  ],
};
