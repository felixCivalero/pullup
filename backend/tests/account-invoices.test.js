// Invoices and signals (lib/accountInvoices.js, routes/adminPlatform.js):
// lines per brand, the price, the CSV, and what's worth acting on.
import assert from "node:assert/strict";
import { amountFor, invoiceCsv, linesFor } from "../src/lib/accountInvoices.js";
import { signalsFor } from "../src/routes/adminPlatform.js";
import { shapeSettings } from "../src/lib/accountSettings.js";

assert.equal(amountFor(25000, 19.8), 495);
assert.equal(amountFor(1234, 15.5), 19.13);

const tagBrand = new Map([["t1", "b1"], ["t2", "b2"]]);
const brandName = new Map([["b1", "Aperol"], ["b2", "Jägermeister"]]);
const ledger = [
  { reason: "send", delta: -3000, campaign_tag: "t1" },
  { reason: "send", delta: -1000, campaign_tag: "t2" },
  { reason: "refund", delta: 200, campaign_tag: "t1" },
  { reason: "purchase", delta: 5000, campaign_tag: null },
];
// All of it unbilled: per brand, refunds counted.
assert.deepEqual(linesFor({ ledger, tagBrand, brandName, total: 3800 }), [
  { brandId: "b1", brand: "Aperol", sends: 2800 },
  { brandId: "b2", brand: "Jägermeister", sends: 1000 },
]);
// Part covered by a bought balance: only `total` billed, shared in proportion.
const part = linesFor({ ledger, tagBrand, brandName, total: 1900 });
assert.equal(part.reduce((n, l) => n + l.sends, 0), 1900);
assert.deepEqual(part.map((l) => l.brand), ["Aperol", "Jägermeister"]);
// No tags known: one line.
assert.deepEqual(linesFor({ ledger: [], tagBrand, brandName, total: 50 }), [{ brandId: null, brand: "Utskick", sends: 50 }]);

const csv = invoiceCsv(
  { number: "PU-2026-0001", periodFrom: null, periodTo: "2026-11-30T10:00:00Z", pricePer1000Sek: 19.8, amountSek: 495, vatSek: 123.75, totalSek: 618.75, lines: [{ brand: "Aperol; Spritz", sends: 25000, amountSek: 495 }] },
  { company: "Nigab AB", orgNumber: "556000-0000", billingEmail: "ekonomi@nigab.se" },
);
assert.ok(csv.startsWith("﻿"), "BOM so Excel reads åäö");
assert.ok(csv.includes('"Aperol; Spritz";25000;19,80;495,00'));
assert.ok(csv.includes("Att betala;;;618,75"));
assert.ok(csv.includes("Period;start – 2026-11-30"));

// Signals
const now = Date.parse("2026-11-10T12:00:00Z");
const inv = shapeSettings({ billing: "invoice", credit_limit: 10000, contract_until: "2026-11-25" });
const keys = (s) => s.map((x) => x.key);
assert.deepEqual(keys(signalsFor({ settings: inv, balance: -8500, now })), ["contract_ending", "credit_limit_near", "unbilled"]);
assert.deepEqual(keys(signalsFor({ settings: inv, balance: -10000, now })), ["credit_limit_reached", "contract_ending", "unbilled"]);
assert.deepEqual(keys(signalsFor({ settings: shapeSettings({ billing: "invoice", credit_limit: 0 }), balance: 0, now })), ["no_credit_limit"]);
assert.deepEqual(keys(signalsFor({ settings: shapeSettings(null), balance: 0, now, events: [
  { status: "PUBLISHED", title: "Tom", starts_at: "2026-11-15T18:00:00Z", signups: 0 },
  { status: "PUBLISHED", title: "Full", starts_at: "2026-11-15T18:00:00Z", signups: 40 },
  { status: "DRAFT", title: "Utkast", starts_at: "2026-11-15T18:00:00Z", signups: 0 },
] })), ["event_soon_empty"]);
assert.deepEqual(keys(signalsFor({ settings: shapeSettings(null), now, invoices: [
  { number: "PU-1", status: "sent", sentAt: "2026-09-01T00:00:00Z", createdAt: "2026-09-01T00:00:00Z" },
  { number: "PU-2", status: "draft", createdAt: "2026-10-01T00:00:00Z" },
  { number: "PU-3", status: "paid", sentAt: "2026-08-01T00:00:00Z", createdAt: "2026-08-01T00:00:00Z" },
] })), ["invoice_overdue", "invoice_unsent"]);
assert.deepEqual(signalsFor({ settings: shapeSettings(null), now }), [], "a normal account: nothing");
assert.deepEqual(keys(signalsFor({ settings: shapeSettings(null), balance: -300, now })), ["unbilled_card"], "switched back to card with sends unbilled: say so");

console.log("account-invoices: ok");
process.exit(0);
