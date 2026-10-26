// An event page as plain HTML, for everything that reads pages without
// running JavaScript: link previews (Facebook, WhatsApp, Slack …), search
// engines and AI crawlers (GPTBot, ClaudeBot, PerplexityBot …). nginx sends
// them to the backend's /e/:slug; people get the app. Same facts as the page
// guests see — never more (a hidden place or date stays hidden) — plus
// schema.org Event data, so a search or an AI can answer "what's on, when,
// where, is it free" from it. Pure; routes/events.js does the I/O.
import { eventText, formatWhen } from "./eventPlatform.js";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// JSON inside <script>: no "</script>" can close it early.
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");

export function eventJsonLd(ev, { url, imageUrl, hostName, full }) {
  if (ev.hide_date || !ev.starts_at) return null;
  const location = ev.hide_location || !ev.location
    ? undefined
    : { "@type": "Place", name: ev.location.split(",")[0].trim(), address: ev.location };
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: ev.title,
    description: eventText(ev).slice(0, 5000) || undefined,
    startDate: new Date(ev.starts_at).toISOString(),
    endDate: ev.ends_at ? new Date(ev.ends_at).toISOString() : undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location,
    image: imageUrl ? [imageUrl] : undefined,
    url,
    isAccessibleForFree: true,
    organizer: hostName ? { "@type": "Organization", name: hostName } : undefined,
    offers: {
      "@type": "Offer",
      price: 0,
      priceCurrency: "SEK",
      availability: full ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
      url,
    },
  };
}

export function crawlerEventHtml(ev, { url, imageUrl, hostName, full, productUrl }) {
  const when = ev.hide_date ? (ev.date_reveal_hint || "") : formatWhen(ev);
  const where = ev.hide_location ? (ev.reveal_hint || "") : ev.location || "";
  const desc = [when, where].filter(Boolean).join(" · ");
  const text = eventText(ev);
  const ld = eventJsonLd(ev, { url, imageUrl, hostName, full });
  const paragraphs = text.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("\n");
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(ev.title)}</title>
<meta name="description" content="${esc([desc, text.slice(0, 160)].filter(Boolean).join(" — "))}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:type" content="website"><meta property="og:url" content="${esc(url)}"><meta property="og:site_name" content="PullUp">
<meta property="og:title" content="${esc(ev.title)}"><meta property="og:description" content="${esc(desc)}">
${imageUrl ? `<meta property="og:image" content="${esc(imageUrl)}"><meta name="twitter:image" content="${esc(imageUrl)}">` : ""}
<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}">
${ld ? `<script type="application/ld+json">${jsonLd(ld)}</script>` : ""}
</head><body>
<main>
<h1>${esc(ev.title)}</h1>
${when ? `<p><strong>När:</strong> ${esc(when)}</p>` : ""}
${where ? `<p><strong>Var:</strong> ${esc(where)}</p>` : ""}
${hostName ? `<p><strong>Arrangör:</strong> ${esc(hostName)}</p>` : ""}
${imageUrl ? `<img src="${esc(imageUrl)}" alt="${esc(ev.title)}">` : ""}
${paragraphs}
<p><a href="${esc(url)}">${full ? "Fullt – skriv upp dig på väntelistan" : "Anmäl dig"}</a> (gratis)</p>
</main>
<footer><p>Eventsidan är gjord med <a href="${esc(productUrl)}">PullUp</a> – gratis eventsidor med anmälan, kalenderinbjudan och gästlista.</p></footer>
</body></html>`;
}
