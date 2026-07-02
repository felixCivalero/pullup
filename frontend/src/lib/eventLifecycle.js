// frontend/src/lib/eventLifecycle.js
// THE one clock for event lifecycle. Twin of backend/src/lib/eventLifecycle.js
// — keep them in sync.
//
// An event's stored status is only DRAFT/PUBLISHED; "ended" is derived from the
// date at read time: ended = the last knowable moment (endsAt, else startsAt)
// is behind us.

export function hasEventEnded(startsAt, endsAt, nowMs = Date.now()) {
  const end = endsAt || startsAt;
  if (!end) return false;
  const t = new Date(end).getTime();
  if (!Number.isFinite(t)) return false;
  return nowMs > t;
}

// Do two date inputs name the same instant? Used to detect whether an edit is
// actually CHANGING a date (client and server ISO formats differ, so string
// equality is useless). A missing side counts as "changed" — conservative.
export function sameInstant(a, b) {
  if (!a || !b) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && ta === tb;
}
