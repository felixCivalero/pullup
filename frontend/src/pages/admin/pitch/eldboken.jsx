/* eslint-disable react-refresh/only-export-components -- a pitch data module, not a component */
import { A, CountUp } from "./PitchKit.jsx";
import { pad } from "./common.jsx";
import { GOTLAND, OLAND, OUTLINE, insideOutline, pathOf, proj } from "./sweden.js";

/* Eldboken × PullUp (Felix's own brand, P-2943, 2026-11-06). Handmade books
   you burn, made in a garage on Aspö (Strängnäs): 20 dikter and Fria blad,
   350 kr each (eldboken.se, ~/Projects/eldboken). The journey: Eldboken in
   every Swedish household with a fireplace; the purpose: to spread love and
   bring people closer together (Felix). Words, numbers and dates are from the
   site and PRESSPLAN.md (about a hundred books in two days, 8 000+ followers
   on 6 Nov; 18 Nov årets julklapp; 4 Dec last order day). Photos and film are
   Felix's own, metadata stripped. */

const IMG = (f) => `/pitch/eldboken/${f}`;
const SOOT = "#17110d";
const BIRCH = "#f4ede3";
const EMBER = "#e8692a";
const GLOW = "#ffb15c";
const ASH = "#a89a8c";

const kicker = { font: "600 24px/1 ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: 4, textTransform: "uppercase", color: EMBER };
const h2 = { fontSize: 80, fontWeight: 700, letterSpacing: -3, lineHeight: 1.04 };
const body = { fontSize: 32, lineHeight: 1.5, color: ASH };
const serif = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";

function Cover() {
  return (
    <div style={{ position: "absolute", inset: 0, background: SOOT, color: BIRCH, overflow: "hidden" }}>
      <video src={IMG("eldstad.mp4")} poster={IMG("eldstad.jpg")} autoPlay muted loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.6 }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center, rgba(23,17,13,.15) 0%, rgba(23,17,13,.75) 75%)" }} />
      <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 36, textAlign: "center" }}>
        <A as="p" kind="fade" d={0.4} style={{ ...kicker, color: GLOW }}>PullUp × Eldboken</A>
        <A as="h1" d={0.8} dur={1.4} style={{ fontFamily: serif, fontSize: 200, fontWeight: 400, letterSpacing: 6, lineHeight: 1 }}>ELDBOKEN</A>
        <A as="p" kind="fade" d={1.8} style={{ fontFamily: serif, fontSize: 44, fontStyle: "italic", color: "#e9dccb" }}>En bok som tänder en brasa. Ett blad i taget.</A>
      </div>
    </div>
  );
}

function Why() {
  return (
    <div style={{ position: "absolute", inset: 0, background: SOOT, color: BIRCH, display: "flex" }}>
      <div style={{ flex: 1, padding: "128px 96px 128px 128px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 40 }}>
        <A as="p" kind="fade" style={kicker}>Varför</A>
        <A as="p" d={0.3} dur={1.2} style={{ fontFamily: serif, fontSize: 68, lineHeight: 1.2 }}>Att sprida kärlek och föra folk närmare varandra.</A>
        <A as="p" d={0.9} style={body}>Mörkret lägger sig tidigare för varje kväll och omvärlden skrämmer oss allt mer. Eldboken är en motvikt till den tid vi lever i: en kväll tillsammans framför elden i stället för en sak till i hyllan.</A>
      </div>
      <div style={{ width: 780, height: 1080, overflow: "hidden" }}>
        <A as="img" kind="zoom" dur={18} src={IMG("vid-brasan.jpg")} alt="Fötter i tofflor framför brasan" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    </div>
  );
}

function Books() {
  const books = [
    ["dikter-hand.jpg", "Eldboken · 20 dikter", "Läs högt vid brasan.", "Tjugo svenska dikter. Läs en högt för dem du sitter med, riv ut bladet och låt dikten tända kvällens brasa."],
    ["blanka-hand.jpg", "Eldboken · Fria blad", "Skriv det som ska tända elden i kväll.", "Tjugo blanka blad, pensel och färg. Något du vill säga, släppa, önska eller minnas. Själv eller tillsammans."],
  ];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 48, background: BIRCH, color: SOOT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <A as="p" kind="fade" style={kicker}>Två böcker</A>
          <A as="h2" d={0.15} style={{ ...h2, fontFamily: serif, fontWeight: 400, letterSpacing: -1 }}>Ett blad, en brasa.</A>
        </div>
        <A as="p" kind="fade" d={0.6} style={{ fontSize: 36, fontWeight: 700 }}>350 kr styck</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, flex: 1 }}>
        {books.map(([f, label, title, text], n) => (
          <A key={label} d={0.4 + n * 0.3} style={{ display: "flex", gap: 32, alignItems: "stretch" }}>
            <div style={{ width: 420, borderRadius: 18, overflow: "hidden", flexShrink: 0 }}>
              <A as="img" kind="zoom" dur={16} src={IMG(f)} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 14, paddingBottom: 8 }}>
              <p style={{ font: "600 20px ui-monospace, 'SF Mono', Menlo, monospace", letterSpacing: 2, textTransform: "uppercase", color: EMBER }}>{label}</p>
              <h3 style={{ fontFamily: serif, fontSize: 44, fontWeight: 400, lineHeight: 1.15 }}>{title}</h3>
              <p style={{ fontSize: 26, lineHeight: 1.5, color: "#5d5148" }}>{text}</p>
            </div>
          </A>
        ))}
      </div>
    </div>
  );
}

// The ritual, with a fire that grows as you read.
function Ritual() {
  const steps = [["Läs eller skriv", "En dikt högt, eller något eget: en tanke, en förhoppning, en riktning."], ["Riv ut bladet", "Lägg det under veden."], ["Låt elden ta det", "Brasan tänds med intention, och bladet förs tillbaka till alltet."]];
  return (
    <div style={{ ...pad, display: "flex", gap: 96, alignItems: "center", background: SOOT, color: BIRCH }}>
      <style>{`
        @keyframes ebFlick { 0%, 100% { transform: scaleY(1) scaleX(1); opacity: .9 } 30% { transform: scaleY(1.08) scaleX(.96); opacity: 1 } 60% { transform: scaleY(.95) scaleX(1.03); opacity: .85 } }
        @keyframes ebGrow { from { transform: scale(0); opacity: 0 } to { transform: scale(1); opacity: 1 } }
      `}</style>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 44 }}>
        <A as="p" kind="fade" style={kicker}>Ritualen</A>
        {steps.map(([t, p], n) => (
          <A key={t} kind="left" d={0.4 + n * 0.8} style={{ display: "flex", gap: 32, alignItems: "baseline" }}>
            <p style={{ fontFamily: serif, fontSize: 90, color: EMBER, lineHeight: 1, width: 80 }}>{n + 1}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <h3 style={{ fontFamily: serif, fontSize: 56, fontWeight: 400 }}>{t}</h3>
              <p style={{ ...body, fontSize: 28 }}>{p}</p>
            </div>
          </A>
        ))}
      </div>
      <div style={{ width: 520, height: 720, position: "relative" }}>
        {[[260, 520, 1, 0], [200, 400, 0.9, 0.4], [150, 300, 0.85, 0.8]].map(([w, h, o, delay], i) => (
          <div key={i} style={{ position: "absolute", left: "50%", bottom: 60, width: w, height: h, marginLeft: -w / 2, transformOrigin: "50% 100%", animation: `ebGrow 1.6s cubic-bezier(.2,.8,.2,1) ${2.6 + delay}s both` }}>
            <div style={{ width: "100%", height: "100%", borderRadius: "50% 50% 46% 46% / 62% 62% 38% 38%", background: i === 0 ? `radial-gradient(ellipse at 50% 85%, ${GLOW} 0%, ${EMBER} 45%, rgba(232,105,42,0) 72%)` : i === 1 ? `radial-gradient(ellipse at 50% 85%, #ffe0a8 0%, ${GLOW} 50%, rgba(255,177,92,0) 75%)` : "radial-gradient(ellipse at 50% 85%, #fff6e0 0%, #ffd89a 55%, rgba(255,216,154,0) 78%)", opacity: o, transformOrigin: "50% 100%", animation: `ebFlick ${1.4 + i * 0.3}s ease-in-out ${i * 0.2}s infinite` }} />
          </div>
        ))}
        <div style={{ position: "absolute", left: "50%", bottom: 40, width: 380, height: 40, marginLeft: -190, borderRadius: 20, background: "#3a2a20" }} />
      </div>
    </div>
  );
}

function Garage() {
  const steps = [["ramar.jpg", "Ramarna", "Trälist och nät ger varje blad dess ojämna kant."], ["massa.jpg", "Massan", "Kartong, pellets och vatten blir en grå gröt."], ["pressa.jpg", "Pressa och torka", "Varje blad pressas för hand genom en duk."], ["snida.jpg", "Stämplarna", "Bokstäverna, huset och elden, snidade i trä."], ["tryck.jpg", "Tryck och bind", "En färg i taget, bundet med trälist och rep."]];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 44, background: BIRCH, color: SOOT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <A as="p" kind="fade" style={kicker}>Från garaget på Aspö</A>
          <A as="h2" d={0.15} style={{ ...h2, fontFamily: serif, fontWeight: 400, letterSpacing: -1 }}>Ingen eldbok är den andra lik.</A>
        </div>
        <A as="p" kind="fade" d={0.6} style={{ fontSize: 26, color: "#5d5148", width: 520, textAlign: "right" }}>Handgjord av pellets, kartong och vax, mitt i Mälaren mellan Strängnäs och Enköping.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, flex: 1 }}>
        {steps.map(([f, t, p], n) => (
          <A key={t} kind="rise" d={0.5 + n * 0.22} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ flex: 1, borderRadius: 14, overflow: "hidden", minHeight: 0 }}>
              <A as="img" kind="zoom" dur={14} src={IMG(f)} alt={t} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </div>
            <p style={{ font: "600 20px ui-monospace, 'SF Mono', Menlo, monospace", color: EMBER }}>{String(n + 1).padStart(2, "0")}</p>
            <h3 style={{ fontSize: 30, fontWeight: 700 }}>{t}</h3>
            <p style={{ fontSize: 22, lineHeight: 1.4, color: "#5d5148" }}>{p}</p>
          </A>
        ))}
      </div>
    </div>
  );
}

function Momentum() {
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 72, background: SOOT, color: BIRCH }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <A as="p" kind="fade" style={kicker}>Två dagar</A>
        <A as="h2" d={0.15} style={{ ...h2, fontSize: 96 }}>Den sprids från hand till hand.</A>
        <A as="p" d={0.4} style={{ ...body, width: 1300 }}>Ingen annons. Folk har delat Eldboken vidare till varandra, för att de känner likadant.</A>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 72 }}>
        <A d={0.7} style={{ borderTop: `3px solid ${BIRCH}`, paddingTop: 28 }}>
          <p style={{ fontSize: 180, fontWeight: 700, letterSpacing: -8, lineHeight: 1, color: GLOW }}>~<CountUp to={100} d={0.8} /></p>
          <p style={body}>böcker beställda på två dagar</p>
        </A>
        <A d={0.9} style={{ borderTop: `3px solid ${BIRCH}`, paddingTop: 28 }}>
          <p style={{ fontSize: 180, fontWeight: 700, letterSpacing: -8, lineHeight: 1 }}><CountUp to={8} d={1} /> 000+</p>
          <p style={body}>följare på @eldboken</p>
        </A>
      </div>
      <p style={{ position: "absolute", left: 128, bottom: 64, fontSize: 22, color: "#7d7064" }}>Per 6 november 2026, två dagar efter lanseringen.</p>
    </div>
  );
}

function Voices() {
  const quotes = [["Att tända brasan med en dikt tillsammans med barn och familj är en ny underbar upplevelse.", "Louise, Djursholm", "20 dikter"], ["Jag köpte Fria blad och nu tänder jag och min tjej kaminen med intention. Väldigt gulligt.", "Jesper, Södermalm", "Fria blad"]];
  return (
    <div style={{ position: "absolute", inset: 0, background: BIRCH, color: SOOT, display: "flex" }}>
      <div style={{ flex: 1, padding: "128px 96px 128px 128px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 56 }}>
        <A as="p" kind="fade" style={kicker}>Vid andras brasor</A>
        {quotes.map(([q, who, book], n) => (
          <A key={who} d={0.3 + n * 0.6} style={{ display: "flex", flexDirection: "column", gap: 14, borderLeft: `4px solid ${EMBER}`, paddingLeft: 36 }}>
            <p style={{ color: EMBER, fontSize: 28, letterSpacing: 4 }}>★★★★★</p>
            <p style={{ fontFamily: serif, fontSize: 46, lineHeight: 1.3 }}>”{q}”</p>
            <p style={{ fontSize: 24, color: "#5d5148" }}>{who} · Eldboken {book}</p>
          </A>
        ))}
      </div>
      <div style={{ width: 640, height: 1080, overflow: "hidden" }}>
        <A as="img" kind="zoom" dur={18} src={IMG("jesper.jpg")} alt="Jespers Fria blad framför kaminen" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    </div>
  );
}

// Every household with a fireplace: the country goes dark and lights up,
// one fire at a time, starting on Aspö.
const ASPO = proj([17.06, 59.42]);
const FIRES = (() => {
  const poly = OUTLINE.map(proj);
  const pts = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let tries = 0;
  while (pts.length < 220 && tries < 20000) {
    tries += 1;
    // more homes in the south: bias the y towards the bottom
    const x = 60 + rnd() * 360;
    const y = 800 - Math.pow(rnd(), 1.6) * 770;
    if (!insideOutline(x, y, poly)) continue;
    if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < 11)) continue;
    pts.push([x, y]);
  }
  return pts.sort((a, b) => Math.hypot(a[0] - ASPO[0], a[1] - ASPO[1]) - Math.hypot(b[0] - ASPO[0], b[1] - ASPO[1]));
})();

function Hearths() {
  const fires = FIRES;
  return (
    <div style={{ ...pad, display: "flex", alignItems: "center", gap: 64, background: "#0c0907", color: BIRCH }}>
      <style>{`
        .eb-land { fill: #1d1712; stroke: #3d3128; stroke-width: 2; stroke-linejoin: round; stroke-dasharray: 3200; stroke-dashoffset: 3200; animation: ebDraw 1.8s cubic-bezier(.6,0,.3,1) .2s forwards; }
        .eb-fire { opacity: 0; transform-box: fill-box; transform-origin: center; animation: ebLight .7s ease-out forwards, ebEmber 2.4s ease-in-out infinite; }
        .eb-home { fill: ${EMBER}; opacity: 0; transform-box: fill-box; transform-origin: center; animation: ebLight .8s ease-out 2s forwards; }
        .eb-ring { fill: none; stroke: ${GLOW}; stroke-width: 3; opacity: 0; transform-box: fill-box; transform-origin: center; animation: ebRing 2s ease-out 2.4s infinite; }
        @keyframes ebDraw { to { stroke-dashoffset: 0 } }
        @keyframes ebLight { from { opacity: 0; transform: scale(0) } to { opacity: 1; transform: scale(1) } }
        @keyframes ebEmber { 0%, 100% { filter: brightness(1) } 50% { filter: brightness(1.35) } }
        @keyframes ebRing { 0% { opacity: .9; transform: scale(1) } 100% { opacity: 0; transform: scale(3.6) } }
      `}</style>
      <div style={{ width: 860, display: "flex", flexDirection: "column", gap: 30 }}>
        <A as="p" kind="fade" style={kicker}>Resan</A>
        <A as="h2" d={0.2} style={{ ...h2, fontFamily: serif, fontWeight: 400, fontSize: 96, letterSpacing: -2 }}>En Eldbok i varje hem med eldstad.</A>
        <A as="p" d={0.6} style={body}>Från ett garage på Aspö till alla Sveriges hushåll med en kamin, en braskamin eller en öppen spis. En kväll tillsammans i taget.</A>
      </div>
      <div style={{ flex: 1, height: 824 }}>
        <svg viewBox="0 0 640 820" style={{ width: "100%", height: "100%", overflow: "visible" }}>
          <defs>
            <radialGradient id="eb-glow">
              <stop offset="0" stopColor="#fff2d6" />
              <stop offset=".35" stopColor={GLOW} />
              <stop offset="1" stopColor={EMBER} stopOpacity="0" />
            </radialGradient>
          </defs>
          {[OUTLINE, GOTLAND, OLAND].map((pts, n) => <path key={n} d={pathOf(pts)} className="eb-land" />)}
          {fires.map(([x, y], n) => (
            <circle key={n} cx={x} cy={y} r={7} fill="url(#eb-glow)" className="eb-fire" style={{ animationDelay: `${(2.6 + 6 * Math.pow(n / fires.length, 0.7)).toFixed(2)}s, ${(n % 7) * 0.3}s` }} />
          ))}
          <circle cx={ASPO[0]} cy={ASPO[1]} r={9} className="eb-ring" />
          <circle cx={ASPO[0]} cy={ASPO[1]} r={9} className="eb-home" />
          <text x={ASPO[0] - 16} y={ASPO[1] - 18} textAnchor="end" className="pk-a pk-fade" style={{ "--d": "2.2s", fill: GLOW, fontSize: 26, fontWeight: 700 }}>Aspö</text>
        </svg>
      </div>
    </div>
  );
}

function Road() {
  const dates = [["5 nov", "Lanseringen", "Lokal press först. Ett hundratal böcker på två dagar."], ["18 nov", "Årets julklapp", "HUI presenterar årets julklapp. Nationella listor och morgon-tv."], ["4 dec", "Sista beställningsdag", "För leverans före jul, privat och företag."], ["24 dec", "Julafton", "Den sista bilturen före Kalle Anka."], ["31 dec", "Nyårsafton", "Fria blad: skriv det du vill släppa, och låt elden ta det."]];
  const tracks = [["Press & PR", "Lokalt → nationellt → julklappsguiderna"], ["Företag", "Julgåvan till personalen"], ["Leverans", "Gjord för hand, levererad i tid"]];
  return (
    <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", gap: 64, background: BIRCH, color: SOOT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 48 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <A as="p" kind="fade" style={kicker}>Vägen dit</A>
          <A as="h2" d={0.15} style={{ ...h2, fontFamily: serif, fontWeight: 400, letterSpacing: -1 }}>Första vintern.</A>
        </div>
        <A kind="fade" d={0.5} style={{ display: "flex", gap: 12 }}>
          {tracks.map(([t, p]) => (
            <div key={t} style={{ border: `1.5px solid ${SOOT}`, borderRadius: 12, padding: "12px 16px", width: 250 }}>
              <p style={{ fontSize: 22, fontWeight: 700 }}>{t}</p>
              <p style={{ fontSize: 18, color: "#5d5148" }}>{p}</p>
            </div>
          ))}
        </A>
      </div>
      <div style={{ position: "relative" }}>
        <A kind="wipe" d={0.6} dur={2.2} style={{ position: "absolute", left: 0, right: 0, top: 13, height: 4, background: SOOT }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 32, position: "relative" }}>
          {dates.map(([d, t, p], n) => (
            <A key={d} d={0.8 + n * 0.4} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: n === 1 ? EMBER : BIRCH, border: `4px solid ${n === 1 ? EMBER : SOOT}` }} />
              <p style={{ font: "600 26px ui-monospace, 'SF Mono', Menlo, monospace", color: n === 1 ? EMBER : SOOT, marginTop: 10 }}>{d}</p>
              <h3 style={{ fontSize: 34, fontWeight: 700 }}>{t}</h3>
              <p style={{ fontSize: 24, lineHeight: 1.4, color: "#5d5148" }}>{p}</p>
            </A>
          ))}
        </div>
      </div>
    </div>
  );
}

function End() {
  return (
    <div style={{ position: "absolute", inset: 0, background: SOOT, color: BIRCH, overflow: "hidden" }}>
      <video src={IMG("eldstad.mp4")} poster={IMG("eldstad.jpg")} autoPlay muted loop playsInline style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }} />
      <div style={{ ...pad, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 40, textAlign: "center" }}>
        <A as="h1" d={0.4} dur={1.4} style={{ fontFamily: serif, fontSize: 130, fontWeight: 400, lineHeight: 1.05 }}>En brasa i varje hem.</A>
        <A as="p" kind="fade" d={1.4} style={{ fontFamily: serif, fontSize: 40, fontStyle: "italic", color: "#e9dccb", width: 1300 }}>Gjord med kärlek, för att sedan försvinna in i evig kärlek.</A>
        <A as="p" kind="fade" d={2.2} style={{ fontSize: 28, color: ASH, marginTop: 24 }}>eldboken.se · @eldboken · PullUp</A>
      </div>
    </div>
  );
}

export const pitch = {
  slug: "eldboken",
  client: "Eldboken",
  title: "En brasa i varje hem",
  slides: [
    { id: "cover", title: "Eldboken", Slide: Cover, bg: SOOT, notes: "Filmen är från din egen eldstad." },
    { id: "varfor", title: "Varför", Slide: Why, bg: SOOT, notes: "Syftet först: sprida kärlek och föra folk närmare varandra." },
    { id: "bockerna", title: "Två böcker", Slide: Books, bg: BIRCH },
    { id: "ritualen", title: "Ritualen", Slide: Ritual, bg: SOOT, notes: "Elden växer medan stegen kommer in." },
    { id: "garaget", title: "Från garaget", Slide: Garage, bg: BIRCH },
    { id: "tva-dagar", title: "Två dagar", Slide: Momentum, bg: SOOT, notes: "Siffrorna per 6 november. Uppdatera när de växer." },
    { id: "omdomen", title: "Omdömen", Slide: Voices, bg: BIRCH },
    { id: "resan", title: "Resan", Slide: Hearths, bg: "#0c0907", notes: "Sverige mörknar och tänds, en brasa i taget, med start på Aspö." },
    { id: "vagen", title: "Vägen dit", Slide: Road, bg: BIRCH, notes: "Datumen är pressplanens." },
    { id: "slut", title: "En brasa i varje hem", Slide: End, bg: SOOT },
  ],
};
