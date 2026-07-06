import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Cover media sizing — ONE simple rule, shared by the phone hero and the desktop
// hero: show the image AS IT IS. The hero takes the image's own aspect ratio and
// the whole image is shown (object-fit: contain) — no crop, no letterbox bars,
// no blurred backdrop, no per-surface "fit mode" to pick. A landscape photo gets
// a landscape hero; a vertical story gets a tall one. The image drives it.
//
// The ratio is known BEFORE paint — from dimensions stored at upload
// (media[i].width/height), or measured as a fallback — so the hero reserves its
// exact space with CSS `aspect-ratio`. No measure-then-reshape, no snap, no
// editor-vs-live drift.
//
// A loose clamp only guards against pathological ratios (a 1:8 sliver) that would
// break the layout; every normal photo passes through untouched.
// ─────────────────────────────────────────────────────────────────────────────

// aspect = width / height. Generous guardrails — normal images pass unchanged.
export const ASPECT_CLAMP = {
  phone: { min: 0.42, max: 2.1 },
  desktop: { min: 0.55, max: 2.1 },
};

// Fallback ratio when the image's true dimensions aren't known yet.
export const DEFAULT_ASPECT = 4 / 5;

// Clamp an aspect ratio into a surface's guardrails. Always returns a positive
// number; normal photos are returned unchanged.
export function clampAspect(aspect, surface = "phone") {
  const band = ASPECT_CLAMP[surface] || ASPECT_CLAMP.phone;
  const a = typeof aspect === "number" && aspect > 0 ? aspect : DEFAULT_ASPECT;
  return Math.min(band.max, Math.max(band.min, a));
}

// The hero frame style: reserve the exact (clamped) aspect box up front so there
// is nothing to reflow once the image loads. The image is shown whole (contain)
// inside it, and because the frame IS the image's ratio there are no bars.
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
// known so callers fall back to the default. `skip` avoids the network request
// when we already have stored dimensions.
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
