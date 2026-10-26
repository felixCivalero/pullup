// An event page for crawlers (lib/eventPage.js): the same facts guests see,
// as HTML plus schema.org Event data — and nothing a host chose to hide.
import { crawlerEventHtml, eventJsonLd } from "../src/lib/eventPage.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const ev = {
  slug: "release-k3x9", title: "Release </script> party", description: "Line one\n\nSecond paragraph <b>", location: "Slakthusområdet, Stockholm",
  starts_at: "2026-11-07T18:00:00Z", ends_at: "2026-11-07T22:00:00Z", timezone: "Europe/Stockholm", hide_location: false, hide_date: false,
};
const opts = { url: "https://pullup.se/e/release-k3x9", imageUrl: "https://img/x.jpg", hostName: "Adam Flambo", full: false, productUrl: "https://pullup.se/pullup" };
const ld = eventJsonLd(ev, opts);
assert(ld["@type"] === "Event" && ld.startDate === "2026-11-07T18:00:00.000Z" && ld.location.name === "Slakthusområdet", "Event data: name, start, place");
assert(ld.isAccessibleForFree && ld.offers.price === 0 && ld.offers.availability.endsWith("InStock"), "free, places left");
assert(eventJsonLd(ev, { ...opts, full: true }).offers.availability.endsWith("SoldOut"), "full → sold out");
const html = crawlerEventHtml(ev, opts);
assert(html.includes("<h1>Release &lt;/script&gt; party</h1>") && !html.includes("Release </script>"), "titles are escaped, also inside the JSON");
assert(html.includes("<p>Second paragraph &lt;b&gt;</p>"), "the text is there, paragraph by paragraph, escaped");
assert(html.includes("lördag 7 november 2026") && html.includes("Slakthusområdet, Stockholm"), "when and where in words");
assert(html.includes('href="https://pullup.se/pullup"') && html.includes("Adam Flambo"), "made with PullUp + the organiser");
assert(!html.includes("http-equiv=\"refresh\""), "no redirect for crawlers to loop on");

const hidden = { ...ev, hide_location: true, reveal_hint: "Avslöjas dagen innan", hide_date: true, date_reveal_hint: "I november" };
const hiddenHtml = crawlerEventHtml(hidden, opts);
assert(!hiddenHtml.includes("Slakthusområdet") && hiddenHtml.includes("Avslöjas dagen innan"), "a hidden place stays hidden; the hint shows");
assert(!hiddenHtml.includes("lördag") && !hiddenHtml.includes("ld+json") && eventJsonLd(hidden, opts) === null, "a hidden date: no date, no Event data");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall event-page tests passed");
