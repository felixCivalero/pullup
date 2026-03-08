/**
 * Stockholm Events Scraper
 * Fetches cultural events from multiple Stockholm sources and upserts into Supabase.
 *
 * Sources (no API key required):
 *   - Resident Advisor (club/electronic music)
 *   - Sveriges Radio Open API (broadcaster events)
 *   - Nationalmuseum (exhibitions)
 *   - Kulturhuset Stadsteatern (theatre/culture)
 *   - Luger.se (concerts & music promoter)
 *   - Nalen (live music venue)
 *   - Fotografiska Stockholm (photography exhibitions)
 *   - Södra Teatern (theatre & music)
 *   - Berns (classic music venue)
 *   - Fasching (jazz club)
 *   - Riche (restaurant jazz/DJs)
 *   - Luma (niche cultural events)
 *   - B-K / Banankompaniet (underground/multicultural)
 *   - DICE.fm (multi-venue)
 *   - Debaser (Södermalm concerts)
 *   - Stampen (daily jazz, Gamla Stan)
 *   - Glenn Miller Café (live jazz, Södermalm)
 *   - Under Bron / Trädgården (electronic/club)
 *   - Hosoi (listening bar, Slakthusområdet)
 *   - Artilleriet (Jazz Tuesdays, Östermalm)
 *   - Winterviken (concerts)
 *   - Färgfabriken (art exhibitions)
 *   - Fallan (concerts, Slakthusområdet)
 *   - Lydmar Hotel (live music, Östermalm)
 *
 * Sources (free API key required — add keys to .env to activate):
 *   - Ticketmaster Discovery API  → TICKETMASTER_API_KEY
 *   - Eventbrite API              → EVENTBRITE_API_KEY
 *
 * Usage:
 *   node backend/scripts/scrape-stockholm-events.js
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env") });

import { supabase } from "../src/supabase.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// Swedish day/month names for parsing locale dates like "Tis 10 Mar" or "Fredag 13/03"
const SWEDISH_MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, maj: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11,
};

function parseSwedishDate(str) {
  if (!str) return null;
  const now = new Date();

  // "Idag" / "Imorgon"
  if (/idag/i.test(str)) return now.toISOString();
  if (/imorgon/i.test(str)) {
    now.setDate(now.getDate() + 1);
    return now.toISOString();
  }

  // "Tis 10 Mar" or "tis 10 mar 2026"
  const m1 = str.match(/(\d{1,2})\s+(jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec)(?:\s+(\d{4}))?/i);
  if (m1) {
    const day = parseInt(m1[1]);
    const month = SWEDISH_MONTHS[m1[2].toLowerCase()];
    const year = m1[3] ? parseInt(m1[3]) : now.getFullYear();
    if (month !== undefined) return new Date(year, month, day).toISOString();
  }

  // "Fredag 13/03" (Swedish day + DD/MM)
  const m2 = str.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (m2) {
    const day = parseInt(m2[1]);
    const month = parseInt(m2[2]) - 1;
    const year = m2[3] ? (m2[3].length === 2 ? 2000 + parseInt(m2[3]) : parseInt(m2[3])) : now.getFullYear();
    return new Date(year, month, day).toISOString();
  }

  // "Sun 8 Mar 13-16" or "Mon 10 Mar"
  const m3 = str.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:\s+(\d{1,2})[-–](\d{1,2}))?/i);
  if (m3) {
    const day = parseInt(m3[1]);
    const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const month = months[m3[2].toLowerCase()];
    const d = new Date(now.getFullYear(), month, day);
    if (m3[3]) d.setHours(parseInt(m3[3]), 0, 0, 0);
    return d.toISOString();
  }

  // Fallback to standard parseDate
  return parseDate(str);
}

// ---------------------------------------------------------------------------
// Generic scraper — works with DB-configured sources
// Strategies: "auto" (JSON-LD first, then CSS), "json_ld", "css"
// ---------------------------------------------------------------------------
async function scrapeGenericSource(source) {
  const events = [];
  const { scrape_url, source_key, location, category, strategy, link_selector, image_attr } = source;

  const html = await fetchHtml(scrape_url);
  const $ = cheerio.load(html);
  const baseUrl = new URL(scrape_url).origin;

  function resolveUrl(href) {
    if (!href) return null;
    return href.startsWith("http") ? href : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
  }

  function getImage(el) {
    const $img = $(el).find("img").first();
    if (!$img.length) return null;
    // Try custom image_attr first, then common lazy-load attrs, then src
    const attrs = [image_attr, "data-lazy-src", "data-src", "src"].filter(Boolean);
    for (const attr of attrs) {
      const val = $img.attr(attr);
      if (val && !val.startsWith("data:")) return resolveUrl(val);
    }
    return null;
  }

  // --- Strategy: JSON-LD ---
  function tryJsonLd() {
    const found = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        // Handle ItemList (like Södra Teatern)
        const listItems = parsed?.itemListElement || [];
        for (const entry of listItems) {
          const item = entry?.item;
          if (item?.["@type"] === "Event" && item?.name) {
            found.push({
              title: cheerio.load(item.name, null, false).text(),
              description: item.description?.slice(0, 500) || null,
              image_url: item.image || null,
              starts_at: parseDate(item.startDate),
              ends_at: parseDate(item.endDate),
              url: item.url || null,
            });
          }
        }
        // Handle direct Event objects or arrays
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if ((item["@type"] === "Event" || item["@type"] === "MusicEvent") && item.name) {
            found.push({
              title: item.name,
              description: item.description?.slice(0, 500) || null,
              image_url: item.image || null,
              starts_at: parseDate(item.startDate),
              ends_at: parseDate(item.endDate),
              url: item.url || null,
            });
          }
        }
      } catch {}
    });
    return found;
  }

  // --- Strategy: CSS selectors ---
  function tryCss() {
    const found = [];
    const seen = new Set();
    // Use custom link_selector or try common patterns
    const selectors = link_selector
      ? [link_selector]
      : ["article", "a[href*='/event']", "a[href*='/kalender']", "a[href*='/konsert']", "[class*='event']", "[class*='card']"];

    for (const sel of selectors) {
      $(sel).each((_, el) => {
        const $el = $(el);
        const href = $el.is("a") ? $el.attr("href") : $el.find("a[href]").first().attr("href");
        const url = resolveUrl(href);
        if (!url || seen.has(url) || url === scrape_url || url === baseUrl + "/") return;
        seen.add(url);

        const title = $el.find("h2, h3, h4, h5, [class*='title']").first().text().trim() ||
                      ($el.is("a") ? $el.text().trim() : null);
        if (!title || title.length < 2) return;

        const imgUrl = getImage(el);
        const dateText = $el.find("time, [class*='date']").first().text().trim() || null;

        found.push({
          title,
          description: null,
          image_url: imgUrl,
          starts_at: dateText ? parseDate(dateText) : null,
          ends_at: null,
          url,
        });
      });
      if (found.length > 0) break; // Use first selector that yields results
    }
    return found;
  }

  // --- Build image map by alt text (for JSON-LD sources where images are separate) ---
  function buildImageMapByAlt() {
    const map = {};
    const imgAttr = image_attr || "data-lazy-src";
    $(`img[${imgAttr}]`).each((_, el) => {
      const $el = $(el);
      const alt = $el.attr("alt")?.trim();
      const val = $el.attr(imgAttr);
      if (alt && val && !val.startsWith("data:")) {
        map[alt] = resolveUrl(val);
      }
    });
    return map;
  }

  // Execute strategy
  let raw = [];
  if (strategy === "json_ld") {
    raw = tryJsonLd();
  } else if (strategy === "css") {
    raw = tryCss();
  } else {
    // auto: try JSON-LD first, fall back to CSS
    raw = tryJsonLd();
    if (raw.length === 0) raw = tryCss();
  }

  // If JSON-LD found events but some are missing images, try matching by alt text
  if (raw.length > 0 && raw.some((e) => !e.image_url)) {
    const imgMap = buildImageMapByAlt();
    if (Object.keys(imgMap).length > 0) {
      for (const ev of raw) {
        if (!ev.image_url && ev.title && imgMap[ev.title]) {
          ev.image_url = imgMap[ev.title];
        }
      }
    }
  }

  // Convert to final format
  for (const ev of raw) {
    events.push({
      title: ev.title,
      description: ev.description,
      image_url: ev.image_url,
      starts_at: ev.starts_at,
      ends_at: ev.ends_at,
      location: location || "Stockholm",
      url: ev.url,
      source: source_key,
      category: category || "culture",
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Scrape all DB-configured sources (non-custom ones)
// Custom sources still use their hardcoded scrapers
// ---------------------------------------------------------------------------
const CUSTOM_SOURCES = new Set([
  "resident_advisor", "sveriges_radio", "nationalmuseum", "kulturhuset",
  "luger", "nalen", "fotografiska", "sodra_teatern", "berns", "fasching",
  "riche", "luma", "bk_banankompaniet", "debaser", "stampen", "glenn_miller",
  "under_bron", "hosoi", "artilleriet", "winterviken", "fargfabriken",
  "fallan", "lydmar", "ticketmaster", "eventbrite",
]);

async function scrapeDbSources() {
  console.log("🗄️  Scraping DB-configured sources...");
  let total = 0;
  try {
    const { data: sources, error } = await supabase
      .from("scrape_sources")
      .select("*")
      .eq("enabled", true);

    if (error) {
      console.warn("  ⚠️  Could not load scrape_sources table:", error.message);
      return [];
    }

    // Only scrape non-custom sources (the ones added via UI)
    const genericSources = (sources || []).filter((s) => !CUSTOM_SOURCES.has(s.source_key));
    if (genericSources.length === 0) {
      console.log("  ℹ️  No additional DB sources to scrape");
      return [];
    }

    const allEvents = [];
    const results = await Promise.allSettled(
      genericSources.map(async (source) => {
        try {
          const events = await scrapeGenericSource(source);
          console.log(`  ✅ ${source.name}: ${events.length} events`);
          // Update last_scraped_at and last_event_count
          await supabase
            .from("scrape_sources")
            .update({ last_scraped_at: new Date().toISOString(), last_event_count: events.length })
            .eq("id", source.id);
          return events;
        } catch (err) {
          console.error(`  ❌ ${source.name} error:`, err.message);
          return [];
        }
      })
    );

    const events = results.flatMap((r) => r.value || []);
    console.log(`  📊 DB sources total: ${events.length} events from ${genericSources.length} sources`);
    return events;
  } catch (err) {
    console.error("  ❌ DB sources error:", err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Source: Resident Advisor — Stockholm club/electronic events
// Parses __NEXT_DATA__ JSON embedded in the SSR page.
// ---------------------------------------------------------------------------
async function scrapeResidentAdvisor() {
  console.log("🎧 Scraping Resident Advisor...");
  const events = [];
  try {
    const html = await fetchHtml("https://ra.co/events/se/stockholm");
    const $ = cheerio.load(html);
    const raw = $("#__NEXT_DATA__").text();
    if (!raw) {
      console.warn("  ⚠️  RA: __NEXT_DATA__ not found");
      return events;
    }
    const json = JSON.parse(raw);
    const listing =
      json?.props?.pageProps?.listing?.events ||
      json?.props?.pageProps?.data?.listing?.events ||
      [];

    for (const ev of listing) {
      events.push({
        title: ev.title || ev.name || null,
        description: ev.blurb || ev.content?.text || null,
        image_url: ev.images?.[0]?.filename || ev.flyerFront || null,
        starts_at: parseDate(ev.startTime || ev.date),
        ends_at: parseDate(ev.endTime),
        location: ev.venue?.name
          ? `${ev.venue.name}, ${ev.venue.area?.name || "Stockholm"}`
          : "Stockholm",
        url: ev.id ? `https://ra.co/events/${ev.id}` : null,
        source: "resident_advisor",
        category: "club",
      });
    }
    console.log(`  ✅ RA: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ RA error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Sveriges Radio Open API — free, no key needed
// ---------------------------------------------------------------------------
async function scrapesverigesRadio() {
  console.log("📻 Fetching Sveriges Radio events...");
  const events = [];
  try {
    // SR API: fetch upcoming events in Stockholm (location id 105 = Stockholm)
    const data = await fetchJson(
      "https://api.sr.se/api/v2/events?pagination=false&format=json&locationid=105&size=50"
    );
    const items = data?.events || [];
    for (const ev of items) {
      events.push({
        title: ev.name || null,
        description: ev.description || null,
        image_url: ev.imageurl || null,
        starts_at: parseDate(ev.startdatetime),
        ends_at: parseDate(ev.enddatetime),
        location: ev.location?.name || "Stockholm",
        url: ev.socialmediaurl || ev.url || null,
        source: "sveriges_radio",
        category: "culture",
      });
    }
    console.log(`  ✅ SR: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ SR error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Nationalmuseum Stockholm — exhibitions
// ---------------------------------------------------------------------------
async function scrapeNationalmuseum() {
  console.log("🖼️  Scraping Nationalmuseum...");
  const events = [];
  try {
    const html = await fetchHtml(
      "https://www.nationalmuseum.se/utstallningar/"
    );
    const $ = cheerio.load(html);

    // Nationalmuseum: image and title are in SEPARATE <a> tags pointing to the same URL
    // Images are in <picture> parents (not inside <a> tags)
    // Group by URL and merge image from img-anchor, title from text-anchor
    const byUrl = {};
    $('a[href*="/utst"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      if (!href) return;
      const url = href.startsWith("http") ? href : `https://www.nationalmuseum.se${href}`;
      // Skip the main "/utstallningar" page link
      if (url === "https://www.nationalmuseum.se/utställningar" || url === "https://www.nationalmuseum.se/utstallningar/") return;
      if (!byUrl[url]) byUrl[url] = { titles: [], imgs: [] };

      // Check for image
      const $img = $el.find("img").first();
      if ($img.length) {
        const src = $img.attr("src") || $img.attr("data-src") || null;
        if (src) byUrl[url].imgs.push(src.startsWith("http") ? src : `https://www.nationalmuseum.se${src}`);
      }

      // Check for text content (title)
      const text = $el.text().trim();
      if (text && text.length > 2) byUrl[url].titles.push(text);
    });

    // Also try to match images by looking at <picture> or <img> elements near exhibition links
    // Images might be in adjacent elements, matched by position
    const allImages = [];
    $("picture img, img[src*='imager']").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (src && !src.startsWith("data:")) {
        allImages.push(src.startsWith("http") ? src : `https://www.nationalmuseum.se${src}`);
      }
    });

    const urls = Object.keys(byUrl);
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const data = byUrl[url];
      const title = data.titles[0] || null;
      if (!title || title.length < 2) continue;

      // Try to get image from anchor or from positional match
      const imageUrl = data.imgs[0] || allImages[i] || null;

      events.push({
        title,
        description: null,
        image_url: imageUrl || null,
        starts_at: null,
        ends_at: null,
        location: "Nationalmuseum, Stockholm",
        url,
        source: "nationalmuseum",
        category: "exhibition",
      });
    }
    console.log(`  ✅ Nationalmuseum: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Nationalmuseum error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Kulturhuset Stadsteatern — theatre/culture
// ---------------------------------------------------------------------------
async function scrapeKulturhuset() {
  console.log("🎭 Scraping Kulturhuset Stadsteatern...");
  const events = [];
  try {
    const html = await fetchHtml(
      "https://kulturhusetstadsteatern.se/program/"
    );
    const $ = cheerio.load(html);

    $("article, .event, [class*='event'], [class*='card']").each((_, el) => {
      const $el = $(el);
      const title =
        $el.find("h2, h3, h4, .title, [class*='title']").first().text().trim() || null;
      const description =
        $el.find("p, .description, .preamble, [class*='preamble']").first().text().trim() || null;
      const href = $el.find("a[href]").first().attr("href") || null;
      const img =
        $el.find("img").first().attr("src") ||
        $el.find("img").first().attr("data-src") ||
        null;
      const dateText = $el.find("time, .date, [class*='date']").first().text().trim();

      if (!title) return;

      const url = href
        ? href.startsWith("http")
          ? href
          : `https://kulturhusetstadsteatern.se${href}`
        : null;
      const imageUrl =
        img && !img.startsWith("http")
          ? `https://kulturhusetstadsteatern.se${img}`
          : img;

      events.push({
        title,
        description: description || null,
        image_url: imageUrl || null,
        starts_at: dateText ? parseDate(dateText) : null,
        ends_at: null,
        location: "Kulturhuset Stadsteatern, Stockholm",
        url,
        source: "kulturhuset",
        category: "culture",
      });
    });
    console.log(`  ✅ Kulturhuset: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Kulturhuset error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Luger.se — Major Stockholm concert promoter
// Static WordPress HTML — .post-item.concert structure
// ---------------------------------------------------------------------------
async function scrapeLuger() {
  console.log("🎸 Scraping Luger.se...");
  const events = [];
  try {
    const html = await fetchHtml("https://luger.se/konserter/");
    const $ = cheerio.load(html);

    $(".post-item").each((_, el) => {
      const $el = $(el);
      const title = $el.find(".post-item__title a").first().text().trim() || null;
      const href = $el.find(".post-item__title a").first().attr("href") ||
                   $el.find("a[href*='luger.se']").first().attr("href") || null;
      const $img = $el.find(".post-image-holder img, .itc-image-holder img").first();
      const img = $img.attr("data-lazy-src") || $img.attr("data-src") || $img.attr("srcset")?.split(" ")[0] || $img.attr("src") || null;
      const dateText = $el.find(".post-item__item-date").first().text().trim() || null;
      const venue = $el.find(".post-item__item-term-venue").first().text().trim() || "";
      const city = $el.find(".post-item__item-term-city").first().text().trim() || "";

      if (!title) return;

      const location = [venue, city].filter(Boolean).join(", ") || "Stockholm";
      const url = href
        ? href.startsWith("http") ? href : `https://luger.se${href}`
        : null;

      events.push({
        title,
        description: null,
        image_url: img && !img.startsWith("data:") ? img : null,
        starts_at: dateText ? (parseDate(dateText) || parseSwedishDate(dateText)) : null,
        ends_at: null,
        location,
        url,
        source: "luger",
        category: "music",
      });
    });
    console.log(`  ✅ Luger: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Luger error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Nalen — Classic Stockholm music venue
// Next.js/Storyblok SSR — parse JSON props from <script> tag
// ---------------------------------------------------------------------------
async function scrapeNalen() {
  console.log("🎶 Scraping Nalen...");
  const events = [];
  try {
    const html = await fetchHtml("https://nalen.com/sv/konserter");
    const $ = cheerio.load(html);

    // Nalen uses Next.js with Storyblok — data lives in a script tag
    let jsonData = null;
    $("script").each((_, el) => {
      const content = $(el).html() || "";
      if (content.includes('"artistCard"') || content.includes('"artistName"') || content.includes('"pageProps"')) {
        try {
          const match = content.match(/^\s*(\{.*\})\s*$/s) ||
                        content.match(/self\.__next_f\.push\(\[1,"(.+)"\]\)/) ||
                        null;
          if (match) {
            const raw = match[1] ? JSON.parse(`"${match[1]}"`) : match[0];
            jsonData = JSON.parse(raw);
          }
        } catch {}
      }
    });

    // Also try __NEXT_DATA__
    const nextData = $("#__NEXT_DATA__").text();
    if (nextData) {
      try {
        jsonData = JSON.parse(nextData);
      } catch {}
    }

    if (jsonData) {
      // Walk the JSON looking for artistCard blocks
      const str = JSON.stringify(jsonData);
      const matches = [...str.matchAll(/"artistName":"([^"]+)","startDate":"([^"]+)"/g)];
      for (const m of matches) {
        events.push({
          title: m[1],
          description: null,
          image_url: null,
          starts_at: parseDate(m[2]),
          ends_at: null,
          location: "Nalen, Stockholm",
          url: `https://nalen.com/sv/konserter`,
          source: "nalen",
          category: "music",
        });
      }
    }

    // Fallback: cheerio scrape for basic event cards
    if (events.length === 0) {
      $("a[href*='/konsert/'], a[href*='/konserter/']").each((_, el) => {
        const $el = $(el);
        const title = $el.find("h2, h3, [class*='title'], [class*='artist']").first().text().trim() ||
                      $el.text().trim();
        const href = $el.attr("href");
        const img = $el.find("img").first().attr("src") || null;
        if (!title || title.length < 2) return;
        const url = href ? (href.startsWith("http") ? href : `https://nalen.com${href}`) : null;
        events.push({
          title,
          description: null,
          image_url: img,
          starts_at: null,
          ends_at: null,
          location: "Nalen, Stockholm",
          url,
          source: "nalen",
          category: "music",
        });
      });
    }

    console.log(`  ✅ Nalen: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Nalen error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Fotografiska Stockholm — Photography museum & exhibitions
// Next.js SSR — parse __NEXT_DATA__ or scrape exhibition links
// ---------------------------------------------------------------------------
async function scrapeForografiska() {
  console.log("📷 Scraping Fotografiska...");
  const events = [];
  try {
    const html = await fetchHtml("https://stockholm.fotografiska.com/sv/utstallningar/");
    const $ = cheerio.load(html);

    // Try __NEXT_DATA__
    const nextData = $("#__NEXT_DATA__").text();
    if (nextData) {
      try {
        const json = JSON.parse(nextData);
        const str = JSON.stringify(json);
        // Extract exhibition entries — look for title + image pattern
        const exhibitions = json?.props?.pageProps?.exhibitions ||
                            json?.props?.pageProps?.data?.exhibitions || [];
        for (const ex of exhibitions) {
          events.push({
            title: ex.title || ex.name || null,
            description: ex.description || ex.intro || null,
            image_url: ex.image?.url || ex.coverImage?.url || null,
            starts_at: parseDate(ex.startDate || ex.from),
            ends_at: parseDate(ex.endDate || ex.to),
            location: "Fotografiska, Stockholm",
            url: ex.slug ? `https://stockholm.fotografiska.com/sv/exhibitions/${ex.slug}` : null,
            source: "fotografiska",
            category: "exhibition",
          });
        }
      } catch {}
    }

    // Fallback: scrape links with /sv/exhibitions/ pattern
    if (events.length === 0) {
      $("a[href*='/sv/exhibitions/'], a[href*='/exhibitions/']").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        const img = $el.find("img").first().attr("src") ||
                    $el.find("img").first().attr("data-src") || null;
        const title = $el.find("h1, h2, h3, p").first().text().trim() ||
                      $el.attr("aria-label") || null;
        if (!title || !href || href.includes("undefined")) return;
        const url = href.startsWith("http") ? href : `https://stockholm.fotografiska.com${href}`;
        events.push({
          title,
          description: null,
          image_url: img,
          starts_at: null,
          ends_at: null,
          location: "Fotografiska, Stockholm",
          url,
          source: "fotografiska",
          category: "exhibition",
        });
      });
    }

    console.log(`  ✅ Fotografiska: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Fotografiska error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Södra Teatern — Theatre & live music
// Uses JSON-LD ItemList for title/url/date, then matches images from HTML
// Images use data-lazy-src (lazy loading) — src is just a placeholder SVG
// ---------------------------------------------------------------------------
async function scrapeSodraTeatern() {
  console.log("🎭 Scraping Södra Teatern...");
  const events = [];
  try {
    const html = await fetchHtml("https://sodrateatern.com/pa-scen/");
    const $ = cheerio.load(html);

    // 1. Parse JSON-LD for structured event data (name, url, startDate)
    const jsonLdEvents = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        const items = parsed?.itemListElement || [];
        for (const entry of items) {
          const item = entry?.item;
          if (item?.["@type"] === "Event" && item?.name) {
            jsonLdEvents.push({
              name: item.name,
              url: item.url || null,
              startDate: item.startDate || null,
            });
          }
        }
      } catch {}
    });

    // 2. Build a map of event name → image URL
    //    Images are inside <picture> tags (not inside the <a> links),
    //    but the img alt matches the event title. Use data-lazy-src for real URL.
    const imageByName = {};
    $("img[data-lazy-src]").each((_, el) => {
      const $el = $(el);
      const alt = $el.attr("alt")?.trim();
      const imageUrl = $el.attr("data-lazy-src");
      if (alt && imageUrl && imageUrl.includes("eventadmin.stockholmlive.com")) {
        imageByName[alt] = imageUrl;
      }
    });

    // 3. If JSON-LD found events, use those as the primary source
    if (jsonLdEvents.length > 0) {
      for (const ev of jsonLdEvents) {
        // JSON-LD names may have HTML entities (e.g. &#8211;), decode them
        const decodedName = cheerio.load(ev.name, null, false).text();
        const url = ev.url || null;
        events.push({
          title: decodedName,
          description: null,
          image_url: imageByName[decodedName] || null,
          starts_at: parseDate(ev.startDate),
          ends_at: null,
          location: "Södra Teatern, Stockholm",
          url,
          source: "sodra_teatern",
          category: "culture",
        });
      }
    } else {
      // Fallback: scrape cards directly if no JSON-LD
      const seen = new Set();
      $('a[href*="/evenemang/"]').each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        if (!href) return;
        const url = href.startsWith("http") ? href : `https://sodrateatern.com${href}`;
        if (seen.has(url)) return;
        seen.add(url);

        const title = $el.find("h3").first().text().trim() || null;
        if (!title) return;

        const img = $el.find("img").first();
        const imageUrl = img.attr("data-lazy-src") || img.attr("data-src") || img.attr("src") || null;

        events.push({
          title,
          description: null,
          image_url: imageUrl && !imageUrl.startsWith("data:") ? imageUrl : null,
          starts_at: null,
          ends_at: null,
          location: "Södra Teatern, Stockholm",
          url,
          source: "sodra_teatern",
          category: "culture",
        });
      });
    }

    console.log(`  ✅ Södra Teatern: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Södra Teatern error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Berns — Iconic Stockholm music & nightlife venue
// ---------------------------------------------------------------------------
async function scrapeBerns() {
  console.log("✨ Scraping Berns...");
  const events = [];
  try {
    const html = await fetchHtml("https://berns.se/calendar/");
    const $ = cheerio.load(html);
    const seen = new Set();

    // Berns uses .calender-item divs, each containing:
    // - <a> with <img> (image link)
    // - <div> with date text + "Explore" link
    // h5 titles are rendered separately above the calendar grid
    $(".calender-item").each((_, el) => {
      const $el = $(el);
      const $imgLink = $el.find("a[href*='/calendar/']").first();
      const href = $imgLink.attr("href");
      if (!href || href === "/calendar/" || href === "/calendar") return;

      const url = href.startsWith("http") ? href : `https://berns.se${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      // Image from the anchor
      const $img = $imgLink.find("img").first();
      const img = $img.attr("src") || $img.attr("srcset")?.split(" ")[0] || null;

      // Date from text in sibling div
      const divText = $el.find("div").text().trim();
      const dateMatch = divText.match(/(\d{1,2}\s+\w+\s+\d{4})/);
      const dateText = dateMatch ? dateMatch[1] : null;

      // Title: derive from URL slug as fallback
      const slug = href.replace(/.*\/calendar\//, "").replace(/\/$/, "");
      const titleFromSlug = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

      events.push({
        title: titleFromSlug,
        description: null,
        image_url: img && !img.startsWith("data:") ? img : null,
        starts_at: dateText ? (parseDate(dateText) || parseSwedishDate(dateText)) : null,
        ends_at: null,
        location: "Berns, Stockholm",
        url,
        source: "berns",
        category: "music",
      });
    });

    // Match h5 titles to events by order (h5s appear in same order as calendar items)
    const h5Titles = [];
    $("h5").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length >= 2) h5Titles.push(text);
    });
    events.forEach((ev, i) => {
      if (h5Titles[i]) ev.title = h5Titles[i];
    });
    console.log(`  ✅ Berns: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Berns error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Fasching — Scandinavia's largest jazz club (via WP REST API)
// ---------------------------------------------------------------------------
async function scrapeFasching() {
  console.log("🎷 Scraping Fasching...");
  const events = [];
  try {
    // Fasching runs WordPress — use the REST API for reliable structured data
    const apiBase = "https://www.fasching.se/wp-json/wp/v2/posts";
    const perPage = 50;
    let page = 1;
    let allPosts = [];

    // Fetch English posts (lang=en), paginate to get all upcoming events
    while (page <= 3) {
      const url = `${apiBase}?per_page=${perPage}&page=${page}&lang=en&_fields=id,title,link,excerpt,featured_media,meta,slug`;
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124", Accept: "application/json" },
      });
      if (!res.ok) break;
      const posts = await res.json();
      if (!posts.length) break;
      allPosts = allPosts.concat(posts);
      const totalPages = parseInt(res.headers.get("x-wp-totalpages") || "1");
      if (page >= totalPages) break;
      page++;
    }

    // Build a media ID -> URL cache to batch-resolve featured images
    const mediaIds = [...new Set(allPosts.map(p => p.featured_media).filter(Boolean))];
    const mediaMap = {};
    // Fetch media in batches of 50
    for (let i = 0; i < mediaIds.length; i += 50) {
      const batch = mediaIds.slice(i, i + 50);
      const mRes = await fetch(`https://www.fasching.se/wp-json/wp/v2/media?include=${batch.join(",")}&per_page=50&_fields=id,source_url`, {
        headers: { "User-Agent": "Mozilla/5.0 Chrome/124", Accept: "application/json" },
      });
      if (mRes.ok) {
        const mediaItems = await mRes.json();
        for (const m of mediaItems) mediaMap[m.id] = m.source_url;
      }
    }

    const now = new Date();
    for (const post of allPosts) {
      const title = post.title?.rendered?.replace(/&#8217;/g, "'").replace(/&#8211;/g, "–").replace(/&amp;/g, "&").trim();
      if (!title || title.length < 2) continue;

      const desc = post.excerpt?.rendered?.replace(/<[^>]+>/g, "").replace(/&#8217;/g, "'").replace(/&amp;/g, "&").trim() || null;
      const image_url = mediaMap[post.featured_media] || null;

      // Parse date from meta field dates_0_date_time (format: "2026-05-31 20:00:00")
      let starts_at = null;
      const dateStr = post.meta?.dates_0_date_time;
      if (dateStr) {
        starts_at = parseDate(dateStr.replace(" ", "T"));
      }

      // Skip events in the past
      if (starts_at && new Date(starts_at) < now) continue;

      events.push({
        title,
        description: desc?.slice(0, 500) || null,
        image_url,
        starts_at,
        ends_at: null,
        location: "Fasching, Stockholm",
        url: post.link,
        source: "fasching",
        category: "music",
      });
    }
    console.log(`  ✅ Fasching: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Fasching error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Riche — Stockholm restaurant/bar with live music, DJs, jazz
// Two locations: Riche Östermalm (kalendarium) + Riche Fenix (Södermalm)
// ---------------------------------------------------------------------------
async function scrapeRiche() {
  console.log("🍸 Scraping Riche...");
  const events = [];
  const urls = [
    { url: "https://riche.se/kalendarium/", venue: "Riche, Östermalm" },
    { url: "https://riche.se/fenix/events/", venue: "Riche Fenix, Södermalm" },
  ];

  for (const { url: pageUrl, venue } of urls) {
    try {
      const html = await fetchHtml(pageUrl);
      const $ = cheerio.load(html);
      const seen = new Set();

      // Riche uses .event-N classes with h6 for titles, a[href*='/events/'] for links
      // Filter out category/venue labels ("Vad:", "Var:")
      $("[class*='event-']").each((_, el) => {
        const $el = $(el);
        const className = $el.attr("class") || "";
        // Skip if not an event card (e.g. event-types, event-locations)
        if (!className.match(/event-\d/)) return;

        const title = $el.find("h6, h5, h4").first().text().trim() || null;
        if (!title || title.length < 2) return;
        // Skip filter labels
        if (/^(Vad|Var|What|Where):/i.test(title)) return;

        const href = $el.find("a[href*='/events/']").first().attr("href") || null;
        const fullUrl = href ? (href.startsWith("http") ? href : `https://riche.se${href}`) : pageUrl;
        if (seen.has(fullUrl)) return;
        seen.add(fullUrl);

        const $img = $el.find("img").first();
        const img = $img.attr("src") || $img.attr("data-src") || null;

        // Parse Swedish date like "Fredag 13/03" or "13/03"
        const cardText = $el.text();
        const dateMatch = cardText.match(/(\d{1,2})\/(\d{1,2})/);
        let starts_at = null;
        if (dateMatch) {
          const day = parseInt(dateMatch[1]);
          const month = parseInt(dateMatch[2]) - 1;
          starts_at = new Date(new Date().getFullYear(), month, day).toISOString();
        }

        events.push({
          title,
          description: null,
          image_url: img && !img.startsWith("data:") ? img : null,
          starts_at,
          ends_at: null,
          location: `${venue}, Stockholm`,
          url: fullUrl,
          source: "riche",
          category: "music",
        });
      });
    } catch (err) {
      console.error(`  ⚠️  Riche (${venue}) error:`, err.message);
    }
  }
  console.log(`  ✅ Riche: ${events.length} events`);
  return events;
}

// ---------------------------------------------------------------------------
// Source: Luma (lu.ma/stockholm) — Niche cultural events, underground gatherings
// Next.js SSR — parse __NEXT_DATA__ at props.pageProps.initialData.data.events
// ---------------------------------------------------------------------------
async function scrapeLuma() {
  console.log("🌐 Scraping Luma Stockholm...");
  const events = [];
  try {
    const html = await fetchHtml("https://luma.com/stockholm");
    const $ = cheerio.load(html);
    const raw = $("#__NEXT_DATA__").text();
    if (!raw) {
      console.warn("  ⚠️  Luma: __NEXT_DATA__ not found");
      return events;
    }
    const json = JSON.parse(raw);
    const items =
      json?.props?.pageProps?.initialData?.data?.events ||
      json?.props?.pageProps?.initialData?.events ||
      [];

    for (const entry of items) {
      const ev = entry?.event || entry;
      if (!ev?.name) continue;
      const slug = ev.url || ev.api_id;
      events.push({
        title: ev.name,
        description: ev.description || null,
        image_url: ev.cover_url || null,
        starts_at: parseDate(ev.start_at),
        ends_at: parseDate(ev.end_at),
        location: ev.geo_address_info?.address || ev.location || "Stockholm",
        url: slug ? `https://lu.ma/${slug}` : null,
        source: "luma",
        category: "culture",
      });
    }
    console.log(`  ✅ Luma: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Luma error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: B-K / Banankompaniet — Underground & multicultural Stockholm venue
// Webflow site — scrape a[href*="/whats-on/"] cards
// ---------------------------------------------------------------------------
async function scrapeBK() {
  console.log("🍌 Scraping B-K (Banankompaniet)...");
  const events = [];
  try {
    const html = await fetchHtml("https://www.b-k.se/whats-on");
    const $ = cheerio.load(html);
    const seen = new Set();

    $("a[href*='/whats-on/']").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      if (!href || href === "/whats-on" || href === "/whats-on/") return;

      const url = href.startsWith("http") ? href : `https://www.b-k.se${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      const img =
        $el.find("img").first().attr("src") ||
        $el.find("img").first().attr("data-src") ||
        $el.find("[style*='background']").first().attr("src") ||
        null;

      const title =
        $el.find("h1, h2, h3, h4, [class*='title'], [class*='heading'], [class*='name']").first().text().trim() ||
        $el.find("div, p").first().text().trim() ||
        null;

      // Dates appear as plain text "Mar 20, 2026" in the card
      const cardText = $el.text();
      const dateMatch = cardText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})/i);
      const starts_at = dateMatch ? parseDate(`${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`) : null;

      if (!title || title.length < 2) return;

      events.push({
        title,
        description: null,
        image_url: img && !img.startsWith("data:") ? img : null,
        starts_at,
        ends_at: null,
        location: "B-K (Banankompaniet), Stockholm",
        url,
        source: "bk_banankompaniet",
        category: "music",
      });
    });
    console.log(`  ✅ B-K: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ B-K error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: DICE.fm — Stockholm venue pages
// Next.js SSR — parse __NEXT_DATA__ at props.pageProps.profile.sections[].events
// Add more venue slugs to DICE_VENUES to expand coverage
// ---------------------------------------------------------------------------
const DICE_VENUES = [
  { slug: "under-bron-5plw", name: "Under Bron / Trädgården" },
  { slug: "debaser-strand-n4dr", name: "Debaser Strand" },
  { slug: "nalen-p34q", name: "Nalen" },
  { slug: "berns-salonger-r3rq", name: "Berns" },
  { slug: "sodra-teatern-k3rm", name: "Södra Teatern" },
  { slug: "slaktkyrkan-m3pk", name: "Slaktkyrkan" },
];

async function scrapeDiceVenue(slug, venueName) {
  const events = [];
  try {
    const html = await fetchHtml(`https://dice.fm/venue/${slug}`);
    const $ = cheerio.load(html);
    const raw = $("#__NEXT_DATA__").text();
    if (!raw) return events;

    const json = JSON.parse(raw);
    const sections = json?.props?.pageProps?.profile?.sections || [];
    for (const section of sections) {
      for (const ev of section?.events || []) {
        if (!ev?.name) continue;
        events.push({
          title: ev.name,
          description: ev.description || null,
          image_url: ev.image_url || ev.artwork_url || null,
          starts_at: parseDate(ev.date || ev.start_at),
          ends_at: null,
          location: `${venueName}, Stockholm`,
          url: ev.slug ? `https://dice.fm/event/${ev.slug}` : `https://dice.fm/venue/${slug}`,
          source: "dice",
          category: "music",
        });
      }
    }
  } catch (err) {
    // Silently skip venues that 404 or block
  }
  return events;
}

async function scrapeDice() {
  console.log("🎲 Scraping DICE.fm Stockholm venues...");
  const results = await Promise.allSettled(
    DICE_VENUES.map((v) => scrapeDiceVenue(v.slug, v.name))
  );
  const events = results.flatMap((r) => r.value || []);
  console.log(`  ✅ DICE: ${events.length} events across ${DICE_VENUES.length} venues`);
  return events;
}

// ---------------------------------------------------------------------------
// Source: Debaser — Södermalm daily concerts & club nights
// Webflow CMS renders images client-side, so we fetch each event page
// for og:image or Tickster preview images
// ---------------------------------------------------------------------------
// Parse Debaser card text like "10Mar2026Tue" or "10 Mar 2026 Tue" into a Date
function parseDebaserDate(text) {
  if (!text) return null;
  // Webflow strips spaces: "10Mar2026Tue" or with spaces "10 Mar 2026 Tue"
  const m = text.match(/(\d{1,2})\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s*(\d{4})/i);
  if (!m) return null;
  const [, day, mon, year] = m;
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const monthIdx = months[mon.toLowerCase()];
  if (monthIdx === undefined) return null;
  return new Date(parseInt(year), monthIdx, parseInt(day));
}

// Fetch title, image + door time from individual Debaser event page
async function scrapeDebaserEventPage(eventUrl) {
  try {
    const html = await fetchHtml(eventUrl);
    const $ = cheerio.load(html);
    const result = { title: null, image_url: null, doorTime: null };

    // --- Title: use og:title or h1 ---
    const ogTitle = $('meta[property="og:title"]').attr("content");
    if (ogTitle) {
      // Clean "Artist — Debaser" suffix
      result.title = ogTitle.replace(/\s*[–—-]\s*Debaser.*$/i, "").trim();
    }
    if (!result.title) {
      result.title = $("h1").first().text().trim() || null;
    }

    // --- Image ---
    const ogImage = $('meta[property="og:image"]').attr("content");
    if (ogImage && !ogImage.includes("spacer") && !ogImage.includes("logo")) {
      result.image_url = ogImage;
    } else {
      const twImage = $('meta[name="twitter:image"]').attr("content");
      if (twImage && !twImage.includes("spacer") && !twImage.includes("logo")) {
        result.image_url = twImage;
      } else {
        const ticksterImg = $('img[src*="tickster"]').first().attr("src");
        if (ticksterImg) {
          result.image_url = ticksterImg;
        } else {
          $("img[src*='website-files.com']").each((_, el) => {
            const src = $(el).attr("src") || "";
            if (src.includes("spacer") || src.includes("logo") || src.includes("icon") || src.includes(".svg")) return;
            if (src.includes("63e0d110d5cae55046cda4f6")) {
              result.image_url = src;
              return false;
            }
          });
        }
      }
    }

    // --- Door time: look for "Dörrar HH.MM" or "Dörrar HH:MM" ---
    const bodyText = $("body").text();
    const doorMatch = bodyText.match(/[Dd]örrar\s+(\d{1,2})[.:](\d{2})/);
    if (doorMatch) {
      result.doorTime = `${doorMatch[1].padStart(2, "0")}:${doorMatch[2]}`;
    }

    return result;
  } catch {
    return { title: null, image_url: null, doorTime: null };
  }
}

async function scrapeDebaser() {
  console.log("🎸 Scraping Debaser...");
  const events = [];
  try {
    const html = await fetchHtml("https://debaser.se/kalender/");
    const $ = cheerio.load(html);
    const seen = new Set();

    // Debaser uses .collection-item-20 cards with links to /events/[slug]
    // Try both selectors
    const eventEls = $(".collection-item-20").length ? $(".collection-item-20") : $("a[href*='/events/']");
    eventEls.each((_, el) => {
      const $el = $(el);
      const $link = $el.is("a") ? $el : $el.find("a[href*='/events/']").first();
      const href = $link.attr("href");
      if (!href || href === "/events/" || href === "/events") return;

      const url = href.startsWith("http") ? href : `https://debaser.se${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      // The h3 is a month header ("March") — the actual artist name is in the last link with text
      const links = $el.find("a[href*='/events/']");
      let title = null;
      // Find the link with the cleanest artist name (shortest non-empty text, usually the 3rd link)
      links.each((_, a) => {
        const text = $(a).text().trim();
        if (text && text.length > 2 && text.length < 200 && !text.match(/^\d{2}\w{3}\d{4}/)) {
          // Prefer shorter text (cleaner name) over longer (which includes date+metadata)
          if (!title || text.length < title.length) title = text;
        }
      });
      if (!title || title.length < 2) return;

      const cardText = $el.text();
      const venue = cardText.includes("Strand") ? "Debaser Strand" : "Debaser Nova";

      // Parse date from card text — Webflow renders "10Mar2026Tue" without spaces
      const dateObj = parseDebaserDate(cardText);

      events.push({
        title,
        description: null,
        image_url: null, // Will be backfilled below
        starts_at: null, // Will be set after fetching door times
        ends_at: null,
        _dateObj: dateObj, // Temp: calendar date without time
        location: `${venue}, Södermalm, Stockholm`,
        url,
        source: "debaser",
        category: "music",
      });
    });

    // Batch-fetch images + door times from individual event pages
    if (events.length > 0) {
      console.log(`  🖼️  Debaser: fetching images & times for ${events.length} events...`);
      const BATCH = 10;
      for (let i = 0; i < events.length; i += BATCH) {
        const batch = events.slice(i, i + BATCH);
        const results = await Promise.allSettled(
          batch.map((ev) => scrapeDebaserEventPage(ev.url))
        );
        results.forEach((result, idx) => {
          const { title, image_url, doorTime } = result.value || {};
          if (title) batch[idx].title = title;
          if (image_url) batch[idx].image_url = image_url;
          // Combine calendar date + door time
          const dateObj = batch[idx]._dateObj;
          if (dateObj && doorTime) {
            const [h, m] = doorTime.split(":").map(Number);
            dateObj.setHours(h, m, 0, 0);
          }
          batch[idx].starts_at = dateObj ? dateObj.toISOString() : null;
          delete batch[idx]._dateObj;
        });
      }
      const withImages = events.filter((e) => e.image_url).length;
      const withDates = events.filter((e) => e.starts_at).length;
      console.log(`  🖼️  Debaser: got images for ${withImages}/${events.length}, dates for ${withDates}/${events.length}`);
    }
    // Clean up any remaining _dateObj
    for (const ev of events) {
      if (ev._dateObj) {
        ev.starts_at = ev._dateObj.toISOString();
        delete ev._dateObj;
      }
    }

    console.log(`  ✅ Debaser: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Debaser error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Stampen — Classic jazz pub, daily live jazz since 1968
// ---------------------------------------------------------------------------
async function scrapeStampen() {
  console.log("🎺 Scraping Stampen...");
  const events = [];
  try {
    const html = await fetchHtml("https://www.stampen.se/program/");
    const $ = cheerio.load(html);
    const seen = new Set();

    // Try JSON-LD first
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        const items = Array.isArray(parsed) ? parsed : parsed?.itemListElement ? parsed.itemListElement.map(i => i.item || i) : [parsed];
        for (const item of items) {
          if (item["@type"] !== "Event" && item["@type"] !== "MusicEvent") continue;
          events.push({
            title: item.name || null,
            description: item.description?.slice(0, 500) || null,
            image_url: item.image || null,
            starts_at: parseDate(item.startDate),
            ends_at: parseDate(item.endDate),
            location: "Stampen, Gamla Stan, Stockholm",
            url: item.url || "https://www.stampen.se/program/",
            source: "stampen",
            category: "music",
          });
        }
      } catch {}
    });

    // Fallback: scrape event cards
    if (events.length === 0) {
      $("article, .event, [class*='event'], [class*='program']").each((_, el) => {
        const $el = $(el);
        const title = $el.find("h2, h3, h4, [class*='title']").first().text().trim() || null;
        const href = $el.find("a[href]").first().attr("href") || null;
        const img = $el.find("img").first().attr("src") || null;
        const dateText = $el.find("time, [class*='date']").first().text().trim() || null;

        if (!title || title.length < 2) return;
        const url = href ? (href.startsWith("http") ? href : `https://www.stampen.se${href}`) : "https://www.stampen.se/program/";
        if (seen.has(url)) return;
        seen.add(url);

        events.push({
          title,
          description: null,
          image_url: img,
          starts_at: dateText ? parseDate(dateText) : null,
          ends_at: null,
          location: "Stampen, Gamla Stan, Stockholm",
          url,
          source: "stampen",
          category: "music",
        });
      });
    }
    console.log(`  ✅ Stampen: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Stampen error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Glenn Miller Café — Live jazz Tue-Sat, Södermalm
// Note: Glenn Miller runs a Wix site that is fully JS-rendered, so cheerio
// cannot extract content. We fetch the HTML and parse any structured data
// we can find (JSON-LD, meta tags, sitemap). As a fallback we generate
// upcoming weekly events since they have live jazz Tue-Sat on a regular
// schedule. All events use the venue photo as image since individual event
// images are not available on their site.
// ---------------------------------------------------------------------------
const GLENN_MILLER_IMAGE = "https://static.wixstatic.com/media/25e6a5_6968546c58a64d9fa7cd0003aa50d77f~mv2.jpg/v1/fill/w_980,h_646,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/25e6a5_6968546c58a64d9fa7cd0003aa50d77f~mv2.jpg";

async function scrapeGlennMiller() {
  console.log("🎷 Scraping Glenn Miller Café...");
  const events = [];
  try {
    // Glenn Miller is a Wix site — JS-rendered, but the Googlebot UA gets
    // server-side rendered rich-text elements with band names and dates.
    const res = await fetch("https://www.glennmillercafe.se/en/konserter", {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        Accept: "text/html",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const $ = cheerio.load(html);

    // Collect all rich-text elements in DOM order.
    // The page lists concerts as pairs: band/lineup text followed by a YYYY-MM-DD date.
    const richTexts = [];
    $("[data-testid=richTextElement]").each((_, el) => {
      richTexts.push($(el).text().trim());
    });

    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const now = new Date();

    for (let i = 1; i < richTexts.length; i++) {
      if (!datePattern.test(richTexts[i])) continue;
      const dateStr = richTexts[i];
      const bandText = richTexts[i - 1];
      if (!bandText || bandText.length < 4 || datePattern.test(bandText)) continue;

      const starts_at = parseDate(`${dateStr}T20:00:00`);
      // Skip past events
      if (starts_at && new Date(starts_at) < now) continue;

      events.push({
        title: bandText.slice(0, 300),
        description: null,
        image_url: GLENN_MILLER_IMAGE,
        starts_at,
        ends_at: null,
        location: "Glenn Miller Café, Södermalm, Stockholm",
        url: `https://glennmillercafe.se/en/konserter/#${dateStr}`,
        source: "glenn_miller",
        category: "music",
      });
    }

    console.log(`  ✅ Glenn Miller: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Glenn Miller error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Under Bron / Trädgården — Electronic music & club events
// ---------------------------------------------------------------------------
async function scrapeUnderBron() {
  console.log("🌉 Scraping Under Bron / Trädgården...");
  const events = [];
  try {
    const html = await fetchHtml("https://event.husetunderbron.se/");
    const $ = cheerio.load(html);
    const seen = new Set();

    // Try JSON-LD
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item["@type"] !== "Event") continue;
          events.push({
            title: item.name || null,
            description: item.description?.slice(0, 500) || null,
            image_url: item.image || null,
            starts_at: parseDate(item.startDate),
            ends_at: parseDate(item.endDate),
            location: "Under Bron / Trädgården, Södermalm, Stockholm",
            url: item.url || "https://event.husetunderbron.se/",
            source: "under_bron",
            category: "club",
          });
        }
      } catch {}
    });

    // Fallback: scrape event links
    if (events.length === 0) {
      $("a[href*='/event'], article, [class*='event']").each((_, el) => {
        const $el = $(el);
        const title = $el.find("h2, h3, h4, [class*='title']").first().text().trim() || null;
        const href = $el.is("a") ? $el.attr("href") : $el.find("a[href]").first().attr("href");
        const img = $el.find("img").first().attr("src") || $el.find("img").first().attr("data-src") || null;

        if (!title || title.length < 2) return;
        const url = href ? (href.startsWith("http") ? href : `https://event.husetunderbron.se${href}`) : null;
        if (!url || seen.has(url)) return;
        seen.add(url);

        events.push({
          title,
          description: null,
          image_url: img,
          starts_at: null,
          ends_at: null,
          location: "Under Bron / Trädgården, Södermalm, Stockholm",
          url,
          source: "under_bron",
          category: "club",
        });
      });
    }
    console.log(`  ✅ Under Bron: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Under Bron error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Hosoi — Listening bar in Slakthusområdet, vinyl sessions & DJ sets
// ---------------------------------------------------------------------------
async function scrapeHosoi() {
  console.log("🎧 Scraping Hosoi...");
  const events = [];
  try {
    const html = await fetchHtml("https://www.hosoistockholm.com/dance-listen");
    const $ = cheerio.load(html);
    const seen = new Set();

    // Try JSON-LD
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item["@type"] !== "Event") continue;
          events.push({
            title: item.name || null,
            description: item.description?.slice(0, 500) || null,
            image_url: item.image || null,
            starts_at: parseDate(item.startDate),
            ends_at: parseDate(item.endDate),
            location: "Hosoi, Slakthusområdet, Stockholm",
            url: item.url || "https://www.hosoistockholm.com/dance-listen",
            source: "hosoi",
            category: "music",
          });
        }
      } catch {}
    });

    // Fallback: Webflow dynamic items (.w-dyn-item) or general event cards
    if (events.length === 0) {
      $(".w-dyn-item, .div-event, [class*='event'], article").each((_, el) => {
        const $el = $(el);
        const title = $el.find("h2, h3, h4, h5, [class*='title'], [class*='heading']").first().text().trim() || null;
        const href = $el.find("a[href]").first().attr("href");
        const $img = $el.find("img").first();
        const img = $img.attr("src") || $img.attr("data-src") || null;

        if (!title || title.length < 2) return;
        const url = href ? (href.startsWith("http") ? href : `https://www.hosoistockholm.com${href}`) : "https://www.hosoistockholm.com/dance-listen";
        if (seen.has(title)) return;
        seen.add(title);

        events.push({
          title,
          description: null,
          image_url: img && !img.startsWith("data:") ? img : null,
          starts_at: null,
          ends_at: null,
          location: "Hosoi, Slakthusområdet, Stockholm",
          url,
          source: "hosoi",
          category: "music",
        });
      });
    }
    console.log(`  ✅ Hosoi: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Hosoi error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Artilleriet — Restaurant with eventkalender, Jazz Tuesdays
// ---------------------------------------------------------------------------
async function scrapeArtilleriet() {
  console.log("🎖️  Scraping Artilleriet...");
  const events = [];
  try {
    const html = await fetchHtml("https://restaurangartilleriet.se/eventkalender/");
    const $ = cheerio.load(html);
    const seen = new Set();

    // Try JSON-LD
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item["@type"] !== "Event") continue;
          events.push({
            title: item.name || null,
            description: item.description?.slice(0, 500) || null,
            image_url: item.image || null,
            starts_at: parseDate(item.startDate),
            ends_at: parseDate(item.endDate),
            location: "Artilleriet, Östermalm, Stockholm",
            url: item.url || "https://restaurangartilleriet.se/eventkalender/",
            source: "artilleriet",
            category: "music",
          });
        }
      } catch {}
    });

    // Fallback: scrape event cards
    if (events.length === 0) {
      $("article, a[href*='/event'], [class*='event'], [class*='card']").each((_, el) => {
        const $el = $(el);
        const title = $el.find("h2, h3, h4, h5, [class*='title']").first().text().trim() || null;
        const href = $el.is("a") ? $el.attr("href") : $el.find("a[href]").first().attr("href");
        const img = $el.find("img").first().attr("src") || null;
        const dateText = $el.find("time, [class*='date']").first().text().trim() || null;

        if (!title || title.length < 2) return;
        const url = href ? (href.startsWith("http") ? href : `https://restaurangartilleriet.se${href}`) : "https://restaurangartilleriet.se/eventkalender/";
        if (seen.has(url)) return;
        seen.add(url);

        events.push({
          title,
          description: null,
          image_url: img,
          starts_at: dateText ? parseDate(dateText) : null,
          ends_at: null,
          location: "Artilleriet, Östermalm, Stockholm",
          url,
          source: "artilleriet",
          category: "music",
        });
      });
    }
    console.log(`  ✅ Artilleriet: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Artilleriet error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Winterviken — Concert venue & café in a historic setting
// ---------------------------------------------------------------------------
async function scrapeWinterviken() {
  console.log("🏔️  Scraping Winterviken...");
  const events = [];
  try {
    const html = await fetchHtml("https://winterviken.se/en/scen/");
    const $ = cheerio.load(html);
    const seen = new Set();

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item["@type"] !== "Event") continue;
          events.push({
            title: item.name || null,
            description: item.description?.slice(0, 500) || null,
            image_url: item.image || null,
            starts_at: parseDate(item.startDate),
            ends_at: parseDate(item.endDate),
            location: "Winterviken, Stockholm",
            url: item.url || "https://winterviken.se/en/scen/",
            source: "winterviken",
            category: "music",
          });
        }
      } catch {}
    });

    if (events.length === 0) {
      $("article, a[href*='/scen/'], a[href*='/event'], [class*='event']").each((_, el) => {
        const $el = $(el);
        const title = $el.find("h2, h3, h4, [class*='title']").first().text().trim() || null;
        const href = $el.is("a") ? $el.attr("href") : $el.find("a[href]").first().attr("href");
        const img = $el.find("img").first().attr("src") || null;

        if (!title || title.length < 2) return;
        const url = href ? (href.startsWith("http") ? href : `https://winterviken.se${href}`) : "https://winterviken.se/en/scen/";
        if (seen.has(url)) return;
        seen.add(url);

        events.push({
          title,
          description: null,
          image_url: img,
          starts_at: null,
          ends_at: null,
          location: "Winterviken, Stockholm",
          url,
          source: "winterviken",
          category: "music",
        });
      });
    }
    console.log(`  ✅ Winterviken: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Winterviken error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Färgfabriken — Art exhibitions & cultural events, Liljeholmen
// ---------------------------------------------------------------------------
async function scrapeFargfabriken() {
  console.log("🎨 Scraping Färgfabriken...");
  const events = [];
  try {
    const html = await fetchHtml("https://fargfabriken.se/en/on-going/");
    const $ = cheerio.load(html);
    const seen = new Set();

    $("article, a[href*='/exhibition'], [class*='exhibition'], [class*='event'], [class*='card']").each((_, el) => {
      const $el = $(el);
      const title = $el.find("h2, h3, h4, [class*='title']").first().text().trim() || null;
      const href = $el.is("a") ? $el.attr("href") : $el.find("a[href]").first().attr("href");
      const img = $el.find("img").first().attr("src") || $el.find("img").first().attr("data-src") || null;
      const dateText = $el.find("time, [class*='date']").first().text().trim() || null;

      if (!title || title.length < 2) return;
      const url = href ? (href.startsWith("http") ? href : `https://fargfabriken.se${href}`) : "https://fargfabriken.se/en/exhibitions";
      if (seen.has(url)) return;
      seen.add(url);

      events.push({
        title,
        description: null,
        image_url: img && !img.startsWith("data:") ? (img.startsWith("http") ? img : `https://fargfabriken.se${img}`) : null,
        starts_at: dateText ? parseDate(dateText) : null,
        ends_at: null,
        location: "Färgfabriken, Liljeholmen, Stockholm",
        url,
        source: "fargfabriken",
        category: "exhibition",
      });
    });
    console.log(`  ✅ Färgfabriken: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Färgfabriken error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Fallan — Concert venue in Slakthusområdet, 2400 capacity
// ---------------------------------------------------------------------------
async function scrapeFallan() {
  console.log("🏭 Scraping Fallan...");
  const events = [];
  try {
    const html = await fetchHtml("https://fallan.nu/whats-on");
    const $ = cheerio.load(html);
    const seen = new Set();

    // Fallan uses /whats-on/[slug] links with h3 titles and date text
    $("a[href*='/whats-on/']").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href");
      if (!href || href === "/whats-on/" || href === "/whats-on") return;

      const url = href.startsWith("http") ? href : `https://fallan.nu${href}`;
      if (seen.has(url)) return;
      seen.add(url);

      // h3 = artist name, h2 = category label (Concert/Club/etc.)
      const title = $el.find("h3, h4").first().text().trim() || null;
      if (!title || title.length < 2) return;

      const $img = $el.find("img").first();
      const img = $img.attr("src") || $img.attr("data-src") || null;

      // Parse date like "Mar 8, 2026" from card text
      const cardText = $el.text();
      const dateMatch = cardText.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})/i);
      // Parse doors time like "DOORS: 19:00"
      const doorsMatch = cardText.match(/DOORS:\s*(\d{2}:\d{2})/i);
      let starts_at = null;
      if (dateMatch) {
        const dateStr = `${dateMatch[1]} ${dateMatch[2]}, ${dateMatch[3]}`;
        const time = doorsMatch ? doorsMatch[1] : "19:00";
        const d = new Date(`${dateStr} ${time}`);
        starts_at = isNaN(d.getTime()) ? parseDate(dateStr) : d.toISOString();
      }

      events.push({
        title,
        description: null,
        image_url: img && !img.startsWith("data:") ? img : null,
        starts_at,
        ends_at: null,
        location: "Fallan, Slakthusområdet, Stockholm",
        url,
        source: "fallan",
        category: "music",
      });
    });
    console.log(`  ✅ Fallan: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Fallan error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Lydmar Hotel — Live music, DJ nights, Östermalm waterfront
// ---------------------------------------------------------------------------
async function scrapeLydmar() {
  console.log("🏨 Scraping Lydmar Hotel...");
  const events = [];
  try {
    const html = await fetchHtml("https://lydmar.com/events/");
    const $ = cheerio.load(html);
    const seen = new Set();

    // Lydmar renders events dynamically, but images have artist names in alt text
    // Pattern: "André Moritz Lydmar Hotel stockholm" → extract "André Moritz"
    $("img[src*='uploads']").each((_, el) => {
      const $img = $(el);
      const alt = $img.attr("alt") || "";
      const src = $img.attr("src") || "";
      if (!alt || !src.includes("uploads")) return;

      // Extract artist name: remove "Lydmar Hotel stockholm" suffix
      const title = alt.replace(/\s*Lydmar Hotel\s*stockholm\s*/i, "").trim();
      if (!title || title.length < 2) return;
      if (seen.has(title)) return;
      seen.add(title);

      events.push({
        title,
        description: null,
        image_url: src,
        starts_at: null,
        ends_at: null,
        location: "Lydmar Hotel, Östermalm, Stockholm",
        url: "https://lydmar.com/events/",
        source: "lydmar",
        category: "music",
      });
    });
    console.log(`  ✅ Lydmar: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Lydmar error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Ticketmaster Discovery API (requires TICKETMASTER_API_KEY in .env)
// Sign up free at: https://developer.ticketmaster.com/
// ---------------------------------------------------------------------------
async function scrapeTicketmaster() {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) {
    console.log("⏭️  Ticketmaster: no TICKETMASTER_API_KEY set, skipping");
    return [];
  }
  console.log("🎵 Fetching Ticketmaster events...");
  const events = [];
  try {
    const url =
      `https://app.ticketmaster.com/discovery/v2/events.json` +
      `?apikey=${apiKey}&city=Stockholm&countryCode=SE&size=50` +
      `&classificationName=Music,Arts,Theatre,Miscellaneous`;
    const data = await fetchJson(url);
    const items = data?._embedded?.events || [];
    for (const ev of items) {
      const venue = ev._embedded?.venues?.[0];
      events.push({
        title: ev.name || null,
        description: ev.info || ev.pleaseNote || null,
        image_url:
          ev.images?.find((i) => i.ratio === "16_9" && i.width > 500)?.url ||
          ev.images?.[0]?.url ||
          null,
        starts_at: parseDate(
          ev.dates?.start?.dateTime || ev.dates?.start?.localDate
        ),
        ends_at: null,
        location: venue
          ? `${venue.name}, ${venue.city?.name || "Stockholm"}`
          : "Stockholm",
        url: ev.url || null,
        source: "ticketmaster",
        category:
          ev.classifications?.[0]?.segment?.name?.toLowerCase() || "music",
      });
    }
    console.log(`  ✅ Ticketmaster: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Ticketmaster error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Source: Eventbrite — Scrape Stockholm events page (API search is deprecated)
// ---------------------------------------------------------------------------
async function scrapeEventbrite() {
  console.log("🎪 Scraping Eventbrite Stockholm...");
  const events = [];
  try {
    const html = await fetchHtml(
      "https://www.eventbrite.se/d/sweden--stockholm/events/"
    );
    const $ = cheerio.load(html);

    // Eventbrite uses SSR with structured data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html());
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          if (item["@type"] !== "Event") continue;
          events.push({
            title: item.name || null,
            description: item.description?.slice(0, 500) || null,
            image_url: item.image || null,
            starts_at: parseDate(item.startDate),
            ends_at: parseDate(item.endDate),
            location: item.location?.name || item.location?.address?.addressLocality || "Stockholm",
            url: item.url || null,
            source: "eventbrite",
            category: "culture",
          });
        }
      } catch {}
    });

    // Fallback: scrape card links
    if (events.length === 0) {
      $("a[href*='/e/']").each((_, el) => {
        const $el = $(el);
        const href = $el.attr("href");
        const title = $el.find("h2, h3, [class*='title'], [class*='name']").first().text().trim();
        const img = $el.find("img").first().attr("src") || null;
        if (!title || !href) return;
        const url = href.startsWith("http") ? href : `https://www.eventbrite.se${href}`;
        events.push({
          title,
          description: null,
          image_url: img,
          starts_at: null,
          ends_at: null,
          location: "Stockholm",
          url,
          source: "eventbrite",
          category: "culture",
        });
      });
    }
    console.log(`  ✅ Eventbrite: ${events.length} events`);
  } catch (err) {
    console.error("  ❌ Eventbrite error:", err.message);
  }
  return events;
}

// ---------------------------------------------------------------------------
// Upsert into Supabase
// ---------------------------------------------------------------------------
async function upsertEvents(events) {
  const valid = events.filter((e) => e.title && e.url);
  if (!valid.length) {
    console.log("  ℹ️  No valid events to upsert (need title + url)");
    return 0;
  }

  const { data, error } = await supabase
    .from("stockholm_events")
    .upsert(valid, {
      onConflict: "url",
      ignoreDuplicates: true, // don't overwrite curated status/newsletter flag
    })
    .select("id");

  if (error) {
    console.error("  ❌ Upsert error:", error.message);
    return 0;
  }

  // Backfill: update image_url for existing events missing images or with placeholder SVGs
  const withImages = valid.filter((e) => e.image_url);
  if (withImages.length > 0) {
    let backfilled = 0;
    // Process in parallel batches of 20
    const BATCH = 20;
    for (let i = 0; i < withImages.length; i += BATCH) {
      const batch = withImages.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (ev) => {
          let count = 0;
          // Fix rows where image_url is null
          const { data: u1 } = await supabase
            .from("stockholm_events")
            .update({ image_url: ev.image_url })
            .eq("url", ev.url)
            .is("image_url", null)
            .select("id");
          if (u1?.length) count += u1.length;

          // Fix rows where image_url is a data: placeholder SVG
          const { data: u2 } = await supabase
            .from("stockholm_events")
            .update({ image_url: ev.image_url })
            .eq("url", ev.url)
            .like("image_url", "data:%")
            .select("id");
          if (u2?.length) count += u2.length;
          return count;
        })
      );
      backfilled += results.reduce((sum, r) => sum + (r.value || 0), 0);
    }
    if (backfilled > 0) {
      console.log(`  🖼️  Backfilled images for ${backfilled} existing events`);
    }
  }

  // Backfill: update title for existing events where scraped title differs (e.g. "March" → real title)
  const withTitles = valid.filter((e) => e.title && e.title.length > 2);
  if (withTitles.length > 0) {
    let titleFixed = 0;
    const TBATCH = 20;
    for (let i = 0; i < withTitles.length; i += TBATCH) {
      const batch = withTitles.slice(i, i + TBATCH);
      const results = await Promise.allSettled(
        batch.map(async (ev) => {
          const { data: u } = await supabase
            .from("stockholm_events")
            .update({ title: ev.title })
            .eq("url", ev.url)
            .neq("title", ev.title)
            .select("id");
          return u?.length || 0;
        })
      );
      titleFixed += results.reduce((sum, r) => sum + (r.value || 0), 0);
    }
    if (titleFixed > 0) {
      console.log(`  📝 Fixed titles for ${titleFixed} existing events`);
    }
  }

  // Backfill: update starts_at for existing events where scraped date differs
  const withDates = valid.filter((e) => e.starts_at);
  if (withDates.length > 0) {
    let dateFixed = 0;
    const BATCH = 20;
    for (let i = 0; i < withDates.length; i += BATCH) {
      const batch = withDates.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (ev) => {
          // Update events where the stored starts_at differs from the scraped one
          const { data: u } = await supabase
            .from("stockholm_events")
            .update({ starts_at: ev.starts_at })
            .eq("url", ev.url)
            .neq("starts_at", ev.starts_at)
            .select("id");
          return u?.length || 0;
        })
      );
      dateFixed += results.reduce((sum, r) => sum + (r.value || 0), 0);
    }
    if (dateFixed > 0) {
      console.log(`  📅 Fixed dates/times for ${dateFixed} existing events`);
    }
  }

  return data?.length || 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n🌍 Stockholm Events Scraper\n");

  const results = await Promise.allSettled([
    scrapeResidentAdvisor(),
    scrapesverigesRadio(),
    scrapeNationalmuseum(),
    scrapeKulturhuset(),
    scrapeLuger(),
    scrapeNalen(),
    scrapeForografiska(),
    scrapeSodraTeatern(),
    scrapeBerns(),
    scrapeFasching(),
    scrapeLuma(),
    scrapeBK(),
    scrapeRiche(),
    scrapeDice(),
    scrapeDebaser(),
    scrapeStampen(),
    scrapeGlennMiller(),
    scrapeUnderBron(),
    scrapeHosoi(),
    scrapeArtilleriet(),
    scrapeWinterviken(),
    scrapeFargfabriken(),
    scrapeFallan(),
    scrapeLydmar(),
    scrapeTicketmaster(),
    scrapeEventbrite(),
  ]);

  const hardcodedEvents = results.flatMap((r) => r.value || []);

  // Also scrape any DB-configured sources (added via admin UI)
  const dbEvents = await scrapeDbSources();

  const allEvents = [...hardcodedEvents, ...dbEvents];

  console.log(`\n📦 Total scraped: ${allEvents.length} events (${hardcodedEvents.length} hardcoded + ${dbEvents.length} from DB sources)`);

  const upserted = await upsertEvents(allEvents);
  console.log(`✅ New events added to Supabase: ${upserted}`);
  console.log("\n✨ Done!\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
