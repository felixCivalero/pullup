// The public Stockholm guide: what a scraped row may show, its filters, and
// the Thursday mail. Pure — routes/stockholm.js does the reading and sending.

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const TOPICS = ["music", "art", "stage", "culture"];

// The scrapers' categories → the four the page filters on. Sports and the
// like aren't culture: they stay off the page.
export function topicOf(category) {
  const c = String(category || "").toLowerCase();
  if (c === "music" || c === "club") return "music";
  if (c === "exhibition" || c === "arts") return "art";
  if (c === "theatre" || c === "arts & theatre") return "stage";
  if (c === "culture") return "culture";
  return null;
}

// Neighbourhood, from the place name or the venue. First match wins.
const AREAS = [
  ["Norrmalm", /glenn miller|fasching|kulturhuset|nationalmuseum|national museum|sergel|waterfront|nalen|norrmalm/i],
  ["Södermalm", /södermalm|södra teatern|hornstull|medborgarplatsen|mosebacke|kollektivet livet|göta lejon|fotografiska|sjöhistoriska|stadsgård/i],
  ["Östermalm", /östermalm|riche|berns|lydmar|cirkus|dramaten|artilleriet|etnografiska|armémuseum/i],
  ["Djurgården", /djurgård|waldemarsudde|thielska|nordiska museet|liljevalchs|skansen|abba/i],
  ["Skeppsholmen", /skeppsholm|moderna museet|arkdes|östasiatiska/i],
  ["Gamla stan", /gamla stan|kungliga slottet|stampen|postmuseum|medelhavsmuseet|konstakademien/i],
  ["Kungsholmen", /kungsholm/i],
  ["Vasastan", /vasastan|bonniers konsthall|sven-harrys/i],
  ["Söderort", /slakthus|fallan|tyrol|hammarby|årsta|färgfabriken|globen|avicii|strawberry/i],
];
export const AREA_NAMES = AREAS.map(([name]) => name);
export const areaOf = (location) => AREAS.find(([, re]) => re.test(location || ""))?.[0] || null;

// Scraped titles can carry HTML entities ("Chris Minh Doky &#038; The Nomads").
const ENTITIES = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " " };
export const decodeEntities = (s) => String(s)
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, k) => ENTITIES[k]);

// Scraped places arrive cut ("Stallbacken Galle...") or broken ("undefined").
export function placeOf(location) {
  const s = String(location || "").split(",")[0].replace(/\.{3}$/, "").trim();
  return s && !/^(undefined|stockholm)$/i.test(s) ? s : null;
}

// A row as the public sees it: the facts, the organiser's own image (shown
// from their server as a thumbnail, Felix 2026-11-02; https only) and the way
// to the organiser. No scraped texts, nothing else.
export function publicEvent(row) {
  const topic = topicOf(row.category);
  if (!topic || !row.title || !row.url || !/^https?:\/\//i.test(row.url)) return null;
  return {
    id: row.id,
    title: decodeEntities(row.title).trim(),
    startsAt: row.starts_at,
    endsAt: row.ends_at || null,
    place: placeOf(row.location),
    area: areaOf(row.location),
    topic,
    url: row.url,
    image: /^https:\/\//i.test(row.image_url || "") ? row.image_url : null,
  };
}

const ZONE = "Europe/Stockholm";
const dayKey = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: ZONE });
const dayName = (d) => new Date(d).toLocaleDateString("sv-SE", { timeZone: ZONE, weekday: "long", day: "numeric", month: "long" });
// Sources that only give a date arrive as midnight UTC: no time to show.
const clock = (d) => (String(d).includes("T00:00:00") ? "" : new Date(d).toLocaleTimeString("sv-SE", { timeZone: ZONE, hour: "2-digit", minute: "2-digit" }));

// ISO week in Stockholm ("2026-W44") — one Thursday mail per week.
export function weekKey(now = new Date()) {
  const [y, m, d] = dayKey(now).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const jan1 = Date.UTC(date.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((date - jan1) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Thursday from 09:00 Stockholm time.
export function isDigestTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: ZONE, weekday: "short", hour: "2-digit", hour12: false }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return get("weekday") === "Thu" && Number(get("hour")) >= 9;
}

// The next seven days, per the reader's topics (none picked = everything),
// capped per day so the mail stays a mail.
export function pickForDigest(events, interests = [], { now = new Date(), perDay = 5 } = {}) {
  const end = now.getTime() + 7 * 86400000;
  const days = new Map();
  for (const e of events) {
    const t = new Date(e.startsAt).getTime();
    if (!(t >= now.getTime() && t < end)) continue;
    if (interests?.length && !interests.includes(e.topic)) continue;
    const k = dayKey(e.startsAt);
    if (!days.has(k)) days.set(k, []);
    if (days.get(k).length < perDay) days.get(k).push(e);
  }
  return [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, list]) => list);
}

const shell = (inner, footer) => `<!doctype html><html><body style="margin:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0a0a0a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 22px;">
    ${inner}
    <p style="margin:36px 0 0;padding-top:16px;border-top:1px solid #eeeeee;font-size:12px;line-height:1.5;color:#8a8a8e;">${footer}</p>
  </div>
</body></html>`;

export function confirmEmail({ confirmUrl }) {
  const lead = "Ett klick till, så får du det som händer i Stockholm på mejl varje torsdag. Gratis.";
  return {
    subject: "Bekräfta: Stockholm på mejl",
    html: shell(
      `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.15;letter-spacing:-0.02em;">Stockholm på mejl</h1>
       <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3a3a3e;">${lead}</p>
       <a href="${esc(confirmUrl)}" style="display:inline-block;padding:12px 18px;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;background:#0a0a0a;color:#ffffff;">Bekräfta</a>`,
      "Var det inte du? Då gör du ingenting, så hör vi inte av oss igen.",
    ),
    text: `${lead}\n\nBekräfta: ${confirmUrl}\n\nVar det inte du? Då gör du ingenting, så hör vi inte av oss igen.`,
  };
}

export function digestEmail({ days, pageUrl, unsubscribeUrl }) {
  const count = days.reduce((n, d) => n + d.length, 0);
  const line = (e) => [clock(e.startsAt), e.title, e.place].filter(Boolean).join("  ");
  const html = days.map((list) => `
    <h2 style="margin:26px 0 8px;font-size:14px;letter-spacing:-0.01em;color:#6e6e73;font-weight:600;">${esc(dayName(list[0].startsAt))}</h2>
    ${list.map((e) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.4;"><span style="color:#6e6e73;">${esc(clock(e.startsAt))}</span>&nbsp; <a href="${esc(e.url)}" style="color:#0a0a0a;font-weight:600;">${esc(e.title)}</a>${e.place ? `<br><span style="color:#6e6e73;font-size:13px;">${esc(e.place)}</span>` : ""}</p>`).join("")}`).join("");
  return {
    subject: `Stockholm den här veckan: ${count} saker att göra`,
    html: shell(
      `<h1 style="margin:0;font-size:26px;line-height:1.15;letter-spacing:-0.02em;">Stockholm den här veckan</h1>
       ${html}
       <p style="margin:26px 0 0;font-size:14px;"><a href="${esc(pageUrl)}" style="color:#0a0a0a;">Se allt och filtrera</a></p>`,
      `Du får det här eftersom du följer Stockholm på PullUp. <a href="${esc(unsubscribeUrl)}" style="color:#8a8a8e;">Avsluta</a>`,
    ),
    text: [
      "Stockholm den här veckan",
      ...days.flatMap((list) => ["", dayName(list[0].startsAt), ...list.map(line)]),
      "",
      `Se allt och filtrera: ${pageUrl}`,
      `Avsluta: ${unsubscribeUrl}`,
    ].join("\n"),
  };
}
