// backend/src/data.js — barrel over the per-domain repos (split 2026-06-10).
// The real code lives in src/repos/<domain>.js; this barrel keeps the many
// existing `from "./data.js"` call sites stable. New code should import from
// the specific repo directly.
export * from "./repos/events.js";
export * from "./repos/eventAccess.js";
export * from "./repos/vipInvites.js";
export * from "./repos/people.js";
export * from "./repos/planner.js";
export * from "./repos/personNotes.js";
export * from "./repos/rsvps.js";
export * from "./repos/payments.js";
export * from "./repos/profiles.js";
export * from "./repos/pats.js";
