// Authorization boundary: a check-in (pull-up counts only) takes the lighter
// canCheckIn gate; anything touching a guest-list edit field needs canEditGuests.
// If this classifier drifts, a room curator could either edit guest records they
// shouldn't, or be blocked from pulling people up. Pure, so test it directly.

import assert from "node:assert";
import { isCheckinOnlyUpdate, GUEST_EDIT_FIELDS } from "../src/routes/checkinFields.js";

let failed = 0;
function t(name, fn) {
  try {
    fn();
    console.log("✅", name);
  } catch (e) {
    failed = 1;
    console.error("❌", name, "\n   ", e.message);
  }
}

console.log("🧪 isCheckinOnlyUpdate: check-in vs guest-edit");

// The real check-in payloads the frontend sends (pull-up counts only).
t("pull-up counts only → check-in", () => {
  assert.equal(isCheckinOnlyUpdate({
    dinnerPullUpCount: 2,
    cocktailOnlyPullUpCount: 0,
    pulledUpForDinner: 2,
    pulledUpForCocktails: null,
  }), true);
});

t("zeroed pull-up counts still a check-in (undo a pull-up)", () => {
  assert.equal(isCheckinOnlyUpdate({ dinnerPullUpCount: 0, cocktailOnlyPullUpCount: 0 }), true);
});

// Every guest-edit field must force the stricter gate, even alongside a count.
for (const field of GUEST_EDIT_FIELDS) {
  t(`'${field}' present → NOT a check-in`, () => {
    assert.equal(isCheckinOnlyUpdate({ dinnerPullUpCount: 1, [field]: "x" }), false);
  });
}

t("guest-edit field alone → NOT a check-in", () => {
  assert.equal(isCheckinOnlyUpdate({ name: "Ada" }), false);
});

// undefined fields are ignored (a guest-edit key set to undefined is a no-op).
t("guest-edit field set to undefined is ignored", () => {
  assert.equal(isCheckinOnlyUpdate({ dinnerPullUpCount: 1, name: undefined }), true);
});

// Edge cases: empty / non-object bodies are never a check-in (fall through to the
// stricter gate, which is the safe default).
t("empty body → not a check-in", () => assert.equal(isCheckinOnlyUpdate({}), false));
t("null body → not a check-in", () => assert.equal(isCheckinOnlyUpdate(null), false));
t("non-object → not a check-in", () => assert.equal(isCheckinOnlyUpdate("nope"), false));

if (failed) {
  console.error("\ncheckin-fields tests FAILED");
  process.exit(1);
}
console.log("\nAll checkin-fields tests passed");
