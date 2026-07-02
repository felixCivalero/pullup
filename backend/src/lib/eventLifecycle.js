// backend/src/lib/eventLifecycle.js
// THE one clock for event lifecycle. Twin of frontend/src/lib/eventLifecycle.js
// — keep them in sync.
//
// An event's stored status is only DRAFT/PUBLISHED; "ended" is derived from the
// date at read time. Before this helper, four call sites each rolled their own
// definition (editor: starts<now, dashboard: starts<now, public page:
// ends||starts, room phase: starts+12h). Lifecycle now means one thing:
// ended = the last knowable moment (ends_at, else starts_at) is behind us.
// (Room DOOR timing keeps its own 12h night fallback in computeEventPhase —
// that's about when doors close, not whether the event is over.)

export function hasEventEnded(startsAt, endsAt, nowMs = Date.now()) {
  const end = endsAt || startsAt;
  if (!end) return false;
  const t = new Date(end).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs > t;
}

// Listing status for dashboard strips: draft | live | past.
export function deriveEventListingStatus(status, startsAt, endsAt, nowMs = Date.now()) {
  const published = String(status || "").toUpperCase() === "PUBLISHED";
  if (!published) return "draft";
  return hasEventEnded(startsAt, endsAt, nowMs) ? "past" : "live";
}

// Do two date inputs name the same instant? Used to detect whether a write is
// actually CHANGING a date (formats differ between client ISO and DB ISO, so
// string equality is useless). null/undefined never equal anything — a missing
// side counts as "changed" so validation stays conservative.
export function sameInstant(a, b) {
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && ta === tb;
}
