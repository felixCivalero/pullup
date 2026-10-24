// Bought sends: packs, the Checkout request, what a session is worth, and
// Stripe's webhook signature. Pure, no Stripe or database involved.
import crypto from "crypto";
import { PACKS, packById, checkoutParams, creditFromSession, safeReturnPath, verifyStripeSignature } from "../src/lib/emailCredits.js";

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures += 1; console.error("❌", msg); }
  else { console.log("✅", msg); }
}

assert(PACKS.map((p) => `${p.mails}:${p.priceSek}`).join() === "5000:99,25000:449,100000:1490", "three packs: 5 000 / 99, 25 000 / 449, 100 000 / 1 490");
assert(packById("m").mails === 25000 && packById("x") === null, "a pack is found by id, an unknown id is nothing");

const host = "f3394b03-0000-0000-0000-000000000000";
const p = checkoutParams({ pack: packById("s"), hostId: host, email: "a@b.se", frontendUrl: "https://pullup.se", returnPath: "/admin/mail?event=e1" });
assert(p.get("mode") === "payment" && p.get("line_items[0][price_data][unit_amount]") === "9900" && p.get("line_items[0][price_data][currency]") === "sek", "Checkout charges 99 kr once, in SEK");
assert(p.get("line_items[0][price_data][product_data][name]") === "5 000 mejlutskick", "the line item says what is bought");
assert(p.get("metadata[host_id]") === host && p.get("metadata[pack]") === "s", "the session carries host and pack");
assert(p.get("success_url") === "https://pullup.se/admin/mail?event=e1&credits=paid&session_id={CHECKOUT_SESSION_ID}", "back to the same page after paying, with the session id");
assert(!p.has("line_items[0][tax_rates][0]"), "no VAT line unless a tax rate is configured");
assert(checkoutParams({ pack: packById("s"), hostId: host, frontendUrl: "x", taxRateId: "txr_1" }).get("line_items[0][tax_rates][0]") === "txr_1", "a configured tax rate is added");

assert(safeReturnPath("https://evil.example") === "/admin/mail" && safeReturnPath("//evil.example") === "/admin/mail", "never returns to another site");
assert(safeReturnPath("/admin/events/abc-123") === "/admin/events/abc-123", "returns to an admin page");

const session = { object: "checkout.session", id: "cs_1", payment_status: "paid", amount_total: 9900, metadata: { kind: "email_credits", host_id: host, pack: "s", mails: "999999" } };
const row = creditFromSession(session);
assert(row && row.delta === 5000 && row.host_id === host && row.stripe_session_id === "cs_1" && row.amount_sek === 99, "a paid session is worth its pack (size from our table, not the metadata)");
assert(creditFromSession({ ...session, payment_status: "unpaid" }) === null, "an unpaid session is worth nothing");
assert(creditFromSession({ ...session, metadata: { ...session.metadata, kind: "subscription" } }) === null, "other Checkout sessions are ignored");
assert(creditFromSession({ ...session, metadata: { ...session.metadata, pack: "zz" } }) === null, "an unknown pack is worth nothing");

const secret = "whsec_test";
const body = JSON.stringify({ type: "checkout.session.completed" });
const t = 1_800_000_000;
const sig = crypto.createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
assert(verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, t + 10), "a correctly signed webhook passes");
assert(!verifyStripeSignature(body, `t=${t},v1=${sig}`, secret, t + 1000), "an old signature is refused");
assert(!verifyStripeSignature(body.replace("completed", "expired"), `t=${t},v1=${sig}`, secret, t), "a changed body is refused");
assert(!verifyStripeSignature(body, `t=${t},v1=${sig}`, "", t), "no secret configured = nothing passes");

if (failures) { console.error(`\n${failures} failure(s)`); process.exit(1); }
console.log("\nall email-credits tests passed");
