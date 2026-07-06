import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Cover media sizing — ONE model, shared by the phone hero, the desktop hero,
// and the editor's format picker. This is how the best apps (Instagram, Luma,
// Spotify, Resident Advisor) do it:
//
//   • The hero's SHAPE follows the image's own aspect ratio, CLAMPED into a
//     per-surface band so nothing renders absurdly tall or wide. A 9:16 story
//     fills the mobile hero; a 16:9 photo gets a wide hero; the image drives it.
//   • That ratio is known BEFORE paint — from dimensions stored at upload
//     (media[i].width/height), or measured as a fallback — so the frame reserves
//     its exact space with CSS `aspect-ratio`. No post-load reflow, no snap, no
//     editor-vs-live drift. That single fact kills the whole class of bugs we
//     used to fight (measure-then-reshape).
//   • Within the frame the host picks how the image sits:
//       fill → object-fit: cover — fills edge-to-edge, crops the overflow,
//              draggable focal point. The immersive / reel look. DEFAULT.
//       fit  → object-fit: contain — the whole image is always visible, and any
//              gap is filled with a blurred, zoomed copy of the same image
//              (the Spotify/RA trick) instead of dead black bars.
//   When the image already fits inside the clamp band, fill and fit look
//   identical — the blurred backdrop only ever shows for out-of-band ratios.
// ─────────────────────────────────────────────────────────────────────────────

// aspect = width / height. Per-surface clamp bands (min = tallest allowed,
// max = widest allowed). Tunable — these are the product's guardrails.
export const ASPECT_CLAMP = {
  phone: { min: 9 / 16, max: 16 / 9 }, // 0.5625 (tall reel) … 1.778 (wide)
  desktop: { min: 4 / 5, max: 16 / 9 }, // portraits stay sane on a big screen
};

// Fallback ratio when the image's true dimensions aren't known yet.
export const DEFAULT_ASPECT = 4 / 5;

// Clamp an aspect ratio into a surface's band. Always returns a positive number.
export function clampAspect(aspect, surface = "phone") {
  const band = ASPECT_CLAMP[surface] || ASPECT_CLAMP.phone;
  const a = typeof aspect === "number" && aspect > 0 ? aspect : DEFAULT_ASPECT;
  return Math.min(band.max, Math.max(band.min, a));
}

// The two ways an image can sit in the frame.
export const FIT_MODES = ["fill", "fit"];

// Normalize stored settings → "fill" | "fit". Accepts the new `fit` field and
// maps every legacy `mode` (width/height/card) and objectFit string onto it, so
// events saved under the old model keep rendering correctly with no migration.
export function normalizeFit(surface = {}, top = {}) {
  if (FIT_MODES.includes(surface?.fit)) return surface.fit;
  const mode = surface?.mode;
  if (mode === "height") return "fill"; // old full-bleed crop
  if (mode === "width" || mode === "card") return "fit"; // old whole-image modes
  const legacy = surface?.fit || top?.fit; // old object-fit string
  if (legacy === "contain") return "fit";
  if (legacy === "cover") return "fill";
  return "fill"; // default: immersive
}

// object-fit for a fit mode. fill → cover (fills + crops), fit → contain (whole).
export const fitObjectFit = (fit) => (fit === "fit" ? "contain" : "cover");

// Whether this fit paints a blurred backdrop behind the image (fit only).
export const fitUsesBackdrop = (fit) => fit === "fit";

// Whether this fit can crop → the focal-point drag affordance is meaningful.
export const fitCrops = (fit) => fit === "fill";

// The hero frame style: reserve the exact clamped-aspect box up front so there
// is nothing to reflow once the image loads.
export function heroFrame(aspect, surface = "phone") {
  return { width: "100%", aspectRatio: String(clampAspect(aspect, surface)) };
}

// The first cover item's aspect from dimensions PERSISTED at upload
// (media[i].width/height). Known before paint; prefer it over measuring.
// Returns null when dimensions aren't available (legacy rows / imagePreview).
export function storedAspect(media) {
  const first = (Array.isArray(media) && media[0]) || null;
  if (first && first.width > 0 && first.height > 0) {
    return first.width / first.height;
  }
  return null;
}

// Measure a cover's intrinsic aspect ratio (width / height) — the FALLBACK for
// media without stored dimensions. Handles image and video; returns null until
// known so callers fall back to the clamp default. `skip` avoids the network
// request when we already have stored dimensions.
export function useMediaAspect(media, imagePreview, skip = false) {
  const first = (Array.isArray(media) && media[0]) || null;
  const url = first?.url || imagePreview || null;
  const isVideo = first?.mediaType === "video";
  const [aspect, setAspect] = useState(null);
  useEffect(() => {
    if (skip || !url || typeof document === "undefined") {
      setAspect(null);
      return;
    }
    let alive = true;
    if (isVideo) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        if (alive && v.videoWidth && v.videoHeight) {
          setAspect(v.videoWidth / v.videoHeight);
        }
      };
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => {
        if (alive && img.naturalWidth && img.naturalHeight) {
          setAspect(img.naturalWidth / img.naturalHeight);
        }
      };
      img.src = url;
    }
    return () => {
      alive = false;
    };
  }, [url, isVideo, skip]);
  return aspect;
}

// Resolve the cover aspect: stored dimensions first (known before paint, no
// reflow), else the measured value, else null (caller clamps to the default).
export function useCoverAspect(media, imagePreview) {
  const stored = storedAspect(media);
  const measured = useMediaAspect(media, imagePreview, stored != null);
  return stored ?? measured;
}
