import { useEffect, useState } from "react";

// The three cover formats, shared by the editor picker and both renderers:
//   width  → media's L/R edges flush to the sides: full width, height by ratio,
//            whole media shown, nothing cropped.
//   height → media's T/B edges flush: fills the available height, width by ratio
//            (a wider-than-frame clip crops its sides; drag-to-reposition).
//   card   → media at its OWN ratio, floated with SPACE around every edge so the
//            whole thing is visible inside the viewport (no crop).
export const FORMAT_MODES = ["width", "height", "card"];

// Normalize a stored phone format (new `mode`, or legacy `fit`) to a mode.
// Legacy phone used objectFit: "cover" (fill+crop) / "contain" (show whole).
export function normalizePhoneMode(phone = {}, top = {}) {
  if (FORMAT_MODES.includes(phone?.mode)) return phone.mode;
  const fit = phone?.fit || top?.fit;
  if (fit === "contain") return "width"; // old "Real" = show the whole thing
  return "height"; // old "Fit"/cover = fill & crop (the full-bleed default)
}

// Normalize a stored desktop format. Legacy desktop used mode "fit" (4:5 crop)
// / "real" (16:9 crop), or an older `aspect` field.
export function normalizeDesktopMode(desktop = {}, top = {}) {
  if (FORMAT_MODES.includes(desktop?.mode)) return desktop.mode;
  if (desktop?.mode === "real") return "height";
  if (desktop?.mode === "fit") return "card";
  const aspect = desktop?.aspect ?? top?.aspect;
  if (aspect === "landscape") return "height";
  return "card";
}

// Only "height" crops (fills height, sides overflow) → the one mode worth
// dragging to reposition. "width" and "card" show the whole media, no crop.
export const modeCrops = (mode) => mode === "height";

// The object-fit a mode's media MUST use. This is the single source of truth for
// both renderers — keep it here so the phone and desktop paths can't drift.
//
// "width" and "card" promise the WHOLE media, nothing cropped, so they use
// `contain`: even when the hero frame's ratio can't match the media (e.g. the
// desktop layout clamps a tall poster's height with maxHeight, breaking the
// frame ratio), `contain` still shows every pixel. `cover` would crop there —
// that was the bug where "Fit width" cropped portrait posters on the live page.
// Only "height" — the deliberate fill-and-pan mode — uses `cover`.
export const modeObjectFit = (mode) => (mode === "height" ? "cover" : "contain");

// CSS for the hero frame given the mode and (for width) the media's measured
// aspect ratio. `fillHeight` is what "fill the available height" resolves to in
// the host layout (the phone viewport, the desktop column).
export function heroFrameStyle(mode, mediaAspect, { fillHeight = "100%" } = {}) {
  if (mode === "width") {
    return {
      width: "100%",
      aspectRatio: mediaAspect ? String(mediaAspect) : "4 / 5",
      maxHeight: "100%",
      maxWidth: "100%",
    };
  }
  if (mode === "height") {
    return { width: "100%", height: fillHeight };
  }
  // card → media's own ratio (the renderer pads space around it).
  return {
    width: "100%",
    aspectRatio: mediaAspect ? String(mediaAspect) : "4 / 5",
    maxHeight: "100%",
    maxWidth: "100%",
  };
}

// Measure a cover's intrinsic aspect ratio (width / height). Handles image and
// video covers; returns null until known so callers can fall back to 4:5.
export function useMediaAspect(media, imagePreview) {
  const first = (Array.isArray(media) && media[0]) || null;
  const url = first?.url || imagePreview || null;
  const isVideo = first?.mediaType === "video";
  const [aspect, setAspect] = useState(null);
  useEffect(() => {
    if (!url || typeof document === "undefined") {
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
  }, [url, isVideo]);
  return aspect;
}
