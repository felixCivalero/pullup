// Pure-logic tests for the adaptive auth-method resolver. Runs under node's
// built-in runner: `node --test src/lib/authOrder.test.js` (no React, no Vite).
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAuthOrder } from "./authOrder.js";

const ALL_DELIVERABLE = { whatsapp: true, google: true, email: true };

test("Nairobi arrival leads with WhatsApp and demotes email to last", () => {
  const r = resolveAuthOrder({ timezone: "Africa/Nairobi", capabilities: ALL_DELIVERABLE });
  assert.equal(r.primary, "whatsapp");
  assert.deepEqual(r.order, ["whatsapp", "google", "email"]);
});

test("a WhatsApp-channel arrival leads with WhatsApp even outside a phone-first region", () => {
  const r = resolveAuthOrder({ arrivalChannel: "whatsapp", timezone: "America/New_York", capabilities: ALL_DELIVERABLE });
  assert.equal(r.primary, "whatsapp");
});

test("Western web arrival leads with Google, email present, WhatsApp last", () => {
  const r = resolveAuthOrder({ arrivalChannel: "web", timezone: "America/New_York", capabilities: ALL_DELIVERABLE });
  assert.equal(r.primary, "google");
  assert.deepEqual(r.order, ["google", "email", "whatsapp"]);
});

test("an email-campaign arrival leads with email", () => {
  const r = resolveAuthOrder({ arrivalChannel: "email", timezone: "America/New_York", capabilities: ALL_DELIVERABLE });
  assert.equal(r.primary, "email");
});

test("a known rail we can already reach wins over the regional default", () => {
  const r = resolveAuthOrder({ knownRails: ["whatsapp"], timezone: "America/New_York", capabilities: ALL_DELIVERABLE });
  assert.equal(r.primary, "whatsapp");
});

test("country code is a phone-first signal even without a matching timezone", () => {
  const r = resolveAuthOrder({ country: "KE", capabilities: ALL_DELIVERABLE });
  assert.equal(r.primary, "whatsapp");
});

// THE graceful-degradation case: Nairobi PREFERS WhatsApp, but the template
// isn't approved yet (whatsapp not deliverable). It must not offer a method that
// will hard-fail — drop it, fall to the next best, never crash, never empty.
test("a preferred-but-undeliverable WhatsApp degrades to the next method", () => {
  const r = resolveAuthOrder({ timezone: "Africa/Nairobi", capabilities: { whatsapp: false, google: true, email: true } });
  assert.ok(!r.order.includes("whatsapp"), "undeliverable whatsapp is filtered out");
  assert.equal(r.primary, "google");
  assert.deepEqual(r.order, ["google", "email"]);
});

test("never returns an empty list — at least the one deliverable method stands", () => {
  const r = resolveAuthOrder({ timezone: "Africa/Nairobi", capabilities: { whatsapp: false, google: false, email: true } });
  assert.deepEqual(r.order, ["email"]);
  assert.equal(r.primary, "email");
});

test("missing capabilities defaults to the safe reality (WhatsApp off until lit)", () => {
  const r = resolveAuthOrder({ timezone: "Africa/Nairobi" });
  assert.ok(!r.order.includes("whatsapp"));
  assert.equal(r.primary, "google");
});

test("no signals at all → a sane default order, never a crash", () => {
  const r = resolveAuthOrder();
  assert.equal(r.primary, "google");
  assert.ok(r.order.length >= 1);
});
