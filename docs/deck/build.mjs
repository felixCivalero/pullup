// Prints the booklet to PDF, one per language:
// frontend/src/pages/deck/slides.sv.html (Swedish, the default) and slides.html
// (English) + deck.css → A-series portrait pages.
// Writes ONLY the private copies (the booklet is email-gated; never public) —
// backend/assets/the-production-core{.sv,}.pdf, streamed via emailed /deck/:token links.
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
const css = fs.readFileSync(path.join(deckDir, "deck.css"), "utf8");
const assets = path.join(here, "../../backend/assets");
const EDITIONS = [
  { lang: "sv", src: "slides.sv.html", out: "the-production-core.sv.pdf", title: "The Production Core — PullUps häfte" },
  { lang: "en", src: "slides.html", out: "the-production-core.pdf", title: "The Production Core — PullUp booklet" },
];
const pngIdx = process.argv.indexOf("--png");
const pngDir = pngIdx > -1 ? process.argv[pngIdx + 1] : null;

const browser = await chromium.launch();
try {
  for (const ed of EDITIONS) {
    const slides = fs.readFileSync(path.join(deckDir, ed.src), "utf8").replaceAll('src="/', `src="${publicUrl}/`);
    const html = `<!doctype html><html lang="${ed.lang}"><head><meta charset="utf-8" />
<title>${ed.title}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>${css}
@page { size: 1240px 1754px; margin: 0; }
html, body { margin: 0; background: #fff; }
.deck .s { break-after: page; }
.deck .s:last-child { break-after: auto; }
</style></head><body class="deck">${slides}</body></html>`;

    const tmp = path.join(here, `.deck-print.${ed.lang}.html`);
    fs.writeFileSync(tmp, html);
    try {
      const page = await browser.newPage({ viewport: { width: 1240, height: 1754 } });
      await page.goto(pathToFileURL(tmp).href, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const pdf = await page.pdf({ width: "1240px", height: "1754px", printBackground: true, preferCSSPageSize: true });
      const out = path.join(assets, ed.out);
      fs.writeFileSync(out, pdf);
      console.log("wrote", out);
      if (pngDir) {
        const n = await page.locator("section.s").count();
        for (let i = 0; i < n; i++) {
          await page.locator("section.s").nth(i).screenshot({ path: path.join(pngDir, `${ed.lang}-${String(i + 1).padStart(2, "0")}.png`) });
        }
      }
      await page.close();
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  }
} finally {
  await browser.close();
}
