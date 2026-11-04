// The restored mail module's renderer (services/followUpTemplateService.js).
import { renderFollowUpEmailTemplate, renderTemplateSubject, renderTemplateText } from "../src/services/followUpTemplateService.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const templateContent = {
  previewText: "See you there",
  blocks: [
    { type: "text", style: "paragraph", text: "Hi {{first_name}}," },
    { type: "text", style: "heading", text: "{{event_title}}" },
    { type: "image", url: "https://x.co/a.jpg", width: 100, align: "center" },
    { type: "text", style: "paragraph", text: "Read [the story](https://pullup.se/work/bkm) and <b>come</b>." },
    { type: "button", text: "View event", url: "https://pullup.se/e/x", size: 100, align: "center", bgColor: "#d4af37" },
    { type: "pullup_event", layout: "list", events: [{ title: "Release", url: "https://pullup.se/e/r", imageUrl: "https://x.co/r.jpg", startsAt: "2026-11-07T18:00:00Z" }] },
    { type: "discover_event", title: "Sneaky", url: "javascript:alert(2)", imageUrl: "https://x.co/s.jpg" },
    { type: "button", text: "Bad", url: "javascript:alert(1)" },
  ],
};
const person = { name: "Anna Svensson" };
const event = { title: "Release party", startsAt: "2026-11-07T18:00:00Z" };
const html = renderFollowUpEmailTemplate({ templateContent, person, event, unsubscribeUrl: "https://pullup.se/api/unsubscribe/tok" });

assert(html.includes("Hi Anna,") && html.includes("Release party"), "tokens: first name and event title");
assert(html.includes('href="https://pullup.se/work/bkm"') && html.includes("&lt;b&gt;come&lt;/b&gt;"), "inline links linked, html escaped");
assert(html.includes("https://pullup.se/api/unsubscribe/tok"), "unsubscribe link in the footer");
assert(!html.includes("javascript:"), "unsafe button and event-card urls dropped");
assert(html.includes('href="https://pullup.se/e/r"') && html.includes("https://x.co/r.jpg") && html.includes("Sneaky"), "event cards render: link, image, single-event shape");
assert(html.includes("See you there"), "preview text present");
assert(renderTemplateSubject("You're invited to {{event_title}}, {{first_name}}", { person, event }) === "You're invited to Release party, Anna", "subject tokens");
assert(renderTemplateSubject("Hi {{first_name}}", { person: { name: "" }, event }) === "Hi there", "empty name falls back to 'there' (as before)");
const text = renderTemplateText({ templateContent, person, event, unsubscribeUrl: "U" });
assert(text.includes("Hi Anna,") && text.includes("the story (https://pullup.se/work/bkm)") && text.includes("View event: https://pullup.se/e/x"), "plain text: paragraphs, links, buttons");
assert(text.includes("Release https://pullup.se/e/r") && text.endsWith("Unsubscribe: U"), "plain text: event cards and unsubscribe");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall mail-blocks tests passed");
