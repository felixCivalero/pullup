// Pure-logic tests for the cover-format helpers. Runs under node's built-in
// runner: `node --test src/components/mediaFormat.test.js` (no React, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampAspect,
  normalizeFit,
  fitObjectFit,
  fitUsesBackdrop,
  fitCrops,
  heroFrame,
  storedAspect,
  ASPECT_CLAMP,
} from "./mediaFormat.js";

// clampAspect keeps the frame inside each surface's band, so nothing renders
// absurdly tall or wide regardless of what the host uploads.
test("clampAspect holds an in-band ratio unchanged", () => {
  assert.equal(clampAspect(1, "phone"), 1); // square is inside [9:16, 16:9]
});

test("clampAspect clamps a super-tall image to the phone tall limit", () => {
  assert.equal(clampAspect(0.2, "phone"), ASPECT_CLAMP.phone.min);
});

test("clampAspect clamps a panorama to the wide limit", () => {
  assert.equal(clampAspect(5, "phone"), ASPECT_CLAMP.phone.max);
});

test("clampAspect falls back to a sane default for unknown ratios", () => {
  assert.equal(clampAspect(null, "phone"), 4 / 5);
  assert.equal(clampAspect(0, "phone"), 4 / 5);
  assert.equal(clampAspect(-3, "phone"), 4 / 5);
});

test("desktop portraits are held to a taller floor than phone", () => {
  // A 2:3 portrait (0.667) is allowed on phone but clamped up on desktop.
  assert.equal(clampAspect(2 / 3, "desktop"), ASPECT_CLAMP.desktop.min);
  assert.equal(clampAspect(2 / 3, "phone"), 2 / 3);
});

// normalizeFit maps every legacy mode onto the new fill/fit model so old events
// keep rendering correctly with no data migration.
test("normalizeFit passes through the new fit field", () => {
  assert.equal(normalizeFit({ fit: "fit" }), "fit");
  assert.equal(normalizeFit({ fit: "fill" }), "fill");
});

test("normalizeFit maps legacy modes: height→fill, width/card→fit", () => {
  assert.equal(normalizeFit({ mode: "height" }), "fill");
  assert.equal(normalizeFit({ mode: "width" }), "fit");
  assert.equal(normalizeFit({ mode: "card" }), "fit");
});

test("normalizeFit maps legacy object-fit strings", () => {
  assert.equal(normalizeFit({ fit: "contain" }), "fit");
  assert.equal(normalizeFit({ fit: "cover" }), "fill");
});

test("normalizeFit defaults to the immersive fill", () => {
  assert.equal(normalizeFit({}), "fill");
  assert.equal(normalizeFit(undefined), "fill");
});

// fill fills + crops (cover, pannable); fit shows the whole image (contain) with
// a blurred backdrop. Keep these three in agreement.
test("fill → cover, crops, no backdrop", () => {
  assert.equal(fitObjectFit("fill"), "cover");
  assert.equal(fitCrops("fill"), true);
  assert.equal(fitUsesBackdrop("fill"), false);
});

test("fit → contain, no crop, blurred backdrop", () => {
  assert.equal(fitObjectFit("fit"), "contain");
  assert.equal(fitCrops("fit"), false);
  assert.equal(fitUsesBackdrop("fit"), true);
});

// heroFrame reserves the exact clamped-aspect box up front (no reflow).
test("heroFrame reserves a clamped aspect-ratio box", () => {
  assert.deepEqual(heroFrame(1, "phone"), { width: "100%", aspectRatio: "1" });
  assert.equal(heroFrame(9 / 16, "phone").aspectRatio, String(9 / 16));
});

// storedAspect prefers dimensions persisted at upload (known before paint).
test("storedAspect derives ratio from persisted width/height", () => {
  assert.equal(storedAspect([{ width: 1000, height: 500 }]), 2);
  assert.equal(storedAspect([{ width: 0, height: 0 }]), null);
  assert.equal(storedAspect([]), null);
  assert.equal(storedAspect(null), null);
});
