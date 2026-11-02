// The public Stockholm guide's pure parts: what shows, filters, the Thursday mail.
import { ogImageOf } from "../src/lib/eventImages.js";
import { areaOf, confirmEmail, digestEmail, isDigestTime, pickForDigest, placeOf, publicEvent, topicOf, weekKey } from "../src/lib/stockholmGuide.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

// What shows
const row = { id: "1", title: " Kat Eaton ", starts_at: "2026-11-05T19:00:00Z", ends_at: null, location: "Fasching, Stockholm", url: "https://www.fasching.se/x", category: "music", image_url: "https://x/y.jpg", description: "scraped", status: "pending" };
const pub = publicEvent(row);
assert(pub.title === "Kat Eaton" && pub.place === "Fasching" && pub.area === "Norrmalm" && pub.topic === "music", "publicEvent: the facts, cleaned");
assert(!("image_url" in pub) && !("description" in pub) && !("status" in pub), "publicEvent: no scraped text or status");
assert(pub.image === "https://x/y.jpg", "publicEvent: the organiser's image as thumbnail");
assert(publicEvent({ ...row, image_url: "http://x/y.jpg" }).image === null, "publicEvent: no insecure image");
assert(publicEvent({ ...row, image_url: null }).image === null, "publicEvent: no image, null");
assert(publicEvent({ ...row, title: "Chris Minh Doky &#038; The Nomads" }).title === "Chris Minh Doky & The Nomads", "publicEvent: entities decoded in titles");
assert(ogImageOf('<meta property="og:image" content="/img/a.jpg">', "https://sodrateatern.com/e/x/") === "https://sodrateatern.com/img/a.jpg", "ogImageOf: relative made absolute");
assert(ogImageOf('<meta content="http://x.se/b.jpg" name="twitter:image">', "https://x.se/") === "https://x.se/b.jpg", "ogImageOf: twitter image, upgraded to https");
assert(ogImageOf("<title>none</title>", "https://x.se/") === null, "ogImageOf: nothing found, null");
assert(publicEvent({ ...row, category: "sports" }) === null, "publicEvent: sports stay off the page");
assert(publicEvent({ ...row, url: "javascript:alert(1)" }) === null, "publicEvent: only real links");
assert(topicOf("arts & theatre") === "stage" && topicOf("exhibition") === "art", "topicOf: scraper categories map to the four filters");

// Places
assert(placeOf("undefined, Stockholm") === null, "placeOf: broken place is dropped");
assert(placeOf("Stallbacken Galle..., Stockholm") === "Stallbacken Galle", "placeOf: cut place loses its dots");
assert(areaOf("Fallan, Slakthusområdet, Stockholm") === "Söderort", "areaOf: Slakthusområdet");
assert(areaOf("Södra Teatern, Stockholm") === "Södermalm", "areaOf: venue name");
assert(areaOf("Glenn Miller Café, Södermalm, Stockholm") === "Norrmalm", "areaOf: the venue beats a wrong scraped area");
assert(placeOf("Fallan, Slakthusområdet, Stockholm") === "Fallan", "placeOf: the venue alone");
assert(areaOf("Väsby Konsthall, Stockholm") === null, "areaOf: unknown stays unknown");

// When
assert(weekKey(new Date("2026-10-29T10:00:00Z")) === "2026-W44", "weekKey: ISO week");
assert(weekKey(new Date("2027-01-01T10:00:00Z")) === "2026-W53", "weekKey: year boundary");
assert(isDigestTime(new Date("2026-11-05T08:30:00Z")), "isDigestTime: Thursday 09:30 Stockholm");
assert(!isDigestTime(new Date("2026-11-05T07:30:00Z")), "isDigestTime: Thursday 08:30 is too early");
assert(!isDigestTime(new Date("2026-11-04T12:00:00Z")), "isDigestTime: not on Wednesday");

// The mail
const now = new Date("2026-11-05T08:00:00Z");
const ev = (id, day, topic) => ({ id, title: `Event <${id}>`, startsAt: `2026-11-${day}T19:00:00Z`, place: "Fasching", topic, url: `https://x.se/${id}` });
const list = [ev("a", "05", "music"), ev("b", "06", "art"), ev("c", "20", "music")];
assert(pickForDigest(list, [], { now }).flat().length === 2, "pickForDigest: next seven days only");
assert(pickForDigest(list, ["art"], { now }).flat().map((e) => e.id).join() === "b", "pickForDigest: the reader's topics");
const full = Array.from({ length: 9 }, (_, i) => ev(String(i), "06", "music"));
assert(pickForDigest(full, [], { now, perDay: 5 }).flat().length === 5, "pickForDigest: capped per day");

const mail = digestEmail({ days: pickForDigest(list, [], { now }), pageUrl: "https://pullup.se/stockholm", unsubscribeUrl: "https://pullup.se/api/stockholm/unsubscribe/t" });
assert(mail.subject.includes("2 saker"), "digestEmail: counts in the subject");
assert(mail.html.includes("Event &lt;a&gt;") && !mail.html.includes("<a>"), "digestEmail: titles escaped");
assert(mail.html.includes("unsubscribe/t") && mail.text.includes("unsubscribe/t"), "digestEmail: a way out in both versions");
assert(confirmEmail({ confirmUrl: "https://pullup.se/stockholm?folj=t" }).text.includes("folj=t"), "confirmEmail: carries the link");

if (failures) process.exit(1);
