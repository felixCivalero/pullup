// Pure-logic tests for the cover-format helpers. Runs under node's built-in
// runner: `node --test src/components/mediaFormat.test.js` (no React, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import { modeObjectFit, modeCrops } from "./mediaFormat.js";

// "Fit width" promises the whole media is shown, nothing cropped. The only way
// to honor that when the hero frame's ratio can't perfectly match the media
// (desktop clamps a tall poster's height) is object-fit: contain. Using cover
// here is the bug that crops portrait posters on the live page.
test("width mode never crops → contain", () => {
  assert.equal(modeObjectFit("width"), "contain");
});

test("card mode never crops → contain", () => {
  assert.equal(modeObjectFit("card"), "contain");
});

// "Fit height" is the deliberate fill-and-pan mode — it is meant to crop.
test("height mode fills and crops → cover", () => {
  assert.equal(modeObjectFit("height"), "cover");
});

// Only height crops — keep this invariant aligned with modeObjectFit so the
// drag-to-reposition affordance and the object-fit agree on which mode crops.
test("the cropping mode and the cover mode are the same mode", () => {
  for (const mode of ["width", "height", "card"]) {
    assert.equal(modeCrops(mode), modeObjectFit(mode) === "cover");
  }
});

// Unknown/legacy values fall back to the non-cropping default (contain) so a
// bad value can never silently crop someone's media.
test("unknown mode defaults to the safe non-cropping fit", () => {
  assert.equal(modeObjectFit(undefined), "contain");
  assert.equal(modeObjectFit("bogus"), "contain");
});
