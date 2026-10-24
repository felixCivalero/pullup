// The slim event platform's pure parts: calendar, CRM rows, audiences, mails.
import { icsFor, googleCalendarUrl, eventEnd } from "../src/lib/eventCalendar.js";
import { eventText, imageUrl, makeSlug, sectionsFor, formatWhen, isOpenForSignup, summarizePeople, pickAudience, personPatch } from "../src/lib/eventPlatform.js";
import { confirmationEmail, broadcastEmail } from "../src/lib/eventEmails.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const ev = {
  id: "e1",
  title: "Release, party; and more",
  starts_at: "2026-11-07T18:00:00.000Z",
  ends_at: null,
  location: "Slakthusområdet, Stockholm",
  timezone: "Europe/Stockholm",
  text: "Line one\nLine two with a very long sentence that goes on and on so the line has to fold somewhere past seventy-five octets åäö",
  status: "PUBLISHED",
};

// Calendar
const ics = icsFor(ev, { url: "https://pullup.se/e/release", now: new Date("2026-10-24T10:00:00Z") });
assert(ics.includes("DTSTART:20261107T180000Z") && ics.includes("DTEND:20261107T210000Z"), "ics: UTC start, default 3 h end");
assert(ics.includes("SUMMARY:Release\\, party\\; and more"), "ics: commas and semicolons escaped");
assert(ics.split("\r\n").every((l) => Buffer.byteLength(l, "utf8") <= 75), "ics: every line folded to 75 octets");
assert(ics.includes("UID:e1@pullup.se") && ics.endsWith("END:VCALENDAR\r\n"), "ics: uid and CRLF ending");
const g = new URL(googleCalendarUrl(ev, { url: "https://pullup.se/e/release" }));
assert(g.searchParams.get("dates") === "20261107T180000Z/20261107T210000Z" && g.searchParams.get("location") === ev.location, "google link: dates and place");
assert(eventEnd({ ...ev, ends_at: "2026-11-07T23:00:00Z" }).toISOString() === "2026-11-07T23:00:00.000Z", "a real end time wins");

// Event helpers
assert(eventText({ description: "", sections: [{ type: "title" }, { type: "text", title: "Om", text: "Hej" }] }) === "Om\nHej", "old events: text from sections");
assert(eventText({ description: " Ny ", sections: [] }) === "Ny", "new events: description");
assert(imageUrl("abc/x.jpg", "https://s.co") === "https://s.co/storage/v1/object/public/event-images/abc/x.jpg" && imageUrl("https://a/b.jpg", "x") === "https://a/b.jpg", "image path → public URL, URLs pass through");
assert(/^slapp-for-jul-[a-z2-9]{4}$/.test(makeSlug("Släpp för jul!")), "slug: ascii, dashes, 4-char tail");
assert(sectionsFor("Hej").at(-1).text === "Hej" && sectionsFor("").length === 3, "sections the old editor reads");
assert(formatWhen(ev) === "lördag 7 november 2026, 19:00", "when, in the event's own time zone");
assert(isOpenForSignup(ev, Date.parse("2026-11-01")) && !isOpenForSignup(ev, Date.parse("2026-11-08")) && !isOpenForSignup({ ...ev, status: "DRAFT" }, 0), "sign-up open only while published and not over");

// CRM
const events = [
  { id: "a", title: "A", starts_at: "2026-09-01T18:00:00Z" },
  { id: "b", title: "B", starts_at: "2026-10-01T18:00:00Z" },
];
const people = [
  { id: "p1", name: "Anna", email: "anna@x.se", marketing_consent: true, created_at: "2026-08-01" },
  { id: "p2", name: "Bo", email: "bo@x.se", marketing_consent: true, marketing_unsubscribed_at: "2026-10-02", created_at: "2026-08-02" },
  { id: "p3", name: "Gone", email: "g@x.se", anonymized_at: "2026-09-09", created_at: "2026-08-03" },
  { id: "p4", name: "Cia", email: "Cia@X.se", marketing_consent: false, created_at: "2026-08-04" },
];
const rsvps = [
  { person_id: "p1", event_id: "a", status: "attending", pulled_up: true },
  { person_id: "p1", event_id: "b", status: "attending" },
  { person_id: "p2", event_id: "b", status: "waitlist" },
  { person_id: "p4", event_id: "b", status: "cancelled" },
  { person_id: "p4", event_id: "a", status: "attending" },
];
const crm = summarizePeople({ people, rsvps, events, pullups: [{ event_id: "b", person_id: "p1" }] });
const anna = crm.find((r) => r.id === "p1");
assert(crm.length === 3 && !crm.some((r) => r.id === "p3"), "anonymized people are left out");
assert(anna.events === 2 && anna.attended === 2 && anna.lastEventTitle === "B", "events, pull-ups from both signals, latest event");
assert(crm[0].id === "p1", "most recent event first");
const mixed = summarizePeople({ people: [...people, { id: "p9", name: "Import", email: "i@x.se", created_at: "2026-12-01" }], rsvps, events });
assert(mixed[mixed.length - 1].id === "p9", "people without events come after everyone with events, however new");
assert(crm.find((r) => r.id === "p2").consent === false, "unsubscribed means no consent");
assert(crm.find((r) => r.id === "p4").events === 1, "cancelled sign-ups don't count");

// Audiences
const toEvent = pickAudience({ audience: { type: "event", eventId: "b" }, people, rsvps });
assert(toEvent.map((r) => r.personId).join() === "p1", "event audience: guests minus unsubscribed and cancelled");
const toConsent = pickAudience({ audience: { type: "consent" }, people, rsvps });
assert(toConsent.map((r) => r.personId).join() === "p1" && toConsent[0].basis === "consent", "consent audience: yes and not unsubscribed");
assert(pickAudience({ audience: { type: "event", eventId: "a" }, people, rsvps }).find((r) => r.personId === "p4").email === "cia@x.se", "addresses lower-cased");
assert(pickAudience({ audience: { type: "event", eventId: "b", status: "waitlist" }, people, rsvps }).length === 0, "status filter (the waitlister is unsubscribed)");

// The mail module's CRM segment
const crmAud = (a) => pickAudience({ audience: { type: "crm", ...a }, people, rsvps, pullups: [{ event_id: "b", person_id: "p1" }] }).map((r) => r.personId).join();
assert(crmAud({}) === "p1", "crm segment without events: consent only");
assert(crmAud({ eventIds: ["a"] }) === "p1,p4", "crm segment with an event: its guests, consent not required");
assert(crmAud({ eventIds: ["a"], consentOnly: true }) === "p1", "…narrowed to those who want invitations");
assert(crmAud({ eventIds: ["b"], came: true }) === "p1", "came: rsvps.pulled_up or the pullups table");
assert(crmAud({ eventIds: ["a"], search: "cia" }) === "p4", "search by name or email");
assert(pickAudience({ audience: { type: "crm", eventIds: ["a"] }, people, rsvps })[1].basis === "event_guest", "basis: event guest when not consent-only");
assert(crm.find((r) => r.id === "p1").cameIds.join() === "b,a" && crm.find((r) => r.id === "p2").contactable === false, "crm rows: events came to, contactable");

// Person patch on sign-up
assert(JSON.stringify(personPatch(null, { name: "Ny", consent: true, now: "T" })) === JSON.stringify({ name: "Ny", marketing_consent: true, marketing_consent_at: "T" }), "new person: name and consent");
assert(Object.keys(personPatch({ name: "Old", marketing_consent: true }, { name: "New", consent: false })).length === 0, "known person: name kept, a no never removes a yes");
assert(personPatch({ name: "A", marketing_consent: true, marketing_unsubscribed_at: "x" }, { consent: true }).marketing_unsubscribed_at === null, "a new yes lifts an old unsubscribe");

// Mails
const c = confirmationEmail({ event: ev, name: "Anna Svensson", status: "attending", eventUrl: "U", googleUrl: "G", icsUrl: "I" });
assert(c.subject === "Du är anmäld: Release, party; and more" && c.html.includes("Hej Anna!") && c.html.includes('href="G"') && c.text.includes("Apple / Outlook: I"), "confirmation: subject, first name, both calendar links");
const w = confirmationEmail({ event: ev, name: "", status: "waitlist", eventUrl: "U", googleUrl: "G", icsUrl: "I" });
assert(w.subject.startsWith("Du står på väntelistan") && !w.html.includes('href="G"'), "waitlist: no calendar buttons");
const b = broadcastEmail({ subject: "Hej", body: "Rad ett\n\n<b>x</b> https://pullup.se", unsubscribeUrl: "UNSUB", event: ev, eventUrl: "U" });
assert(b.html.includes("&lt;b&gt;x&lt;/b&gt;") && b.html.includes('<a href="https://pullup.se"'), "broadcast: escaped, links linked");
assert(b.html.includes('href="UNSUB"') && b.text.includes("Avregistrera dig: UNSUB"), "broadcast: unsubscribe in html and text");
assert(!/[\u{1F300}-\u{1FAFF}]/u.test(c.html + b.html), "no emojis");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall event-platform tests passed");
