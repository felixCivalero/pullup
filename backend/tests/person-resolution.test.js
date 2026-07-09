// Unit tests for the identity-resolution decision core — "who is this person?"
// The pure canonical-selection logic (no DB) that decides which existing person
// an RSVP's identifiers resolve to, email-anchored.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCanonicalPerson } from "../src/services/personResolution.js";

test("no matches → null canonical, no conflicts", () => {
  const r = pickCanonicalPerson([], { preferKind: "email" });
  assert.equal(r.canonicalId, null);
  assert.deepEqual(r.conflictIds, []);
});

test("single matched person → canonical, no conflicts", () => {
  const r = pickCanonicalPerson(
    [{ personId: "A", createdAt: "2026-01-01T00:00:00Z", kind: "email" }],
    {}
  );
  assert.equal(r.canonicalId, "A");
  assert.deepEqual(r.conflictIds, []);
});

test("one person owning several matched identities → deduped, no conflicts", () => {
  const r = pickCanonicalPerson(
    [
      { personId: "A", createdAt: "2026-01-01T00:00:00Z", kind: "email" },
      { personId: "A", createdAt: "2026-01-01T00:00:00Z", kind: "phone" },
    ],
    {}
  );
  assert.equal(r.canonicalId, "A");
  assert.deepEqual(r.conflictIds, []);
});

test("collision without preferKind → oldest wins, others flagged", () => {
  const r = pickCanonicalPerson(
    [
      { personId: "NEW", createdAt: "2026-05-01T00:00:00Z", kind: "email" },
      { personId: "OLD", createdAt: "2026-01-01T00:00:00Z", kind: "phone" },
    ],
    {}
  );
  assert.equal(r.canonicalId, "OLD");
  assert.deepEqual(r.conflictIds, ["NEW"]);
});

test("email-anchored: the email's person wins even when newer; the phone's person is flagged", () => {
  // The core safety rule: an RSVP attaches to whoever owns the typed email,
  // never silently to some older record the phone happened to match.
  const r = pickCanonicalPerson(
    [
      { personId: "EMAILP", createdAt: "2026-05-01T00:00:00Z", kind: "email" }, // newer
      { personId: "PHONEP", createdAt: "2026-01-01T00:00:00Z", kind: "phone" }, // older
    ],
    { preferKind: "email" }
  );
  assert.equal(r.canonicalId, "EMAILP");
  assert.deepEqual(r.conflictIds, ["PHONEP"]);
});

test("preferKind set but no email among matches → falls back to oldest", () => {
  // Email matched nobody; phone + verified-IG matched two different people.
  const r = pickCanonicalPerson(
    [
      { personId: "P1", createdAt: "2026-05-01T00:00:00Z", kind: "phone" },
      { personId: "P2", createdAt: "2026-01-01T00:00:00Z", kind: "ig_user_id" },
    ],
    { preferKind: "email" }
  );
  assert.equal(r.canonicalId, "P2");
  assert.deepEqual(r.conflictIds, ["P1"]);
});

test("email matched nobody, phone matched one person → that person, no conflicts (the dedup fix)", () => {
  const r = pickCanonicalPerson(
    [{ personId: "WA", createdAt: "2026-01-01T00:00:00Z", kind: "phone" }],
    { preferKind: "email" }
  );
  assert.equal(r.canonicalId, "WA");
  assert.deepEqual(r.conflictIds, []);
});

console.log("All person-resolution assertions passed");
