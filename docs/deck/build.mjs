// Prints the deck to PDF from the same source the open /deck page renders:
// frontend/src/pages/deck/slides.html + deck.css → 16:9, one slide per page.
// Writes frontend/public/the-production-core.pdf (the open download) and
// backend/assets/the-production-core.pdf (older emailed /deck/:token links).
// Needs Playwright: `npx playwright install chromium`.
// Usage: node docs/deck/build.mjs [--png <dir>]   (--png also writes page previews)
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fe = path.join(here, "../../frontend");
const deckDir = path.join(fe, "src/pages/deck");
const publicUrl = pathToFileURL(path.join(fe, "public")).href;
const slides = fs.readFileSync(path.join(deckDir, "slides.html"), "utf8").replaceAll('src="/', `src="${publicUrl}/`);
const css = fs.readFileSync(path.join(deckDir, "deck.css"), "utf8");
const outs = [path.join(fe, "public/the-production-core.pdf"), path.join(here, "../../backend/assets/the-production-core.pdf")];
const pngIdx = process.argv.indexOf("--png");
const pngDir = pngIdx > -1 ? process.argv[pngIdx + 1] : null;

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<title>The Production Core — PullUp</title>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>${css}
@page { size: 1920px 1080px; margin: 0; }
html, body { margin: 0; background: #fff; }
.deck .s { break-after: page; }
.deck .s:last-child { break-after: auto; }
</style></head><body class="deck">${slides}</body></html>`;

const tmp = path.join(here, ".deck-print.html");
fs.writeFileSync(tmp, html);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const pdf = await page.pdf({ width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
  for (const out of outs) fs.writeFileSync(out, pdf);
  if (pngDir) {
    const n = await page.locator("section.s").count();
    for (let i = 0; i < n; i++) {
      await page.locator("section.s").nth(i).screenshot({ path: path.join(pngDir, `slide-${String(i + 1).padStart(2, "0")}.png`) });
    }
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { force: true });
}
console.log("wrote", outs.join(", "));
