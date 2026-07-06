// Pure-logic tests for the cover-format helpers. Runs under node's built-in
// runner: `node --test src/components/mediaFormat.test.js` (no React, no DOM).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampAspect,
  heroFrame,
  storedAspect,
  ASPECT_CLAMP,
  DEFAULT_ASPECT,
} from "./mediaFormat.js";

// Normal photos pass through the guardrails untouched — the hero takes the
// image's own ratio and shows the whole image.
test("clampAspect leaves ordinary ratios unchanged", () => {
  assert.equal(clampAspect(1.5, "phone"), 1.5); // landscape photo
  assert.equal(clampAspect(0.75, "phone"), 0.75); // portrait
  assert.equal(clampAspect(9 / 16, "phone"), 9 / 16); // vertical story
});

test("clampAspect only guards pathological ratios", () => {
  assert.equal(clampAspect(0.1, "phone"), ASPECT_CLAMP.phone.min); // 1:10 sliver
  assert.equal(clampAspect(9, "phone"), ASPECT_CLAMP.phone.max); // extreme pano
});

test("clampAspect falls back to a sane default for unknown ratios", () => {
  assert.equal(clampAspect(null, "phone"), DEFAULT_ASPECT);
  assert.equal(clampAspect(0, "phone"), DEFAULT_ASPECT);
  assert.equal(clampAspect(-3, "phone"), DEFAULT_ASPECT);
});

// heroFrame reserves the exact aspect box up front (no reflow); width is always
// 100% and the height comes from the ratio.
test("heroFrame reserves the image's own aspect-ratio box", () => {
  assert.deepEqual(heroFrame(1.5, "phone"), { width: "100%", aspectRatio: "1.5" });
  assert.equal(heroFrame(0.75, "desktop").width, "100%");
});

// storedAspect prefers dimensions persisted at upload (known before paint).
test("storedAspect derives ratio from persisted width/height", () => {
  assert.equal(storedAspect([{ width: 2048, height: 1365 }]), 2048 / 1365);
  assert.equal(storedAspect([{ width: 0, height: 0 }]), null);
  assert.equal(storedAspect([]), null);
  assert.equal(storedAspect(null), null);
});
