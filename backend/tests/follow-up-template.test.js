import { renderFollowUpEmailTemplate } from "../src/services/followUpTemplateService.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

function testParagraphBlock() {
  console.log("🧪 paragraph block renders as <p>");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s",
      previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Hello world" }],
      signoff: "",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(typeof html === "string", "returns a string");
  assert(html.includes("<p"), "contains <p");
  assert(html.includes("Hello world"), "contains paragraph text");
}

testParagraphBlock();

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
