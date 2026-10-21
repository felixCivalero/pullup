// Renders the share card for every case: public/og/case-<slug>.jpg (1200×630).
// Run after changing a case's title, score or colour, then bump OG_VERSION in
// src/components/agency/caseShare.js:
//   node scripts/case-og-images.mjs
// Uses the system Chrome through playwright-core (not a dependency of the
// site): point PLAYWRIGHT at any install, e.g.
//   PLAYWRIGHT=/path/to/node_modules/playwright-core/index.mjs node scripts/case-og-images.mjs
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CASE_SHARES } from "../src/components/agency/caseShare.js";

const { chromium } = await import(process.env.PLAYWRIGHT || "playwright-core");
const out = fileURLToPath(new URL("../public/og/", import.meta.url));
mkdirSync(out, { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const page = (c) => `<!doctype html><html lang="sv"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; padding: 64px 72px; display: flex; flex-direction: column; justify-content: space-between;
    background: radial-gradient(120% 120% at 100% 0%, rgba(255,255,255,0.16), transparent 55%), ${c.color};
    color: #fff; font-family: "Inter Tight", sans-serif; }
  .k { font-size: 22px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.78; }
  h1 { margin-top: 24px; font-size: 82px; font-weight: 700; line-height: 0.98; letter-spacing: -0.045em; max-width: 15ch; }
  .row { display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; }
  .v { font-size: 64px; font-weight: 700; letter-spacing: -0.04em; line-height: 1; }
  .l { margin-top: 8px; font-size: 24px; font-weight: 500; opacity: 0.85; }
  .site { font-size: 24px; font-weight: 600; opacity: 0.85; }
</style></head><body>
  <div><p class="k">${esc(c.no)} · ${esc(c.name)}</p><h1>${esc(c.title)}</h1></div>
  <div class="row"><div><p class="v">${esc(c.score[0])}</p><p class="l">${esc(c.score[1])}</p></div><p class="site">pullup.se</p></div>
</body></html>`;

const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
const tab = await browser.newPage({ viewport: { width: 1200, height: 630 } });
for (const c of CASE_SHARES) {
  await tab.setContent(page(c), { waitUntil: "networkidle" });
  await tab.evaluate(() => document.fonts.ready);
  await tab.screenshot({ path: `${out}case-${c.slug}.jpg`, type: "jpeg", quality: 88 });
  console.log(`og/case-${c.slug}.jpg`);
}
await browser.close();
