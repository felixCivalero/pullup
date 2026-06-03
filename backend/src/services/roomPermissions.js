// backend/src/services/roomPermissions.js
//
// The host-configurable CAPABILITY layer on top of the room's STATE machine.
//
//   STATE (getRoomAccess) = system-determined, load-bearing: rsvp(lobby) →
//     pulledup → locked. The host can NEVER hand someone a state (that's the
//     whole trust model — intent vs proof).
//   CAPABILITIES (here) = what the host lets each state DO. A tiny grid, on
//     purpose. Five capabilities × two states. Resist growing it.
//
// Empty/partial config falls back to these defaults, which match the shipped
// behaviour (lobby can read+post+see-who; pulled-up can do everything).

export const CAPABILITIES = ["read", "post", "seeWho", "upload", "download"];

export const DEFAULT_ROOM_PERMISSIONS = {
  // RSVP'd, doors not open yet — the lobby. Open by default; host can lock down.
  rsvp:     { read: true, post: true,  seeWho: true,  upload: false, download: false },
  // Pulled up — earned the room. Everything on by default.
  pulledup: { read: true, post: true,  seeWho: true,  upload: true,  download: true },
};

// Resolve the effective capabilities for an event at a given access state.
// state: "lobby" (== rsvp config) | "pulledup".
export function resolveCapabilities(event, state) {
  const key = state === "pulledup" ? "pulledup" : "rsvp";
  const base = DEFAULT_ROOM_PERMISSIONS[key];
  const cfg = event?.room_permissions && typeof event.room_permissions === "object"
    ? (event.room_permissions[key] || {})
    : {};
  const out = {};
  for (const c of CAPABILITIES) {
    out[c] = typeof cfg[c] === "boolean" ? cfg[c] : base[c];
  }
  // Pulled-up read is inviolable — you earned the room, you can always see it.
  if (key === "pulledup") out.read = true;
  return out;
}

// Clean host input into the stored shape (booleans only, both states present).
export function sanitizePermissions(input = {}) {
  const out = {};
  for (const key of ["rsvp", "pulledup"]) {
    const src = (input && input[key]) || {};
    out[key] = {};
    for (const c of CAPABILITIES) out[key][c] = src[c] === true;
  }
  out.pulledup.read = true; // inviolable
  return out;
}

// The full resolved grid for the Settings UI (both states, defaults applied).
export function resolveGrid(event) {
  return {
    rsvp: resolveCapabilities(event, "lobby"),
    pulledup: resolveCapabilities(event, "pulledup"),
  };
}
