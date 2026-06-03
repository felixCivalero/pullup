// backend/src/services/roomPermissions.js
//
// The host-configurable CAPABILITY layer on top of the room's STATE machine.
//
//   STATE (getRoomAccess) = system-determined, load-bearing: rsvp(lobby) →
//     pulledup → locked. The host can NEVER hand someone a state (that's the
//     whole trust model — intent vs proof).
//   CAPABILITIES (here) = what the host lets each state DO. A tiny grid, on
//     purpose. Five capabilities × three states. Resist growing it.
//
// Empty/partial config falls back to these defaults, which match the shipped
// behaviour (waitlist can peek; lobby can read+post+see-who; pulled-up does all).

export const CAPABILITIES = ["read", "post", "seeWho", "upload", "download"];

// The three guest states, lowest → highest. The host can NEVER hand someone a
// state (intent vs proof); they only set what each state can DO.
export const ROOM_STATES = ["waitlist", "rsvp", "pulledup"];

export const DEFAULT_ROOM_PERMISSIONS = {
  // On the waitlist — hoping for a spot. Lowest key: peek at the buzz (see the
  // room filling), but don't take part yet. Host can open it up.
  waitlist: { read: true, post: false, seeWho: true,  upload: false, download: false },
  // RSVP'd, doors not open yet — the lobby. Open by default; host can lock down.
  rsvp:     { read: true, post: true,  seeWho: true,  upload: false, download: false },
  // Pulled up — earned the room. Everything on by default.
  pulledup: { read: true, post: true,  seeWho: true,  upload: true,  download: true },
};

// Map an access STATE to its capability KEY. "lobby" is the RSVP'd state.
function capKey(state) {
  if (state === "pulledup") return "pulledup";
  if (state === "waitlist") return "waitlist";
  return "rsvp"; // "lobby" / default
}

// Resolve the effective capabilities for an event at a given access state.
// state: "waitlist" | "lobby" (== rsvp config) | "pulledup".
export function resolveCapabilities(event, state) {
  const key = capKey(state);
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

// Clean host input into the stored shape (booleans only, every state present).
export function sanitizePermissions(input = {}) {
  const out = {};
  for (const key of ROOM_STATES) {
    const src = (input && input[key]) || {};
    out[key] = {};
    for (const c of CAPABILITIES) out[key][c] = src[c] === true;
  }
  out.pulledup.read = true; // inviolable
  return out;
}

// The full resolved grid for the Settings UI (all states, defaults applied).
export function resolveGrid(event) {
  return {
    waitlist: resolveCapabilities(event, "waitlist"),
    rsvp: resolveCapabilities(event, "lobby"),
    pulledup: resolveCapabilities(event, "pulledup"),
  };
}
