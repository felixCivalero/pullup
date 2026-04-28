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

function testHeadingBlock() {
  console.log("🧪 heading block renders as <h2>");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s",
      previewText: "",
      blocks: [{ type: "text", style: "heading", text: "Thanks!" }],
      signoff: "",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("<h2"), "contains <h2");
  assert(html.includes("Thanks!"), "contains heading text");
}
testHeadingBlock();

function testImageBlock() {
  console.log("🧪 image block renders <img> with alt and url");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s",
      previewText: "",
      blocks: [{ type: "image", url: "https://cdn.example.com/x.png", alt: "Salon", source: "upload" }],
      signoff: "",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("<img "), "contains <img");
  assert(html.includes("https://cdn.example.com/x.png"), "contains url");
  assert(html.includes('alt="Salon"'), "contains alt text");
}
testImageBlock();

function testButtonBlock() {
  console.log("🧪 button block renders <a> button + optional caption");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s",
      previewText: "",
      blocks: [{ type: "button", text: "Get 20% off", url: "https://example.com/redeem", caption: "Code: THANKYOU20" }],
      signoff: "",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Get 20% off"), "button text present");
  assert(html.includes("https://example.com/redeem"), "button url present");
  assert(html.includes('href="https://example.com/redeem"'), "is an <a> with href");
  assert(html.includes("Code: THANKYOU20"), "caption present when set");
}
testButtonBlock();

function testButtonWithoutCaption() {
  console.log("🧪 button block omits caption when null");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s",
      previewText: "",
      blocks: [{ type: "button", text: "Click", url: "https://example.com", caption: null }],
      signoff: "",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(!html.includes("caption-block"), "no caption div when caption is null");
}
testButtonWithoutCaption();

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
