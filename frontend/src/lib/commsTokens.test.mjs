// Verifies the body<->editor round-trip — specifically that line breaks and
// paragraph gaps survive, regardless of which DOM shape the browser produces on
// Enter (text "\n", <br>, or <div>/<p> wrappers). Run: node src/lib/commsTokens.test.mjs

import { bodyToHtml, serializeDom, chipText } from "./commsTokens.js";

let failures = 0;
const assert = (cond, msg) => { if (!cond) { failures++; console.error("❌", msg); } else console.log("✅", msg); };

// Minimal fake DOM nodes (serializeDom only reads childNodes/nodeType/nodeValue/tagName/dataset).
const t = (v) => ({ nodeType: 3, nodeValue: v });
const el = (tag, children = [], token = null) => ({ nodeType: 1, tagName: tag, dataset: token ? { token } : {}, childNodes: children });
const root = (children) => ({ childNodes: children });

// ── serializeDom: the three Enter shapes all normalise to "\n" ──
console.log("🧪 serializeDom newline normalisation");
{
  // Chrome-style: first line bare text, later lines wrapped in <div>
  assert(serializeDom(root([t("line1"), el("DIV", [t("line2")])])) === "line1\nline2", "div-wrapped line → single \\n");
  // Firefox-style: <br> between lines
  assert(serializeDom(root([t("line1"), el("BR"), t("line2")])) === "line1\nline2", "<br> → single \\n");
  // Paragraph gap (double Enter): empty <div><br></div> between
  assert(serializeDom(root([t("line1"), el("DIV", [el("BR")]), el("DIV", [t("line2")])])) === "line1\n\nline2", "empty div+br → blank line (\\n\\n)");
  // Literal text-node newlines (pre-wrap typing)
  assert(serializeDom(root([t("a\n\nb")])) === "a\n\nb", "literal text-node \\n\\n preserved");
}

// ── serializeDom: chips become their {token} ──
console.log("🧪 serializeDom chips");
{
  const dom = root([t("Hi "), el("SPAN", [t("Sat 2pm")], "{time}"), t(" at "), el("SPAN", [t("🔗 room link")], "{room link}")]);
  assert(serializeDom(dom) === "Hi {time} at {room link}", `chips → tokens (got ${JSON.stringify(serializeDom(dom))})`);
}

// ── bodyToHtml: newlines → <br>, tokens → chip spans, prose escaped ──
console.log("🧪 bodyToHtml");
{
  const html = bodyToHtml("Welcome to {event name}!\n\nSee {room link}", { eventName: "Tom & Jo" });
  assert((html.match(/<br>/g) || []).length === 2, "double newline → two <br>");
  assert(html.includes('data-token="{event name}"') && html.includes("Tom &amp; Jo"), "event chip shows escaped sample value");
  assert(html.includes('data-token="{room link}"') && html.includes("room link"), "room link chip rendered");
  assert(bodyToHtml("<script>", {}).includes("&lt;script&gt;"), "prose HTML escaped");
}

// ── full round-trip: body → html → (simulated DOM) → body is stable ──
console.log("🧪 round-trip stability");
{
  // bodyToHtml emits "<br>" for newlines and chip spans; a browser parsing that
  // yields BR nodes + chip spans. Simulate that DOM and serialize back.
  const body = "Hello {event name}\nline two\n\nfinal";
  // Simulated parse of bodyToHtml(body): text, chip, <br>, text, <br>, <br>, text
  const dom = root([
    t("Hello "), el("SPAN", [t("E")], "{event name}"),
    el("BR"), t("line two"), el("BR"), el("BR"), t("final"),
  ]);
  assert(serializeDom(dom) === body, `round-trip stable (got ${JSON.stringify(serializeDom(dom))})`);
}

// ── chipText placeholders ──
console.log("🧪 chipText");
{
  assert(chipText("{time}", { time: "Sat 2pm" }) === "Sat 2pm", "time shows real value");
  assert(chipText("{time}", {}) === "date & time", "empty time → placeholder");
  assert(chipText("{upload link}", {}).includes("upload link"), "upload link label");
}

if (failures) { console.error(`\n${failures} failed`); process.exit(1); }
else console.log("\nAll commsTokens assertions passed");
