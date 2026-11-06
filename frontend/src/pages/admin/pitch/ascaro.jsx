/* eslint-disable react-refresh/only-export-components -- a pitch data module, not a component */
import { A, CountUp } from "./PitchKit.jsx";
import { Backdrop, Credit, INK, MUTED, PAPER, PINK, body, h2, kicker, makeChapter, pad, useNow } from "./common.jsx";

/* ASCARO × PullUp — the proposal for Tue 10 Nov 2026, 10:00 (P-037, Oscar
   Arrsjö, founder & CEO). What we know: ASCARO = "padel on another level",
   rooftop courts on NK Parkaden in Stockholm plus Kuala Lumpur, Phnom Penh
   and Doha (ascaropadel.com), their own apparel line ("a good look on your
   victory walk home"), food, drinks, a running track and weights on the
   roof; STIGA their racket and ball partner since May 2025; Oscar founded MAN
   magazine and FRONTMEN before (sheet notes). The story is ours: lifestyle on the
   roof, everything they offer, from NK to the world's roofs, told as a
   magazine (title "Livsstil på taket", Felix 2026-11-06). Place photos:
   Wikimedia Commons, credited on the slide. Felix's STIGA numbers: his case
   on pullup.se. Adam Flambo's: his PullUp case (2026-10-15). */

const IMG = (f) => `/pitch/ascaro/${f}`;
const PHOTO = {
  stockholm: { file: "stockholm.jpg", credit: "Signe Krantz (WMSE), CC0" },
  kl: { file: "kl.jpg", credit: "Elizabeth Xiong, CC BY 4.0" },
  phnompenh: { file: "phnompenh.jpg", credit: "Mao Piseth, CC BY-SA 4.0" },
  doha: { file: "doha.jpg", credit: "Zairon, CC BY 4.0" },
  padel: { file: "padel.jpg", credit: "Samson Ssemakadde, CC0" },
  nk: { file: "nk.jpg", credit: "Jim.henderson, CC BY-SA 4.0" },
};
const CITIES = [
  { key: "stockholm", name: "Stockholm", tz: "Europe/Stockholm", lon: 18.07 },
  { key: "doha", name: "Doha", tz: "Asia/Qatar", lon: 51.53 },
  { key: "kl", name: "Kuala Lumpur", tz: "Asia/Kuala_Lumpur", lon: 101.69 },
  { key: "phnompenh", name: "Phnom Penh", tz: "Asia/Phnom_Penh", lon: 104.92 },
];
const clock = (d, tz) => d.toLocaleTimeString("sv-SE", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Cover() {
  return (
    <div style={{ position: "absolute", inset: 0, background: INK, color: PAPER, overflow: "hidden" }}>
      <Backdrop src={IMG(PHOTO.stockholm.file)} dur={20} dim={0.4} />
      <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 40 }}>
        <h1 style={{ fontSize: 150, fontWeight: 700, letterSpacing: -6, lineHeight: 1, display: "flex", gap: 40, alignItems: "baseline" }}>
          <A as="span" kind="left" d={0.3}>PullUp</A>
          <A as="span" kind="scale" d={0.8} style={{ color: PINK }}>×</A>
          <A as="span" kind="rise" d={1.1} style={{ letterSpacing: 4 }}>ASCARO</A>
        </h1>
        <A as="p" kind="fade" d={1.9} style={{ fontSize: 40, color: "#d8d8d4" }}>Livsstil på taket. Padel, mat, dryck, träning och kläder.</A>
      </div>
      <Credit>{PHOTO.stockholm.credit}</Credit>
    </div>
  );
}

function Roof() {
  const things = ["Padel mitt i stan", "Egen klädkollektion", "Mat och dryck", "Löparbana och vikter"];
  return (
    <div style={{ position: "absolute", inset: 0, background: PAPER, display: "flex" }}>
      <div style={{ width: 860, height: 1080, overflow: "hidden" }}>
        <A as="img" kind="zoom" dur={18} src={IMG(PHOTO.nk.file)} alt="NK i Stockholm" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <div style={{ flex: 1, padding: "128px 128px 128px 96px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32 }}>
        <A as="p" kind="fade" style={kicker}>Taket</A>
        <A as="p" d={0.2} style={{ fontSize: 54, fontWeight: 600, letterSpacing: -1.5, lineHeight: 1.15 }}>”Upon the roof of NK Parkaden in Stockholm, you will find padel, people, food, and drinks.”</A>
        <A as="p" kind="fade" d={0.6} style={{ ...body, fontSize: 24 }}>ascaropadel.com</A>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 8 }}>
          {things.map((t, n) => (
            <A key={t} d={0.9 + n * 0.15} style={{ borderTop: `2px solid ${INK}`, paddingTop: 14, fontSize: 30, fontWeight: 600 }}>{t}</A>
          ))}
        </div>
      </div>
      <Credit dark>{PHOTO.nk.credit}</Credit>
    </div>
  );
}

// Four cities along the globe, placed by longitude, with their local time
// ticking: when Stockholm goes to bed, Kuala Lumpur is on court.
function World() {
  const now = useNow();
  const x = (lon) => 200 + ((lon - 10) / 100) * 1400;
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 56, background: INK, color: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Fyra tak</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 92 }}>Någonstans spelas det alltid ASCARO.</A>
      </div>
      <div style={{ position: "relative", height: 520 }}>
        <svg viewBox="0 0 1664 520" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
          <style>{`
            .as-arc { fill: none; stroke: ${PINK}; stroke-width: 3; stroke-dasharray: 2400; stroke-dashoffset: 2400; animation: asDraw 3s cubic-bezier(.6,0,.3,1) .6s forwards; }
            .as-line { stroke: #3a3a37; stroke-width: 2; stroke-dasharray: 6 10; }
            @keyframes asDraw { to { stroke-dashoffset: 0 } }
          `}</style>
          <line x1="0" y1="300" x2="1664" y2="300" className="as-line" />
          <path className="as-arc" d={CITIES.slice(1).reduce((d, c, i) => {
            const a = x(CITIES[i].lon) - 128;
            const b = x(c.lon) - 128;
            return `${d} Q ${(a + b) / 2} ${300 - Math.min(220, (b - a) * 0.55)} ${b} 300`;
          }, `M ${x(CITIES[0].lon) - 128} 300`)} />
        </svg>
        {CITIES.map((c, n) => (
          <A key={c.key} kind="scale" d={0.6 + n * 0.7} style={{ position: "absolute", left: x(c.lon) - 128 - 14, top: 286, width: 28, height: 28, borderRadius: "50%", background: n === 0 ? PINK : PAPER, boxShadow: `0 0 0 8px ${n === 0 ? "rgba(236,23,143,.25)" : "rgba(255,255,255,.12)"}` }} />
        ))}
        {CITIES.map((c, n) => (
          // Kuala Lumpur and Phnom Penh sit close: KL's label goes left of its dot.
          <A key={`${c.key}-t`} d={0.8 + n * 0.7} style={{ position: "absolute", left: c.key === "kl" ? x(c.lon) - 128 - 300 + 10 : x(c.lon) - 128 - 10, top: 340, display: "flex", flexDirection: "column", gap: 6, width: 300, textAlign: c.key === "kl" ? "right" : "left" }}>
            <p style={{ fontSize: 34, fontWeight: 700 }}>{c.name}</p>
            <p style={{ font: "500 30px ui-monospace, 'SF Mono', Menlo, monospace", color: n === 0 ? PINK : "#c8c8c3" }}>{clock(now, c.tz)}</p>
          </A>
        ))}
      </div>
    </div>
  );
}

const Stockholm = makeChapter({ src: IMG(PHOTO.stockholm.file), credit: PHOTO.stockholm.credit, label: "Kapitel 01 · Sverige", name: "Stockholm", line: "Flaggskeppet på NK Parkadens tak. Padel, folk, mat och dryck mitt i stan, med Stockholm runt omkring.", tag: "Shoot: kvällsmatch över taken" });
const KualaLumpur = makeChapter({ src: IMG(PHOTO.kl.file), credit: PHOTO.kl.credit, label: "Kapitel 02 · Malaysia", name: "Kuala Lumpur", line: "En stad som lever på höjden. Tornen i bakgrunden, värmen i luften, spelet efter mörkrets inbrott.", tag: "Shoot: Petronas bakom nätet" });
const PhnomPenh = makeChapter({ src: IMG(PHOTO.phnompenh.file), credit: PHOTO.phnompenh.credit, label: "Kapitel 03 · Kambodja", name: "Phnom Penh", line: "Kungliga tak och en skyline som växer. Padel som ny kultur i en stad på väg uppåt.", tag: "Shoot: palatstaken i solnedgång" });
const Doha = makeChapter({ src: IMG(PHOTO.doha.file), credit: PHOTO.doha.credit, label: "Kapitel 04 · Qatar", name: "Doha", line: "Skylinen tänds när hettan släpper. Det är då spelet börjar.", tag: "Shoot: neon över Corniche" });

function Formats() {
  const formats = [
    ["Victory walk", "Er egen formulering: vägen hem efter matchen, i ASCARO. Samma format i varje stad."],
    ["Rooftop sessions", "Matcher ovanför staden, filmade cinematiskt. Ljudet av bollen, ljuset, publiken."],
    ["Drops", "Varje klädsläpp blir en kväll på taket. Plaggen visas där de hör hemma."],
    ["Locals", "En lokal spelare per stad som bär berättelsen mellan våra besök."],
  ];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 56, background: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Formaten</A>
        <A as="h2" d={0.15} style={{ ...h2, width: 1500 }}>Fyra format som funkar i varje stad.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 28 }}>
        {formats.map(([t, p], n) => (
          <A key={t} d={0.5 + n * 0.18} style={{ background: n === 0 ? INK : "#f1f0ec", color: n === 0 ? PAPER : INK, borderRadius: 20, padding: 40, display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ font: "600 22px ui-monospace, 'SF Mono', Menlo, monospace", color: PINK }}>{String(n + 1).padStart(2, "0")}</p>
            <h3 style={{ fontSize: 38, fontWeight: 700 }}>{t}</h3>
            <p style={{ ...body, fontSize: 27, color: n === 0 ? "#d8d8d4" : MUTED }}>{p}</p>
          </A>
        ))}
      </div>
    </div>
  );
}

function Stiga() {
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 64, background: INK, color: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>STIGA</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 96 }}>Ni spelar med STIGA. Vi har redan gjort det för STIGA.</A>
        <A as="p" d={0.4} style={{ ...body, color: "#b5b5b0", width: 1300 }}>STIGA är er racket- och bollpartner. För STIGA Table Tennis byggde vi personas och berättelser kring deras egna talanger, på fyra kanaler. Det här hände på sju månader.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 64 }}>
        <A d={0.7} style={{ borderTop: `3px solid ${PAPER}`, paddingTop: 28 }}>
          <p style={{ fontSize: 170, fontWeight: 700, letterSpacing: -7, lineHeight: 1, color: PINK }}><CountUp to={28} d={0.8} />,1 M</p>
          <p style={{ ...body, color: "#b5b5b0" }}>visningar</p>
        </A>
        <A d={0.9} style={{ borderTop: `3px solid ${PAPER}`, paddingTop: 28 }}>
          <p style={{ fontSize: 170, fontWeight: 700, letterSpacing: -7, lineHeight: 1 }}>+<CountUp to={32} d={1} /> 000</p>
          <p style={{ ...body, color: "#b5b5b0" }}>nya följare</p>
        </A>
      </div>
      <p style={{ position: "absolute", left: 128, bottom: 64, fontSize: 22, color: "#8a8a85" }}>STIGA Table Tennis, december 2024 till juni 2025. Hela caset på pullup.se.</p>
    </div>
  );
}

function Editor() {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAPER, display: "flex" }}>
      <div style={{ flex: 1, padding: "128px 96px 128px 128px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 32 }}>
        <A as="p" kind="fade" style={kicker}>Grundaren</A>
        <A as="h2" d={0.2} style={{ ...h2, fontSize: 84 }}>Berättat som ett magasin.</A>
        <A as="p" d={0.5} style={body}>Oscar har grundat MAN och FRONTMEN. ASCARO förtjänar samma redaktionella blick: varje stad ett nummer, varje drop ett uppslag, Oscar som redaktören som håller ihop det.</A>
        <A kind="left" d={1} style={{ display: "flex", gap: 20, marginTop: 8 }}>
          {["Nr 01 Stockholm", "Nr 02 Kuala Lumpur", "Nr 03 Phnom Penh", "Nr 04 Doha"].map((t) => (
            <p key={t} style={{ font: "600 20px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: 1, border: `1.5px solid ${INK}`, borderRadius: 8, padding: "10px 14px" }}>{t}</p>
          ))}
        </A>
      </div>
      <div style={{ width: 760, height: 1080, overflow: "hidden" }}>
        <A as="img" kind="zoom" dur={18} src={IMG(PHOTO.padel.file)} alt="En padelbana" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <Credit>{PHOTO.padel.credit}</Credit>
    </div>
  );
}

function Nights() {
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 64, background: PAPER }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Rooftop nights</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 92, width: 1500 }}>Varje drop och varje stad blir en kväll på taket.</A>
        <A as="p" d={0.4} style={{ ...body, width: 1400 }}>Padel, middag och musik. Adam Flambo leder en photowalk över staden innan, och hans community kommer med. Anmälan och gästlistan går genom PullUp, så att ni äger era gäster.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
        {[[10, "photowalks med Adam"], [180, "unika som dykt upp"], [364, "i hans community"]].map(([n, label], i) => (
          <A key={label} d={0.7 + i * 0.2} style={{ borderTop: `3px solid ${INK}`, paddingTop: 28 }}>
            <p style={{ fontSize: 140, fontWeight: 700, letterSpacing: -6, lineHeight: 1, color: i === 1 ? PINK : INK }}><CountUp to={n} d={0.8 + i * 0.2} /></p>
            <p style={{ ...body, fontSize: 30 }}>{label}</p>
          </A>
        ))}
      </div>
      <p style={{ position: "absolute", left: 128, bottom: 64, fontSize: 22, color: MUTED }}>Adam Flambos events på PullUp, per 15 oktober 2026.</p>
    </div>
  );
}

function Kickoff() {
  return (
    <div style={{ position: "absolute", inset: 0, background: INK, color: PAPER, overflow: "hidden" }}>
      <Backdrop src={IMG(PHOTO.stockholm.file)} dur={18} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(8,10,20,.85) 0%, rgba(8,10,20,.35) 60%, rgba(8,10,20,.1) 100%)" }} />
      <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <A as="p" kind="fade" style={kicker}>Förslag · Nummer 01</A>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <A as="h1" kind="scale" d={0.3} dur={1.1} style={{ fontSize: 220, fontWeight: 700, letterSpacing: -10, lineHeight: 0.95, color: PINK }}>Taket på NK.</A>
          <A as="h2" d={0.9} style={{ ...h2, fontSize: 80 }}>Första kvällen, första filmen.</A>
        </div>
        <A as="p" d={1.4} style={{ fontSize: 34, lineHeight: 1.45, width: 1250, color: "rgba(255,255,255,.9)" }}>Vi börjar hemma: en rooftop night på NK som blir nummer ett i berättelsen, innan resan går vidare till Doha, Kuala Lumpur och Phnom Penh.</A>
      </div>
      <Credit>{PHOTO.stockholm.credit}</Credit>
    </div>
  );
}

function End() {
  const now = useNow();
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0d0f16", color: PAPER }}>
      <A as="p" kind="fade" style={kicker}>PullUp × ASCARO</A>
      <A as="h1" d={0.2} style={{ fontSize: 120, fontWeight: 700, letterSpacing: -5, lineHeight: 1.02, width: 1600 }}>Padel on another level. Berättat på samma nivå.</A>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", gap: 56 }}>
          {CITIES.map((c, n) => (
            <A key={c.key} kind="fade" d={0.8 + n * 0.2}>
              <p style={{ fontSize: 24, color: "#a9adb8" }}>{c.name}</p>
              <p style={{ font: "500 30px ui-monospace, 'SF Mono', Menlo, monospace", color: n === 0 ? PINK : PAPER }}>{clock(now, c.tz)}</p>
            </A>
          ))}
        </div>
        <A as="p" kind="fade" d={1.6} style={{ fontSize: 26, color: "#a9adb8", textAlign: "right" }}>Felix Civalero Stolpe · 070-961 15 60<br />felix@pullup.se · pullup.se</A>
      </div>
    </div>
  );
}

export const pitch = {
  slug: "ascaro",
  client: "ASCARO",
  title: "Livsstil på taket",
  slides: [
    { id: "cover", title: "PullUp × ASCARO", Slide: Cover, bg: INK, notes: "Tack för behovsanalysen. Det här är vårt förslag, som en resa." },
    { id: "taket", title: "Taket", Slide: Roof, bg: PAPER, notes: "Deras egna ord från sajten. Visa att vi förstått vad ASCARO är: inte bara banor, en plats." },
    { id: "varlden", title: "Fyra tak", Slide: World, bg: INK, notes: "Klockorna går live. Någonstans spelas det alltid ASCARO: när Stockholm sover är Kuala Lumpur på banan." },
    { id: "stockholm", title: "Stockholm", Slide: Stockholm, bg: INK },
    { id: "kl", title: "Kuala Lumpur", Slide: KualaLumpur, bg: INK },
    { id: "phnompenh", title: "Phnom Penh", Slide: PhnomPenh, bg: INK },
    { id: "doha", title: "Doha", Slide: Doha, bg: INK, notes: "Bilderna är på städerna, inte deras anläggningar. Fråga hur banorna ser ut på plats." },
    { id: "format", title: "Formaten", Slide: Formats, bg: PAPER, notes: "Victory walk är deras egen formulering från sajten. Formaten gör att varje stad känns som ASCARO." },
    { id: "stiga", title: "STIGA", Slide: Stiga, bg: INK, notes: "STIGA är deras partner sedan maj 2025. Starkaste kortet: vi har redan byggt den publiken." },
    { id: "redaktor", title: "Grundaren", Slide: Editor, bg: PAPER, notes: "Oscar grundade MAN och FRONTMEN. Spela på det: ASCARO som magasin, Oscar som redaktör." },
    { id: "nights", title: "Rooftop nights", Slide: Nights, bg: PAPER, notes: "Event på taket, Adams photowalks drar folk, PullUp sköter anmälan och gästlistan." },
    { id: "kickoff", title: "Nummer 01", Slide: Kickoff, bg: INK, notes: "Förslaget: börja med en kväll på NK-taket. Fråga om datum." },
    { id: "slut", title: "Slut", Slide: End, bg: "#0d0f16", notes: "Fråga vad de tänker, och vad nästa steg är för dem." },
  ],
};
