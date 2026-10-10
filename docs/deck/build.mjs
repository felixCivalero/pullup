// Renders production-core.html → backend/assets/the-production-core.pdf
// (16:9, one slide per page). Needs Playwright: `npx playwright install chromium`.
// Usage: node docs/deck/build.mjs [--png <dir>]   (--png also writes page previews)
import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = "file://" + path.join(here, "production-core.html");
const out = path.join(here, "../../backend/assets/the-production-core.pdf");
const pngIdx = process.argv.indexOf("--png");
const pngDir = pngIdx > -1 ? process.argv[pngIdx + 1] : null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(src, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, width: "1920px", height: "1080px", printBackground: true, preferCSSPageSize: true });
if (pngDir) {
  const n = await page.locator("section.s").count();
  for (let i = 0; i < n; i++) {
    await page.locator("section.s").nth(i).screenshot({ path: path.join(pngDir, `slide-${String(i + 1).padStart(2, "0")}.png`) });
  }
}
await browser.close();
console.log("wrote", out);
