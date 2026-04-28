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

function testGreeting() {
  console.log("🧪 greeting prefixes body with first name");
  const html = renderFollowUpEmailTemplate({
    templateContent: { subject: "s", previewText: "", blocks: [], signoff: "" },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Hi Sam,"), "uses first name");
}
testGreeting();

function testGreetingFallback() {
  console.log("🧪 greeting falls back when first name missing");
  const html = renderFollowUpEmailTemplate({
    templateContent: { subject: "s", previewText: "", blocks: [], signoff: "" },
    person: {},
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Hi there,"), "uses fallback");
}
testGreetingFallback();

function testSignoff() {
  console.log("🧪 signoff renders with newlines preserved");
  const html = renderFollowUpEmailTemplate({
    templateContent: { subject: "s", previewText: "", blocks: [], signoff: "With love,\nThe Salon" },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("With love,"), "signoff line 1");
  assert(html.includes("The Salon"), "signoff line 2");
  assert(html.includes("<br"), "newline becomes <br>");
}
testSignoff();

function testUnknownBlockSkipped() {
  console.log("🧪 unknown block types are skipped, not thrown");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s",
      previewText: "",
      blocks: [
        { type: "text", style: "paragraph", text: "ok" },
        { type: "future-block", payload: 42 },
      ],
      signoff: "",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("ok"), "known block still rendered");
  assert(!html.includes("future-block"), "unknown block not rendered");
}
testUnknownBlockSkipped();

function testTokenSubstitutionInTextBlock() {
  console.log("🧪 {{first_name}} resolves in text blocks");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Welcome {{first_name}}!" }],
      signoff: "",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Welcome Sam!"), "first_name substituted");
  assert(!html.includes("{{first_name}}"), "no raw token left");
}
testTokenSubstitutionInTextBlock();

function testEventTokensResolve() {
  console.log("🧪 {{event_title}} and {{event_date}} resolve from event");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "heading", text: "{{event_title}} on {{event_date}}" }],
      signoff: "",
    },
    person: { first_name: "Sam" },
    event: { title: "Spring Salon", starts_at: "2026-05-15T19:00:00Z" },
    baseUrl: "https://example.com",
  });
  assert(html.includes("Spring Salon"), "event_title substituted");
  assert(html.includes("May") || html.includes("15"), "event_date formatted");
}
testEventTokensResolve();

function testTokensInButtonAndSignoff() {
  console.log("🧪 tokens resolve in button text/caption and signoff");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "button", text: "Hi {{first_name}}", url: "https://x.com", caption: "for {{last_name}}" }],
      signoff: "Thanks {{first_name}} {{last_name}}",
    },
    person: { first_name: "Sam", last_name: "Lee" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Hi Sam"), "button text token resolved");
  assert(html.includes("for Lee"), "caption token resolved");
  assert(html.includes("Thanks Sam Lee"), "signoff tokens resolved");
}
testTokensInButtonAndSignoff();

function testMissingTokenFallback() {
  console.log("🧪 missing token data falls back to empty string");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Hi {{last_name}}!" }],
      signoff: "",
    },
    person: { first_name: "Sam" }, // no last_name
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Hi !"), "missing token resolves to empty");
  assert(!html.includes("{{last_name}}"), "no raw token left");
}
testMissingTokenFallback();

function testTokensEscapedSafely() {
  console.log("🧪 token values are HTML-escaped");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Hello {{first_name}}" }],
      signoff: "",
    },
    person: { first_name: "<script>x</script>" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(!html.includes("<script>x</script>"), "raw script tag not present");
  assert(html.includes("&lt;script&gt;"), "token value escaped");
}
testTokensEscapedSafely();

function testEditableGreetingWithTokens() {
  console.log("🧪 custom greeting renders with token substitution");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [],
      signoff: "",
      greeting: "Welcome back, {{first_name}}!",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Welcome back, Sam!"), "custom greeting + token");
  assert(!html.includes("Hi Sam"), "default greeting not used");
}
testEditableGreetingWithTokens();

function testEmptyGreetingOmitsParagraph() {
  console.log("🧪 explicit empty greeting renders no greeting line");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Body text" }],
      signoff: "",
      greeting: "",
    },
    person: { first_name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(!html.includes("Hi Sam"), "no default greeting");
  assert(html.includes("Body text"), "body still renders");
}
testEmptyGreetingOmitsParagraph();

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
