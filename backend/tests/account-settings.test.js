// Account settings (lib/accountSettings.js, migs 163–164): the owner's patch
// is read safely, no row means a normal account, the owner is never limited,
// and an invoice customer's price and floor come out right.
import assert from "node:assert/strict";
import {
  DEFAULTS, LIST_PRICE_PER_1000, assertMayCreate, assertMayMail, assertMayPublish, floorFor, limitsPatch, priceFor, settingsPatch, shapeSettings,
} from "../src/lib/accountSettings.js";
import { CONFIRMATIONS_PER_ACCOUNT, mayConfirm, resetCounters } from "../src/lib/abuse.js";

// Limits
assert.deepEqual(limitsPatch({ mailBlocked: true, maxEvents: "5", note: "  spam  " }), { mail_blocked: true, max_events: 5, note: "spam" });
assert.deepEqual(limitsPatch({ maxEvents: "" }), { max_events: null });
assert.equal(limitsPatch({ maxEvents: "-1" }), null);
assert.equal(limitsPatch({ maxEvents: "abc" }), null);
assert.deepEqual(limitsPatch({ mailBlocked: "yes" }), {}, "only real booleans count");

// The deal
assert.deepEqual(settingsPatch({ billing: "invoice", creditLimit: "20000", pricePer1000Sek: "15,5", trusted: true, hideBranding: true }).patch,
  { billing: "invoice", credit_limit: 20000, price_per_1000_sek: 15.5, trusted: true, hide_branding: true });
assert.deepEqual(settingsPatch({ creditLimit: "" }).patch, { credit_limit: 0 });
assert.deepEqual(settingsPatch({ pricePer1000Sek: "" }).patch, { price_per_1000_sek: null });
assert.deepEqual(settingsPatch({ billing: "cash" }).bad, ["billing"]);
assert.deepEqual(settingsPatch({ billingEmail: "nope" }).bad, ["billingEmail"]);
assert.deepEqual(settingsPatch({ contractUntil: "2027-13-40" }).bad, ["contractUntil"]);
assert.deepEqual(settingsPatch({ contractUntil: "2027-06-30", dpaSignedAt: "" }).patch, { contract_until: "2027-06-30", dpa_signed_at: null });
assert.deepEqual(settingsPatch({ features: ["early_access", "early_access"] }).patch, { features: ["early_access"] });
assert.deepEqual(settingsPatch({ features: ["root"] }).bad, ["features"]);

assert.deepEqual(shapeSettings(null), DEFAULTS);
const inv = shapeSettings({ billing: "invoice", credit_limit: 20000, price_per_1000_sek: "15.50" });
assert.equal(inv.pricePer1000Sek, 15.5);
assert.equal(priceFor(inv), 15.5);
assert.equal(priceFor(DEFAULTS), LIST_PRICE_PER_1000);
assert.equal(LIST_PRICE_PER_1000, 12);
assert.equal(floorFor(inv), -20000);
assert.equal(floorFor(shapeSettings({ billing: "stripe", credit_limit: 500 })), 0, "a credit limit only counts for invoice customers");

// A trusted account gets ten times the hourly cap on confirmation mails.
resetCounters();
let ok = 0;
for (let i = 0; i < CONFIRMATIONS_PER_ACCOUNT + 50; i++) if (mayConfirm({ email: `g${i}@x.se`, hostId: "h1" })) ok++;
assert.equal(ok, CONFIRMATIONS_PER_ACCOUNT);
resetCounters();
ok = 0;
for (let i = 0; i < CONFIRMATIONS_PER_ACCOUNT + 50; i++) if (mayConfirm({ email: `g${i}@x.se`, hostId: "h2", trusted: true })) ok++;
assert.equal(ok, CONFIRMATIONS_PER_ACCOUNT + 50);

// The owner passes without a lookup.
const owner = { isOwner: true };
await assertMayMail(owner, "00000000-0000-0000-0000-000000000000");
await assertMayPublish(owner, "00000000-0000-0000-0000-000000000000");
await assertMayCreate(owner, "00000000-0000-0000-0000-000000000000");
console.log("account-settings: ok");
process.exit(0);
