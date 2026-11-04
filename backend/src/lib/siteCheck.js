// The free site check on the front page. Reads a brand's public front page,
// robots.txt, llms.txt and sitemap, and says what stands between it and being
// found, seen and chosen. It measures readiness, never what an AI would really
// answer. Two parts: readPublic() fetches safely, gradeSite() is pure.
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import zlib from "node:zlib";

const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8000;
const MAX_REDIRECTS = 4;
const UA = "Mozilla/5.0 (compatible; PullUpSiteCheck/1.0; +https://pullup.se)";

// Anything that isn't the public internet: the check must never reach the
// server's own network or the cloud metadata service.
export function isPrivateAddress(ip) {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(v) === 4) {
    const [a, b] = v.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || /^ff/.test(v);
}

// Checked at connect time, on the address really used, so a name that changes
// its answer between two lookups can't slip through.
function safeLookup(host, opts, cb) {
  lookup(host, { ...opts, all: true }, (err, list) => {
    if (err) return cb(err);
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad || !list.length) return cb(new Error("blocked_address"));
    return opts.all ? cb(null, list) : cb(null, list[0].address, list[0].family);
  });
}

export function normalizeSite(input) {
  const raw = String(input || "").trim().slice(0, 300);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    if (url.port && !["80", "443"].includes(url.port)) return null;
    if (isIP(url.hostname.replace(/[[\]]/g, "")) || !url.hostname.includes(".")) return null;
    return `${url.protocol}//${url.hostname.toLowerCase()}/`;
  } catch {
    return null;
  }
}

// Our own site is read on this machine, not through Cloudflare: its Bot Fight
// Mode challenges the server's AWS address, can't be told to skip one IP on
// the free plan, and pullup.se then "couldn't be read" on pullup.se. Only these
// fixed names, over https, still checked against the site's real certificate.
const OWN_HOSTS = new Set(["pullup.se", "www.pullup.se"]);
export const readsOnThisMachine = (url) => url.protocol === "https:" && OWN_HOSTS.has(url.hostname);
const thisMachine = (host, opts, cb) => (opts.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4));

function getOnce(url) {
  if (!readsOnThisMachine(url)) return getVia(url, safeLookup);
  // Not served here (a laptop): read it the ordinary way.
  return getVia(url, thisMachine).catch(() => getVia(url, safeLookup));
}

function getVia(url, lookupFn) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.get(url, {
      lookup: lookupFn,
      timeout: TIMEOUT_MS,
      headers: { "User-Agent": UA, Accept: "text/html,text/plain,*/*", "Accept-Encoding": "gzip, br" },
    }, (res) => {
      const enc = res.headers["content-encoding"];
      const body = enc === "gzip" ? res.pipe(zlib.createGunzip()) : enc === "br" ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = [];
      let size = 0;
      const done = () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") });
      body.on("data", (c) => {
        size += c.length;
        if (size > MAX_BYTES) { req.destroy(); done(); return; }
        chunks.push(c);
      });
      body.on("end", done);
      body.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

export async function readPublic(start) {
  let url = new URL(start);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await getOnce(url);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      url = new URL(res.headers.location, url);
      if (!/^https?:$/.test(url.protocol)) throw new Error("blocked_redirect");
      continue;
    }
    return { ...res, url: url.href };
  }
  throw new Error("too_many_redirects");
}

const quiet = (url) => readPublic(url).catch(() => null);

export async function fetchSite(site) {
  const home = await readPublic(site);
  const origin = new URL(home.url).origin;
  const [robots, llms, sitemap] = await Promise.all([
    quiet(`${origin}/robots.txt`), quiet(`${origin}/llms.txt`), quiet(`${origin}/sitemap.xml`),
  ]);
  const ok = (r) => (r && r.status === 200 ? r.text : "");
  return { url: home.url, status: home.status, html: home.text, robots: ok(robots), llms: ok(llms), sitemap: ok(sitemap) };
}

// Is this bot shut out of the whole site by robots.txt?
export function robotsBlocks(robots, bot) {
  const groups = [];
  let agents = [];
  let inRules = false;
  for (const line of String(robots).split(/\r?\n/)) {
    const m = line.replace(/#.*/, "").trim().match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    if (key === "user-agent") {
      if (inRules) { agents = []; inRules = false; }
      agents.push(m[2].toLowerCase());
      if (!groups.includes(agents)) groups.push(agents);
    } else if (key === "disallow" || key === "allow") {
      inRules = true;
      (agents.rules ||= []).push([key, m[2].trim()]);
    }
  }
  const pick = groups.find((g) => g.includes(bot.toLowerCase())) || groups.find((g) => g.includes("*"));
  const rules = pick?.rules || [];
  return rules.some(([k, v]) => k === "disallow" && v === "/") && !rules.some(([k, v]) => k === "allow" && v === "/");
}

const textOf = (html) => html
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const meta = (html, name) => new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, "i").test(html);

const ITEM = (group, label, ok, fix, weight = 1) => ({ group, label, ok: !!ok, fix, weight });

// A bot wall isn't the brand's site: grading it would tell them something false.
// The words are read where a visitor sees them (title and text), never in the
// scripts: site builders like Squarespace carry "captchaSettings" in every
// page's config, and a short image-led home page is still a real page.
export function isBotWall(html) {
  const text = textOf(html);
  if (text.length >= 1500) return false;
  const title = (html.match(/<title[^>]*>([^<]*)/i) || [])[1] || "";
  return /cf-chl|challenge-platform/i.test(html)
    || /just a moment|attention required|captcha|access denied|are you human|verify you are|enable cookies/i.test(`${title} ${text}`);
}

export function gradeSite({ url, html, robots, llms, sitemap }) {
  const text = textOf(html);
  // Pixels often live inside the tag manager, out of sight of this check: with
  // one on the page we can't say they're missing, so we don't.
  const tagManager = /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,}/i.test(html);
  const blocked = ["GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bingbot", "Meta-ExternalAgent"].filter((b) => robotsBlocks(robots, b));
  const items = [
    ITEM("found", "AI-tjänster får läsa sajten", !blocked.length, `robots.txt stänger ute ${blocked.join(", ")}. Då kan de inte rekommendera er.`, 3),
    ITEM("found", "Innehållet går att läsa utan JavaScript", text.length >= 600, "Nästan ingen text finns i sidans kod. AI-tjänster läser ofta inte det som ritas upp i webbläsaren.", 3),
    ITEM("found", "Sajten berättar vilka ni är för maskiner", /application\/ld\+json/i.test(html), "Strukturerad data saknas, så maskiner får gissa vad ni heter, gör och säljer.", 2),
    ITEM("found", "AI har en sammanfattning av er att gå på", llms.length > 20, "AI-tjänster får ingen egen bild av er från er själva, så de pusslar ihop en av det de hittar. Det kan vi ändra på."),
    ITEM("found", "Sidan har en tydlig huvudrubrik", /<h1[\s>]/i.test(html), "Ingen h1. Både Google och AI använder den för att förstå vad sidan handlar om."),
    ITEM("found", "Sidkarta för Google", /<(urlset|sitemapindex)/i.test(sitemap) || /^sitemap:/im.test(robots), "Ingen sidkarta hittades, så nya sidor tar längre tid att hitta."),
    ITEM("seen", "Titel och beskrivning i sökresultat", /<title[^>]*>[^<]{10,}/i.test(html) && meta(html, "description"), "Titel eller beskrivning saknas. Det är er annons i Google, och den är gratis.", 2),
    ITEM("seen", "Delade länkar får bild och text", meta(html, "og:image") && meta(html, "og:title"), "Delas er sajt i ett meddelande syns ingen bild. Det kostar klick varje dag.", 2),
    ITEM("seen", "Sajten leder till era sociala kanaler", /instagram\.com\/|tiktok\.com\/@|youtube\.com\/|linkedin\.com\/company/i.test(html), "Inga länkar till sociala kanaler hittades på startsidan."),
    ITEM("chosen", "Ni kan mäta vad besökarna gör", /gtag\(|googletagmanager\.com|plausible\.io|matomo|posthog|segment\.com/i.test(html), "Ingen mätning hittades i sidans kod. Då vet ni inte vad som faktiskt säljer.", 2),
    ITEM("chosen", "Annonser kan följas upp på Meta", tagManager || /fbq\(|connect\.facebook\.net/i.test(html), "Ingen Meta-pixel i sidans kod. Annonser på Instagram blir svåra att räkna hem.", 2),
    ITEM("chosen", "Annonser kan följas upp på TikTok", tagManager || /analytics\.tiktok\.com|ttq\./i.test(html), "Ingen TikTok-pixel i sidans kod, så TikTok kan inte lära sig vem som köper."),
    ITEM("chosen", "Besökaren kan lämna sin e-post", /type=["']?email/i.test(html), "Inget mejlfält på startsidan. Den som inte köper i dag försvinner för alltid."),
  ];
  const total = items.reduce((n, i) => n + i.weight, 0);
  const got = items.reduce((n, i) => n + (i.ok ? i.weight : 0), 0);
  return {
    domain: new URL(url).hostname.replace(/^www\./, ""),
    score: Math.round((got / total) * 100),
    items: items.map(({ group, label, ok, fix }) => ({ group, label, ok, fix: ok ? null : fix })),
  };
}
