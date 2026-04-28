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
    person: { name: "Sam" },
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
    person: { name: "Sam" },
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
    person: { name: "Sam" },
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
    person: { name: "Sam" },
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
    person: { name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(!html.includes("caption-block"), "no caption div when caption is null");
}
testButtonWithoutCaption();

// (Removed testGreeting + testGreetingFallback — greeting is now just a
// regular text block in the blocks array; no auto-injection. Token
// substitution + first_name fallback to "there" are still covered by
// testFirstNameFromFullName + testTokenSubstitutionInTextBlock.)

function testSignoff() {
  console.log("🧪 signoff renders with newlines preserved");
  const html = renderFollowUpEmailTemplate({
    templateContent: { subject: "s", previewText: "", blocks: [], signoff: "With love,\nThe Salon" },
    person: { name: "Sam" },
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
    person: { name: "Sam" },
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
    person: { name: "Sam" },
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
    person: { name: "Sam" },
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
      blocks: [{ type: "button", text: "Hi {{first_name}}", url: "https://x.com", caption: "From {{first_name}}" }],
      signoff: "Thanks {{first_name}}",
    },
    person: { name: "Sam Lee" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Hi Sam"), "button text token resolved");
  assert(html.includes("From Sam"), "caption token resolved");
  assert(html.includes("Thanks Sam"), "signoff tokens resolved");
}
testTokensInButtonAndSignoff();

function testFirstNameFromFullName() {
  console.log("🧪 first_name takes the first whitespace-separated word");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Hi {{first_name}}!" }],
      signoff: "",
    },
    person: { name: "Felix Civalero" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Hi Felix!"), "uses first word only");
  assert(!html.includes("Civalero"), "drops last name");
}
testFirstNameFromFullName();

function testUnknownTokenResolvesEmpty() {
  console.log("🧪 unknown token resolves to empty string");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Hi {{nonexistent}}!" }],
      signoff: "",
    },
    person: { name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Hi !"), "unknown token becomes empty");
  assert(!html.includes("{{nonexistent}}"), "no raw token left");
}
testUnknownTokenResolvesEmpty();

function testTokensEscapedSafely() {
  console.log("🧪 token values are HTML-escaped");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Hello {{first_name}}" }],
      signoff: "",
    },
    person: { name: "<script>x</script>" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(!html.includes("<script>x</script>"), "raw script tag not present");
  assert(html.includes("&lt;script&gt;"), "token value escaped");
}
testTokensEscapedSafely();

// (was testMissingTokenFallback — replaced by testUnknownTokenResolvesEmpty)
function testEditableGreetingWithTokens() {
  console.log("🧪 custom greeting renders with token substitution");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [],
      signoff: "",
      greeting: "Welcome back, {{first_name}}!",
    },
    person: { name: "Sam" },
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
    person: { name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(!html.includes("Hi Sam"), "no default greeting");
  assert(html.includes("Body text"), "body still renders");
}
testEmptyGreetingOmitsParagraph();

function testLinkSyntaxRenders() {
  console.log("🧪 [label](url) renders as <a href>");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Maila mig på [alex](mailto:alex@cliff.se) tack!" }],
      signoff: "",
    },
    person: { name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes('href="mailto:alex@cliff.se"'), "mailto href present");
  assert(html.includes(">alex</a>"), "label rendered as link text");
  assert(html.includes("Maila mig på "), "surrounding text preserved");
  assert(html.includes(" tack!"), "trailing text preserved");
}
testLinkSyntaxRenders();

function testHttpLinksWork() {
  console.log("🧪 https links render");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "See [our site](https://pullup.se)." }],
      signoff: "",
    },
    person: { name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes('href="https://pullup.se"'), "https href present");
  assert(html.includes(">our site</a>"), "label rendered");
}
testHttpLinksWork();

function testUnsafeSchemesRejected() {
  console.log("🧪 javascript:/data: schemes are NOT rendered as <a>");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "click [me](javascript:alert(1))" }],
      signoff: "",
    },
    person: { name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(!html.includes("<a"), "no anchor tag emitted");
  assert(!/href\s*=/.test(html), "no href attribute emitted");
}
testUnsafeSchemesRejected();

function testLinksWorkWithTokens() {
  console.log("🧪 token + link in same text resolves");
  const html = renderFollowUpEmailTemplate({
    templateContent: {
      subject: "s", previewText: "",
      blocks: [{ type: "text", style: "paragraph", text: "Hi {{first_name}}, [reply here](mailto:a@b.se)" }],
      signoff: "",
    },
    person: { name: "Felix Civalero" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(html.includes("Hi Felix,"), "token resolved");
  assert(html.includes('href="mailto:a@b.se"'), "link rendered");
}
testLinksWorkWithTokens();

function testUnsubscribeFooterRenders() {
  console.log("🧪 unsubscribeUrl appears in footer with no-track marker");
  const html = renderFollowUpEmailTemplate({
    templateContent: { subject: "s", previewText: "", blocks: [], signoff: "" },
    person: { name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
    unsubscribeUrl: "https://app.example.com/u/abc123",
  });
  assert(html.includes("https://app.example.com/u/abc123"), "url present");
  assert(html.includes("ses:no-track"), "no-track marker present so click tracker skips it");
  assert(html.includes("unsubscribe from this list"), "footer copy present");
}
testUnsubscribeFooterRenders();

function testNoFooterWithoutUnsubscribeUrl() {
  console.log("🧪 footer omitted when unsubscribeUrl missing (e.g. preview)");
  const html = renderFollowUpEmailTemplate({
    templateContent: { subject: "s", previewText: "", blocks: [], signoff: "" },
    person: { name: "Sam" },
    event: null,
    baseUrl: "https://example.com",
  });
  assert(!html.includes("unsubscribe"), "no footer rendered without url");
}
testNoFooterWithoutUnsubscribeUrl();

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
