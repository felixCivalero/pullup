// Regression tests for the three delivery-integrity bugs found while auditing
// a host's 311-recipient campaign (2026-08-21):
//   1. the open pixel was silently dropped on all host-composed campaign HTML
//   2. a late markSent() overwrote an already-`delivered` row back to `sent`
//   3. Resend bounces never reached the suppression list
//
// All three are covered here by their pure, dependency-free cores.

import { addTracking } from "../src/email/tracking/linkRewriter.js";
import { bounceVerdict, BOUNCE_SUPPRESS_THRESHOLD } from "../src/email/outbox/bouncePolicy.js";
import { STATUS_RANK, statusesAdvanceableTo } from "../src/email/repos/emailOutboxRepo.js";
import { normalizeEmail } from "../src/email/repos/emailSuppressionsRepo.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

const OPTS = { trackingId: "11111111-2222-3333-4444-555555555555", baseUrl: "https://pullup.se/api" };
const PIXEL = `/t/o/${OPTS.trackingId}`;

console.log("🧪 open pixel is injected regardless of document shape");
{
  const full = addTracking("<html><body><p>hi</p></body></html>", OPTS);
  assert(full.includes(PIXEL), "full document gets the pixel");
  assert(full.indexOf(PIXEL) < full.indexOf("</body>"), "pixel sits before </body>");

  // THE BUG: host-composed campaign HTML is a fragment with no <body> wrapper.
  const fragment = addTracking('<div><a href="https://pullup.se/e/x">Go</a></div>', OPTS);
  assert(fragment.includes(PIXEL), "bare fragment still gets the pixel");
  assert(fragment.includes("/t/c/"), "bare fragment still gets click tracking");

  const noBody = addTracking("<html><p>hi</p></html>", OPTS);
  assert(noBody.includes(PIXEL), "document with </html> but no </body> gets the pixel");
  assert(noBody.indexOf(PIXEL) < noBody.indexOf("</html>"), "pixel sits before </html>");

  const spaced = addTracking("<html><body><p>hi</p></BODY  ></html>", OPTS);
  assert(spaced.includes(PIXEL), "closing tag casing/whitespace variants still match");
  assert(spaced.match(/<img src="[^"]*\/t\/o\//g)?.length === 1, "pixel injected exactly once");
}

console.log("🧪 addTracking stays a no-op without a tracking id");
{
  const html = "<html><body>hi</body></html>";
  assert(addTracking(html, { baseUrl: "https://pullup.se/api" }) === html, "no trackingId → unchanged");
  assert(addTracking(html, { trackingId: "abc" }) === html, "no baseUrl → unchanged");
}

console.log("🧪 outbox statuses only ever move forward");
{
  const canAdvance = (from, to) => statusesAdvanceableTo(to).includes(from);

  // The actual race: the delivered webhook wins, then markSent lands late.
  assert(!canAdvance("delivered", "sent"), "delivered is NOT knocked back to sent");
  assert(!canAdvance("bounced", "sent"), "bounced is NOT knocked back to sent");
  assert(!canAdvance("bounced", "delivered"), "bounced is NOT flipped to delivered");

  // Legitimate forward moves must still work.
  assert(canAdvance("sending", "sent"), "sending → sent");
  assert(canAdvance("sent", "delivered"), "sent → delivered");
  assert(canAdvance("delivered", "bounced"), "delivered → bounced (delayed hard bounce)");
  assert(canAdvance("delivered", "complaint"), "delivered → complaint");
  assert(canAdvance("sent", "sent"), "re-applying the same status is allowed (idempotent webhooks)");

  assert(STATUS_RANK.queued < STATUS_RANK.sent, "queued ranks below sent");
  assert(STATUS_RANK.sent < STATUS_RANK.delivered, "sent ranks below delivered");
}

console.log("🧪 bounce suppression: dead addresses stop, real guests don't");
{
  assert(bounceVerdict({ permanent: true }).suppress, "explicit Permanent suppresses immediately");

  // The two addresses this audit found: typo'd, bounced ~10x, never delivered.
  assert(
    bounceVerdict({ permanent: false, bounced: 9, delivered: 0 }).suppress,
    "9 bounces / 0 deliveries suppresses even on an ambiguous bounce",
  );
  assert(
    bounceVerdict({ permanent: false, bounced: BOUNCE_SUPPRESS_THRESHOLD, delivered: 0 }).suppress,
    "threshold bounces / 0 deliveries suppresses",
  );

  // A real guest having a bad night must survive.
  assert(
    !bounceVerdict({ permanent: false, bounced: 1, delivered: 0 }).suppress,
    "a single soft bounce does not suppress",
  );
  assert(
    !bounceVerdict({ permanent: false, bounced: 20, delivered: 3 }).suppress,
    "an address that has ever been delivered to is never soft-suppressed",
  );
  assert(!bounceVerdict({}).suppress, "empty input defaults to not suppressing");
}

console.log("🧪 suppression matching is case/whitespace insensitive");
{
  assert(normalizeEmail("  Foo@Example.COM ") === "foo@example.com", "trimmed + lower-cased");
  assert(normalizeEmail(null) === "", "null is safe");
}

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll email delivery-integrity checks passed");
