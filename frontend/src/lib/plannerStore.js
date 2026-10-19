// Content Planner — local view state only.
//
// Content (cards) and media now live in the database (planner_cards + Supabase
// Storage). The only thing kept in the browser is the per-device VIEWPORT
// (pan/zoom) — that's a view preference, not content, so losing it is fine and
// each device keeps its own.

const VIEWPORT_PREFIX = "pullup:planner:viewport:v1:";

export function layoutKey(userId) {
  return `${VIEWPORT_PREFIX}${userId || "anon"}`;
}

export function loadViewport(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    /* blocked/corrupt — fall back to default */
  }
  return null;
}

export function saveViewport(key, viewport) {
  try {
    localStorage.setItem(key, JSON.stringify(viewport));
  } catch {
    /* quota/blocked — viewport just won't persist this session */
  }
}

// Classify an uploaded file for how the card renders it.
export function mediaKind(mime) {
  if (!mime) return "file";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}
