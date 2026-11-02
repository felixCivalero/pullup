// Renders the share cards for the site's own pages (1200×630, public/og/):
//   home.jpg            – / (and the legal pages, login)
//   stockholm.jpg       – /stockholm
//   eventverktyg.jpg    – /eventverktyg and /pullup
//   culture-capital.jpg – /culture-capital
// /felix-civalero keeps its photo card (og/felix-civalero.jpg); the cases have
// their own script (case-og-images.mjs). Run after changing a page's headline,
// then bump OG_VERSION in src/pages/homeMeta.js:
//   PLAYWRIGHT=/path/to/node_modules/playwright-core/index.mjs node scripts/og-pages.mjs
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT || "playwright-core");
const out = fileURLToPath(new URL("../public/og/", import.meta.url));
mkdirSync(out, { recursive: true });

const FONTS = `<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">`;
const BASE = `* { margin: 0; box-sizing: border-box; } body { width: 1200px; height: 630px; overflow: hidden; font-family: "Inter Tight", sans-serif; position: relative; }`;

// The front page's globe: dots on a sphere with the brand's words around it.
const globe = (color, words) => `<canvas id="g" width="1200" height="1260" style="position:absolute;right:-40px;top:20px;width:600px;height:630px"></canvas>
<script>
  window.__done = false;
  document.fonts.load("600 19px 'Inter Tight'").then(() => {
  const c = document.getElementById("g").getContext("2d"); c.scale(2, 2);
  const cx = 300, cy = 300, R = 230, N = 900;
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963 + 0.6;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    if (z < -0.15) continue;
    const s = 1.4 + z * 2.4;
    c.globalAlpha = 0.35 + z * 0.65; c.fillStyle = "${color}";
    c.beginPath(); c.arc(cx + x * R, cy - y * R, s, 0, Math.PI * 2); c.fill();
  }
  c.globalAlpha = 1; c.fillStyle = "${color}"; c.font = "600 19px 'Inter Tight'"; c.textAlign = "center";
  ${JSON.stringify(words)}.forEach((w, i, a) => { const a2 = (i / a.length) * Math.PI * 2 - 1.2; c.fillText(w, cx + Math.cos(a2) * R * 0.78, cy + Math.sin(a2) * R * 0.78); });
  window.__done = true; });
</script>`;

const CARDS = {
  home: `<style>${BASE}
    body { background: radial-gradient(90% 90% at 85% 40%, #ff3aa8 0%, #ec178f 55%, #d10f7d 100%); color: #0a0a0a; padding: 64px 72px; }
    .k { font-size: 22px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin-top: 120px; font-size: 104px; font-weight: 800; line-height: .9; letter-spacing: -.055em; max-width: 7.5ch; position: relative; z-index: 1; }
    p.s { margin-top: 26px; font-size: 27px; font-weight: 500; line-height: 1.3; max-width: 23ch; position: relative; z-index: 1; }
    .site { position: absolute; left: 72px; bottom: 56px; font-size: 24px; font-weight: 700; }
  </style>
  <p class="k">PullUp · Stockholm</p>
  <h1>Creative powerhouse.</h1>
  <p class="s">Vi bygger världar runt kärnan i ert varumärke.</p>
  <p class="site">pullup.se</p>
  ${globe("#0a0a0a", ["Kultur", "Varumärke", "E-handel", "Instagram", "Film", "Google", "Event", "Content"])}`,

  stockholm: `<style>${BASE}
    body { background: #0a0a0a; color: #f4f1ea; padding: 64px 72px; }
    .k { font-size: 22px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #ec178f; }
    h1 { margin-top: 34px; font-family: "Instrument Serif", serif; font-weight: 400; font-size: 210px; line-height: .85; letter-spacing: -.03em; }
    p.s { margin-top: 30px; font-size: 32px; font-weight: 500; color: rgba(244,241,234,.8); }
    .chips { position: absolute; left: 72px; bottom: 60px; display: flex; gap: 12px; }
    .chips span { height: 50px; padding: 0 24px; border: 1.5px solid rgba(255,255,255,.28); border-radius: 999px; display: flex; align-items: center; font-size: 22px; font-weight: 600; }
    .chips span:first-child { background: #f4f1ea; color: #0a0a0a; border-color: #f4f1ea; }
    .site { position: absolute; right: 72px; bottom: 72px; font-size: 24px; font-weight: 700; color: rgba(244,241,234,.7); }
  </style>
  <p class="k">Hitta kultur · Gratis</p>
  <h1>Stockholm</h1>
  <p class="s">Allt som händer, på ett ställe. Varje torsdag på mejl.</p>
  <div class="chips"><span>Allt</span><span>Musik</span><span>Konst</span><span>Scen</span><span>Kultur</span></div>
  <p class="site">pullup.se/stockholm</p>`,

  eventverktyg: `<style>${BASE}
    body { background: radial-gradient(90% 80% at 82% 45%, #3a0c27 0%, #0a0a0a 65%); color: #fff; padding: 64px 72px; }
    .k { font-size: 22px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: #ec178f; }
    h1 { margin-top: 70px; font-size: 112px; font-weight: 800; line-height: .9; letter-spacing: -.055em; }
    p.s { margin-top: 28px; font-size: 26px; font-weight: 500; line-height: 1.35; color: rgba(255,255,255,.78); max-width: 25ch; }
    .site { position: absolute; left: 72px; bottom: 56px; font-size: 24px; font-weight: 700; color: rgba(255,255,255,.7); }
    .card { position: absolute; right: 80px; top: 120px; width: 380px; border-radius: 28px; background: #161616; border: 1px solid rgba(255,255,255,.1); overflow: hidden; box-shadow: 0 30px 80px rgba(0,0,0,.5); }
    .card .img { height: 150px; background: linear-gradient(135deg, #ec178f, #5a1040); display: flex; align-items: flex-end; padding: 18px 22px; font-size: 30px; font-weight: 800; letter-spacing: -.03em; }
    .card .b { padding: 20px 22px 24px; }
    .card .t { font-size: 26px; font-weight: 700; }
    .card .m { margin-top: 6px; font-size: 17px; color: rgba(255,255,255,.6); }
    .bar { margin-top: 18px; height: 8px; border-radius: 9px; background: rgba(255,255,255,.12); } .bar i { display: block; height: 100%; width: 77%; border-radius: 9px; background: #ec178f; }
    .card .n { margin-top: 10px; font-size: 16px; color: rgba(255,255,255,.6); }
    .btn { margin-top: 20px; height: 54px; border-radius: 999px; background: #fff; color: #0a0a0a; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; }
  </style>
  <p class="k">Eventverktyget · Gratis</p>
  <h1>Fyll rummet.<br>Gratis.</h1>
  <p class="s">Eventsida, anmälan, kalenderinbjudan, gästlista och CRM.</p>
  <p class="site">pullup.se/eventverktyg</p>
  <div class="card"><div class="img">Releasefest</div><div class="b"><p class="t">Releasefest</p><p class="m">Lör 7 nov · 19:00</p><div class="bar"><i></i></div><p class="n">92 av 120 kommer</p><div class="btn">Anmäl dig</div></div></div>`,

  "culture-capital": `<style>${BASE}
    body { background: #07060a; color: #f3eee8; font-family: "Instrument Serif", serif; }
    canvas { position: absolute; inset: 0; }
    .t { position: absolute; left: 680px; top: 196px; }
    .k { font-family: "Inter Tight", sans-serif; font-size: 20px; font-weight: 600; letter-spacing: .2em; text-transform: uppercase; color: #ec178f; }
    h1 { margin-top: 24px; font-weight: 400; font-size: 70px; line-height: 1.08; }
    h1 em { font-style: italic; }
  </style>
  <canvas id="d" width="1200" height="630"></canvas>
  <div class="t"><p class="k">Our first fund · Now forming</p><h1>Culture Capital I<br>For the people who<br><em>move a city.</em></h1></div>
  <script>
    window.__done = false;
    document.fonts.load("italic 330px 'Instrument Serif'").then(() => {
    const c = document.getElementById("d").getContext("2d");
    const m = document.createElement("canvas"); m.width = 1200; m.height = 630; const g = m.getContext("2d");
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = "italic 330px 'Instrument Serif'"; g.fillText("75M", 330, 315);
    const px = g.getImageData(0, 0, 1200, 630).data, pts = [];
    for (let y = 0; y < 630; y += 2) for (let x = 0; x < 1200; x += 2) if (px[(y * 1200 + x) * 4 + 3] > 128) pts.push([x, y]);
    const cols = ["243,238,232", "243,238,232", "243,238,232", "243,238,232", "243,238,232", "243,238,232", "236,23,143", "255,122,74"];
    c.globalCompositeOperation = "lighter";
    const dot = (x, y, a, s) => { c.fillStyle = "rgba(" + cols[(Math.random() * cols.length) | 0] + "," + a + ")"; c.fillRect(x, y, s, s); };
    for (let i = 0; i < 9000; i++) { const p = pts[(Math.random() * pts.length) | 0]; dot(p[0] + Math.random() * 2 - 1, p[1] + Math.random() * 2 - 1, 0.35 + Math.random() * 0.6, 1.4); }
    for (let i = 0; i < 1400; i++) dot(Math.random() * 1200, Math.random() * 630, Math.random() * 0.3, 1.2);
    window.__done = true; });
  </script>`,
};

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const [name, body] of Object.entries(CARDS)) {
  // Fonts first, then the body (its scripts draw with them).
  await tab.setContent(`<!doctype html><html lang="sv"><head><meta charset="utf-8">${FONTS}</head><body></body></html>`, { waitUntil: "networkidle" });
  await tab.evaluate(() => Promise.all([
    document.fonts.load("800 100px 'Inter Tight'"), document.fonts.load("600 20px 'Inter Tight'"),
    document.fonts.load("400 100px 'Instrument Serif'"), document.fonts.load("italic 400 100px 'Instrument Serif'"),
  ]));
  await tab.setContent(`<!doctype html><html lang="sv"><head><meta charset="utf-8">${FONTS}</head><body>${body}</body></html>`, { waitUntil: "networkidle" });
  await tab.waitForFunction(() => window.__done !== false);
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: `${out}${name}.jpg`, type: "jpeg", quality: 88 });
  console.log(`og/${name}.jpg`);
}
await browser.close();
