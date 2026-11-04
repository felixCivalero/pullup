// The site check: who it may reach, how it reads robots.txt, how it grades.
import { gradeSite, isBotWall, isPrivateAddress, normalizeSite, robotsBlocks } from "../src/lib/siteCheck.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

// Never the server's own network
for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "0.0.0.0"]) {
  assert(isPrivateAddress(ip), `isPrivateAddress: ${ip} blocked`);
}
assert(!isPrivateAddress("93.184.216.34"), "isPrivateAddress: public IPv4 allowed");
assert(!isPrivateAddress("2606:2800:220:1::1"), "isPrivateAddress: public IPv6 allowed");

assert(normalizeSite("stiga.com/en/shop?x=1") === "https://stiga.com/", "normalizeSite: bare domain, front page only");
assert(normalizeSite("http://Example.SE") === "http://example.se/", "normalizeSite: keeps http, lowercases");
assert(normalizeSite("http://127.0.0.1") === null, "normalizeSite: no IPs");
assert(normalizeSite("http://localhost") === null, "normalizeSite: no local names");
assert(normalizeSite("https://a.se:8080") === null, "normalizeSite: no odd ports");
assert(normalizeSite("https://u:p@a.se") === null, "normalizeSite: no credentials");
assert(normalizeSite("ftp://a.se") === null, "normalizeSite: only web");

// robots.txt
const r = "User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n";
assert(robotsBlocks(r, "GPTBot"), "robots: named bot blocked");
assert(!robotsBlocks(r, "ClaudeBot"), "robots: partial rule isn't a block");
assert(robotsBlocks("User-agent: *\nDisallow: /", "ClaudeBot"), "robots: wildcard block");
assert(robotsBlocks("User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /", "ClaudeBot"), "robots: shared group");
assert(!robotsBlocks("User-agent: *\nDisallow: /\nUser-agent: GPTBot\nAllow: /", "GPTBot"), "robots: named group wins");
assert(!robotsBlocks("", "GPTBot"), "robots: none = open");
const shut = gradeSite({ url: "https://a.se/", html: "", robots: "User-agent: Google-Extended\nDisallow: /", llms: "", sitemap: "" });
assert(!shut.items[0].ok && shut.items[0].fix.includes("Google-Extended"), "grade: Gemini's crawler counts as an AI");

// Grading
const empty = gradeSite({ url: "https://www.a.se/", html: '<div id="root"></div>', robots: "User-agent: *\nDisallow: /", llms: "", sitemap: "" });
assert(empty.domain === "a.se", "grade: domain without www");
assert(empty.score === 0, "grade: nothing passes on an empty shell");
assert(empty.items.every((i) => i.fix), "grade: every miss says what to do");
const words = "ord ".repeat(300);
const full = gradeSite({
  url: "https://a.se/",
  html: `<title>En bra titel här</title><meta name="description" content="x"><meta property="og:image" content="x"><meta property="og:title" content="x"><script type="application/ld+json">{}</script><script>gtag('x');fbq('y');ttq.page()</script><h1>Hej</h1><p>${words}</p><a href="https://instagram.com/a">ig</a><input type="email">`,
  robots: "", llms: "PullUp är en byrå i Stockholm.", sitemap: "<urlset>",
});
assert(full.score === 100 && full.items.every((i) => !i.fix), "grade: a complete site scores 100");

assert(isBotWall("<title>Just a moment...</title><script>cf-chl</script>"), "botWall: a challenge page isn't graded");
assert(!isBotWall(`<p>${words}</p>`), "botWall: a real page is");
// Squarespace ships its captcha settings in the page's config, and a short
// image-led home page is still a real page (gatuverket.com, 2026-11-04).
const squarespace = '<title>GATUVERKET</title><script>Static.SQUARESPACE_CONTEXT = {"website":{"captchaSettings":{"enabledForDonations":false}},"recaptchaEnterpriseContext":{}};</script><h1>GATUVERKET</h1><p>Streetdance in Stockholm. Workshops and membership.</p>';
assert(!isBotWall(squarespace), "botWall: a short page with captcha settings in its scripts is read");
assert(isBotWall("<title>Access denied</title><p>Access denied. You don't have permission.</p>"), "botWall: a plain block page isn't graded");
assert(isBotWall('<title>Verify</title><div class="g-recaptcha"></div><p>Please complete the captcha to continue.</p>'), "botWall: a captcha you must solve isn't graded");
const gtm = gradeSite({ url: "https://a.se/", html: '<script src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC123"></script>', robots: "", llms: "", sitemap: "" });
assert(gtm.items.find((i) => i.label.includes("Meta")).ok, "grade: a pixel may hide in the tag manager, so it isn't called missing");

if (failures) process.exit(1);
