// Content Planner — pure date↔pixel math for the timeline.
//
// The timeline is a fixed window of days. Horizontal position is linear in
// time: x = (date - origin) / day * pxPerDay. `pxPerDay` is the zoom level.
// Everything here is pure so it's easy to reason about and test.

export const DAY_MS = 24 * 60 * 60 * 1000;

// How far the timeline extends around today. Wide enough to scroll freely
// in phase 1; later phases can make this adaptive to content extent.
export const RANGE_DAYS_BACK = 365;
export const RANGE_DAYS_FWD = 365;
export const TOTAL_DAYS = RANGE_DAYS_BACK + RANGE_DAYS_FWD;

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Origin = midnight, RANGE_DAYS_BACK days before today (local time).
export function timelineOrigin(today = new Date()) {
  return addDays(startOfDay(today), -RANGE_DAYS_BACK);
}

export function dateToX(date, origin, pxPerDay) {
  return ((new Date(date).getTime() - origin.getTime()) / DAY_MS) * pxPerDay;
}

export function xToDayOffset(x, pxPerDay) {
  return x / pxPerDay; // in days from origin (can be fractional)
}

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// Zoom bounds derived from the viewport width:
//   min zoom → ~3 months (92 days) across the viewport
//   max zoom → ~3 days across the viewport
//   default  → ~4 weeks (28 days: 2 before + 2 after today)
export function zoomBounds(viewportWidth) {
  const w = Math.max(viewportWidth || 0, 320);
  return {
    min: w / 92,
    max: w / 3,
    default: w / 28,
  };
}

// Label cadence so day labels don't collide. Returns how many days between
// labelled ticks given the current zoom.
export function labelStepDays(pxPerDay) {
  const minLabelPx = 64;
  const raw = minLabelPx / pxPerDay;
  for (const step of [1, 2, 3, 7, 14, 30]) {
    if (step >= raw) return step;
  }
  return 30;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtDayTick(date) {
  return String(date.getDate());
}

export function fmtMonth(date) {
  const m = MONTHS[date.getMonth()];
  // Show the year only in January, to keep the axis quiet.
  return date.getMonth() === 0 ? `${m} ${date.getFullYear()}` : m;
}

export function fmtEventDate(date) {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
