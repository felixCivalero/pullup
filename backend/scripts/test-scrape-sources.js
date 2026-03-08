/**
 * Test script — runs each scraper source and validates data quality.
 * Usage: node backend/scripts/test-scrape-sources.js
 */

import * as cheerio from "cheerio";

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 Chrome/124", Accept: "text/html" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
function parseDate(str) { if (!str) return null; const d = new Date(str); return isNaN(d.getTime()) ? null : d.toISOString(); }
function parseSwedishDate(str) {
  if (!str) return null;
  const now = new Date();
  if (/idag/i.test(str)) return now.toISOString();
  if (/imorgon/i.test(str)) { now.setDate(now.getDate() + 1); return now.toISOString(); }
  const m1 = str.match(/(\d{1,2})\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)(?:\s+(\d{4}))?/i);
  if (m1) { const months = {jan:0,feb:1,mar:2,apr:3,maj:4,jun:5,jul:6,aug:7,sep:8,okt:9,nov:10,dec:11}; const mo = months[m1[2].toLowerCase()]; if (mo !== undefined) return new Date(m1[3] ? parseInt(m1[3]) : now.getFullYear(), mo, parseInt(m1[1])).toISOString(); }
  const m2 = str.match(/(\d{1,2})\/(\d{1,2})/);
  if (m2) return new Date(now.getFullYear(), parseInt(m2[2]) - 1, parseInt(m2[1])).toISOString();
  return parseDate(str);
}

const FIELDS = ["title", "url", "image_url", "starts_at", "location"];
async function test(name, fn) {
  const start = Date.now();
  try {
    const events = await fn();
    const t = ((Date.now() - start) / 1000).toFixed(1);
    if (events.length === 0) { console.log(`❌ ${name}: 0 events (${t}s)`); return { name, count: 0 }; }
    const stats = {};
    for (const f of FIELDS) { const n = events.filter(e => e[f] && String(e[f]).length > 0).length; stats[f] = Math.round(n / events.length * 100); }
    const issues = Object.entries(stats).filter(([, v]) => v < 100).map(([k, v]) => `${k}:${v}%`);
    const icon = issues.length === 0 ? "✅" : "⚠️";
    console.log(`${icon} ${name}: ${events.length} events (${t}s)${issues.length ? " | " + issues.join(" ") : ""}`);
    console.log(`   📌 "${events[0].title?.slice(0, 50)}" img:${!!events[0].image_url} date:${events[0].starts_at?.slice(0, 10) || "null"} url:${events[0].url?.slice(0, 60) || "null"}`);
    return { name, count: events.length, issues };
  } catch (e) { const t = ((Date.now() - start) / 1000).toFixed(1); console.log(`❌ ${name}: ERROR (${t}s) — ${e.message}`); return { name, count: 0, error: e.message }; }
}

console.log("\n🔍 Testing all scraping sources...\n" + "=".repeat(70) + "\n");

const results = [];

results.push(await test("Resident Advisor", async () => { await fetchHtml("https://ra.co/events/se/stockholm"); return []; }));
results.push(await test("Sveriges Radio", async () => { const r = await fetch("https://api.sr.se/api/v2/events?pagination=false&format=json&locationid=105&size=50"); if (!r.ok) throw new Error(`HTTP ${r.status}`); return []; }));

results.push(await test("Nationalmuseum", async () => {
  const html = await fetchHtml("https://www.nationalmuseum.se/utstallningar/"); const $ = cheerio.load(html);
  const byUrl = {};
  $('a[href*="/utst"]').each((_, el) => {
    const href = $(el).attr("href"); if (!href) return;
    const url = href.startsWith("http") ? href : "https://www.nationalmuseum.se" + href;
    if (url.endsWith("utställningar") || url.endsWith("utstallningar/")) return;
    if (!byUrl[url]) byUrl[url] = { titles: [], imgs: [] };
    const $img = $(el).find("img").first();
    if ($img.length) { const src = $img.attr("src")?.trim(); if (src) byUrl[url].imgs.push(src.startsWith("http") ? src : "https://www.nationalmuseum.se" + src); }
    const text = $(el).text().trim();
    if (text && text.length > 2) byUrl[url].titles.push(text);
  });
  const allImgs = []; $("picture img, img[src*='imager']").each((_, el) => { const s = $(el).attr("src")?.trim(); if (s && !s.startsWith("data:")) allImgs.push(s.startsWith("http") ? s : "https://www.nationalmuseum.se" + s); });
  const urls = Object.keys(byUrl); const events = [];
  for (let i = 0; i < urls.length; i++) { const d = byUrl[urls[i]]; const t = d.titles[0]; if (!t || t.length < 2) continue; events.push({ title: t, url: urls[i], image_url: d.imgs[0] || allImgs[i] || null, starts_at: null, location: "Nationalmuseum, Stockholm" }); }
  return events;
}));

results.push(await test("Kulturhuset", async () => { await fetchHtml("https://kulturhusetstadsteatern.se/program/"); return []; }));

results.push(await test("Luger", async () => {
  const html = await fetchHtml("https://luger.se/konserter/"); const $ = cheerio.load(html); const events = [];
  $(".post-item").each((_, el) => {
    const $el = $(el); const title = $el.find(".post-item__title a").first().text().trim();
    const href = $el.find(".post-item__title a").first().attr("href"); if (!title) return;
    const dateText = $el.find(".post-item__item-date").first().text().trim();
    const venue = $el.find(".post-item__item-term-venue").first().text().trim();
    const city = $el.find(".post-item__item-term-city").first().text().trim();
    events.push({ title, url: href || null, image_url: null, starts_at: dateText ? (parseDate(dateText) || parseSwedishDate(dateText)) : null, location: [venue, city].filter(Boolean).join(", ") || "Stockholm" });
  }); return events;
}));

results.push(await test("Nalen", async () => {
  const html = await fetchHtml("https://nalen.com/sv/konserter"); const $ = cheerio.load(html); const events = [];
  $("a[href*='/konsert/'], a[href*='/konserter/']").each((_, el) => {
    const $el = $(el); const title = $el.find("h2, h3").first().text().trim() || $el.text().trim();
    const href = $el.attr("href"); const img = $el.find("img").first().attr("src") || null;
    if (!title || title.length < 2) return;
    events.push({ title, url: href ? (href.startsWith("http") ? href : "https://nalen.com" + href) : null, image_url: img, starts_at: null, location: "Nalen, Stockholm" });
  }); return events;
}));

results.push(await test("Fotografiska", async () => {
  const html = await fetchHtml("https://stockholm.fotografiska.com/sv/utstallningar/"); const $ = cheerio.load(html); const events = [];
  $("a[href*='/sv/exhibitions/'], a[href*='/exhibitions/']").each((_, el) => {
    const $el = $(el); const href = $el.attr("href");
    if (!href || href === "/sv/utstallningar/") return;
    const title = $el.find("h1, h2, h3, p").first().text().trim() || $el.attr("aria-label");
    const img = $el.find("img").first().attr("src") || null;
    if (title && title.length > 2) events.push({ title, url: href.startsWith("http") ? href : "https://stockholm.fotografiska.com" + href, image_url: img, starts_at: null, location: "Fotografiska, Stockholm" });
  }); return events;
}));

results.push(await test("Södra Teatern", async () => {
  const html = await fetchHtml("https://sodrateatern.com/pa-scen/"); const $ = cheerio.load(html); const events = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { const p = JSON.parse($(el).html()); for (const e of p?.itemListElement || []) { const i = e?.item;
      if (i?.["@type"] === "Event" && i?.name) { const dn = cheerio.load(i.name, null, false).text(); const $img = $(`img[alt="${i.name}"]`); events.push({ title: dn, url: i.url, image_url: i.image || $img.attr("data-lazy-src") || null, starts_at: parseDate(i.startDate), location: "Södra Teatern, Stockholm" }); }
    }} catch {} }); return events;
}));

results.push(await test("Berns", async () => {
  const html = await fetchHtml("https://www.berns.se/calendar/"); const $ = cheerio.load(html); const events = []; const seen = new Set();
  $(".calender-item").each((_, el) => {
    const $el = $(el); const $a = $el.find("a[href*='/calendar/']").first(); const href = $a.attr("href");
    if (!href || href === "/calendar/") return; const url = href.startsWith("http") ? href : "https://berns.se" + href;
    if (seen.has(url)) return; seen.add(url);
    const img = $a.find("img").first().attr("src") || null;
    const dm = $el.find("div").text().trim().match(/(\d{1,2}\s+\w+\s+\d{4})/);
    const slug = href.replace(/.*\/calendar\//, "").replace(/\/$/, "");
    events.push({ title: slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()), url, image_url: img, starts_at: dm ? parseDate(dm[1]) : null, location: "Berns, Stockholm" });
  });
  const h5s = []; $("h5").each((_, el) => { const t = $(el).text().trim(); if (t.length >= 2) h5s.push(t); });
  events.forEach((ev, i) => { if (h5s[i]) ev.title = h5s[i]; });
  return events;
}));

results.push(await test("Fasching", async () => {
  const html = await fetchHtml("https://www.fasching.se/en/calendar/"); const $ = cheerio.load(html);
  const imageMap = {}; $("img[src*='wp-content/uploads']").each((_, el) => { const alt = $(el).attr("alt") || ""; const src = $(el).attr("src"); const name = alt.replace(/^Bild på\s*/i, "").trim(); if (name && src) imageMap[name.toLowerCase()] = src; });
  const seen = new Set(); const events = [];
  $("a[href*='/en/']").each((_, el) => {
    const href = $(el).attr("href"); if (!href || href === "/en/" || href === "/en/calendar/" || href.includes("/en/calendar") || href.includes("/en/about") || href.includes("/en/contact")) return;
    const url = href.startsWith("http") ? href : "https://www.fasching.se" + href; if (seen.has(url)) return; seen.add(url);
    const title = $(el).find("h2, h3, h4").first().text().trim(); if (!title || title.length < 2) return;
    const img = imageMap[title.toLowerCase()] || null;
    const hm = href.match(/#(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})/);
    events.push({ title, url, image_url: img, starts_at: hm ? parseDate(`${hm[1]}T${hm[2]}:${hm[3]}:00`) : null, location: "Fasching, Stockholm" });
  }); return events;
}));

results.push(await test("Riche", async () => {
  const html = await fetchHtml("https://riche.se/kalendarium/"); const $ = cheerio.load(html); const seen = new Set(); const events = [];
  $("[class*='event-']").each((_, el) => {
    const cls = $(el).attr("class") || ""; if (!cls.match(/event-\d/)) return;
    const title = $(el).find("h6, h5, h4").first().text().trim(); if (!title || title.length < 2 || /^(Vad|Var):/i.test(title)) return;
    const href = $(el).find("a[href*='/events/']").first().attr("href"); const url = href ? (href.startsWith("http") ? href : "https://riche.se" + href) : "https://riche.se/kalendarium/";
    if (seen.has(url)) return; seen.add(url);
    const img = $(el).find("img").first().attr("src") || null;
    const dm = $(el).text().match(/(\d{1,2})\/(\d{1,2})/);
    events.push({ title, url, image_url: img && !img.startsWith("data:") ? img : null, starts_at: dm ? new Date(new Date().getFullYear(), parseInt(dm[2]) - 1, parseInt(dm[1])).toISOString() : null, location: "Riche, Stockholm" });
  }); return events;
}));

results.push(await test("Luma", async () => {
  const html = await fetchHtml("https://lu.ma/stockholm"); const $ = cheerio.load(html); const raw = $("#__NEXT_DATA__").text(); if (!raw) return [];
  const json = JSON.parse(raw); const items = json?.props?.pageProps?.initialData?.data?.events || [];
  return items.map(entry => { const ev = entry?.event || entry; return { title: ev.name, url: ev.url ? `https://lu.ma/${ev.url}` : null, image_url: ev.cover_url, starts_at: parseDate(ev.start_at), location: ev.geo_address_info?.address || "Stockholm" }; });
}));

results.push(await test("B-K", async () => {
  const html = await fetchHtml("https://www.b-k.se/whats-on"); const $ = cheerio.load(html); const seen = new Set(); const events = [];
  $("a[href*='/whats-on/']").each((_, el) => {
    const href = $(el).attr("href"); if (!href || href === "/whats-on" || href === "/whats-on/") return;
    const url = href.startsWith("http") ? href : "https://www.b-k.se" + href; if (seen.has(url)) return; seen.add(url);
    const title = $(el).find("h1, h2, h3, h4, [class*='title'], [class*='heading']").first().text().trim() || $(el).find("div, p").first().text().trim();
    const img = $(el).find("img").first().attr("src") || null;
    const dm = $(el).text().match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})/i);
    if (title && title.length >= 2) events.push({ title, url, image_url: img, starts_at: dm ? parseDate(`${dm[1]} ${dm[2]}, ${dm[3]}`) : null, location: "B-K, Stockholm" });
  }); return events;
}));

results.push(await test("Debaser", async () => {
  const html = await fetchHtml("https://debaser.se/kalender/"); const $ = cheerio.load(html); const seen = new Set(); const events = [];
  function pd(text) { const m = text?.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})/i); if (!m) return null; const months = {jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11}; return new Date(parseInt(m[3]), months[m[2].toLowerCase()], parseInt(m[1])); }
  $(".collection-item-20").each((_, el) => {
    const $el = $(el); const $link = $el.find("a[href*='/events/']").first(); const href = $link.attr("href");
    if (!href || href === "/events/") return; const url = href.startsWith("http") ? href : "https://debaser.se" + href;
    if (seen.has(url)) return; seen.add(url);
    let title = null; $el.find("a[href*='/events/']").each((_, a) => { const t = $(a).text().trim(); if (t && t.length > 2 && t.length < 200 && !t.match(/^\d{2}\w{3}\d{4}/)) { if (!title || t.length < title.length) title = t; } });
    if (!title || title.length < 2) return;
    const dateObj = pd($el.text());
    events.push({ title, url, image_url: null, starts_at: dateObj ? dateObj.toISOString() : null, location: "Debaser, Stockholm" });
  }); return events;
}));

results.push(await test("Stampen", async () => {
  const html = await fetchHtml("https://www.stampen.se/program/"); const $ = cheerio.load(html); const events = [];
  $('script[type="application/ld+json"]').each((_, el) => { try { const p = JSON.parse($(el).html()); const items = Array.isArray(p) ? p : p?.itemListElement ? p.itemListElement.map(i => i.item || i) : [p]; for (const i of items) { if (i["@type"] !== "Event" && i["@type"] !== "MusicEvent") continue; events.push({ title: i.name, url: i.url, image_url: i.image, starts_at: parseDate(i.startDate), location: "Stampen, Stockholm" }); }} catch {} });
  return events;
}));

results.push(await test("Glenn Miller", async () => { const html = await fetchHtml("https://glennmillercafe.se/en/konserter/"); const $ = cheerio.load(html); return []; /* Wix - client-side rendered */ }));
results.push(await test("Under Bron", async () => { const html = await fetchHtml("https://event.husetunderbron.se/"); return []; /* Venue rental page */ }));
results.push(await test("Hosoi", async () => { const html = await fetchHtml("https://www.hosoistockholm.com/dance-listen"); return []; /* Webflow dynamic */ }));
results.push(await test("Artilleriet", async () => { const html = await fetchHtml("https://restaurangartilleriet.se/eventkalender/"); return []; /* Empty calendar */ }));
results.push(await test("Winterviken", async () => { const html = await fetchHtml("https://winterviken.se/en/scen/"); return []; /* Info page only */ }));
results.push(await test("Färgfabriken", async () => { return []; /* URL broken, site renders dynamically */ }));

results.push(await test("Fallan", async () => {
  const html = await fetchHtml("https://fallan.nu/whats-on"); const $ = cheerio.load(html); const seen = new Set(); const events = [];
  $("a[href*='/whats-on/']").each((_, el) => {
    const href = $(el).attr("href"); if (!href || href === "/whats-on/" || href === "/whats-on") return;
    const url = href.startsWith("http") ? href : "https://fallan.nu" + href; if (seen.has(url)) return; seen.add(url);
    const title = $(el).find("h3, h4, h2").first().text().trim();
    const img = $(el).find("img").first().attr("src") || null;
    const dm = $(el).text().match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})/i);
    if (title && title.length >= 2) events.push({ title, url, image_url: img, starts_at: dm ? parseDate(`${dm[1]} ${dm[2]}, ${dm[3]}`) : null, location: "Fallan, Stockholm" });
  }); return events;
}));

results.push(await test("Lydmar", async () => {
  const html = await fetchHtml("https://lydmar.com/events/"); const $ = cheerio.load(html); const seen = new Set(); const events = [];
  $("img[src*='uploads']").each((_, el) => {
    const alt = $(el).attr("alt") || ""; const src = $(el).attr("src") || "";
    if (!alt || !src.includes("uploads")) return;
    const title = alt.replace(/\s*Lydmar Hotel\s*stockholm\s*/i, "").trim();
    if (!title || title.length < 2 || seen.has(title)) return; seen.add(title);
    events.push({ title, url: "https://lydmar.com/events/", image_url: src, starts_at: null, location: "Lydmar, Stockholm" });
  }); return events;
}));

// Summary
console.log("\n" + "=".repeat(70));
console.log("\n📊 SUMMARY\n");
const working = results.filter(r => r.count > 0);
const broken = results.filter(r => r.count === 0);
console.log(`✅ Working: ${working.length}/${results.length}`);
console.log(`❌ Broken/Empty: ${broken.length}/${results.length}`);
const total = working.reduce((sum, r) => sum + r.count, 0);
console.log(`📦 Total events across working sources: ${total}`);
if (broken.length > 0) {
  console.log("\n🚫 Sources returning 0 events:");
  for (const r of broken) console.log(`   - ${r.name}: ${r.error || "no events / client-side rendering"}`);
}
console.log("\n✨ Done!\n");
