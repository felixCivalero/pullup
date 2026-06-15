// ════════════════════════════════════════════════════════════════════════
// PAGE-KIND REGISTRY — the heart of the generalized page editor.
//
// There is ONE editor (the event editor) and ONE public renderer (the event
// page). This registry configures them per kind: which editor parts show, what
// the call-to-action is, what to hide (date/location/tickets), the public route
// prefix, and whether a host may have many or exactly one.
//
// Adding a new page type (product, waitlist, widget, …) is a config entry HERE —
// never a new editor. Events are kind "event" and get the full, unchanged set,
// so existing behavior is byte-identical.
//
// `parts` are the editor rail ids (must match RAIL ids in CreateEventPage).
// The hide* flags gate event-specific SUB-fields inside shared parts.
// ════════════════════════════════════════════════════════════════════════

export const PAGE_KINDS = {
  event: {
    id: "event",
    label: "Event page",
    noun: "event",
    // public page lives at /e/:slug
    routePrefix: "/e",
    // a host can make many events
    singleton: false,
    comingSoon: false,
    // editor rail parts (full set — events are unchanged)
    parts: ["cover", "theme", "content", "collect"],
    // event-specific sub-fields stay ON for events
    hideDate: false,
    hideLocation: false,
    hideTickets: false,
    // the register CTA — null label means "use the event editor's own logic"
    cta: { action: "rsvp", label: null },
  },

  community: {
    id: "community",
    label: "Community page",
    noun: "community",
    routePrefix: "/c",
    // exactly ONE community page per host (get-or-create, draft until published)
    singleton: true,
    comingSoon: false,
    // same rail as an event, minus nothing at the rail level — the date/place/
    // ticket SUB-fields are hidden via the flags below.
    parts: ["cover", "theme", "content", "collect"],
    hideDate: true,
    hideLocation: true,
    hideTickets: true,
    cta: { action: "join", label: "Join the community" },
  },

  product: {
    id: "product",
    label: "Product page",
    noun: "product",
    routePrefix: "/p",
    singleton: false,
    // not buildable yet — surfaced as "coming soon" in the create picker
    comingSoon: true,
    parts: ["cover", "theme", "content", "price"],
    hideDate: true,
    hideLocation: true,
    hideTickets: true,
    cta: { action: "buy", label: "Buy now" },
  },
};

// Order shown in the create picker.
export const PAGE_KIND_LIST = [PAGE_KINDS.event, PAGE_KINDS.community, PAGE_KINDS.product];

export function getPageKind(kind) {
  return PAGE_KINDS[kind] || PAGE_KINDS.event;
}

// Is a given editor rail part enabled for this kind?
export function isPartEnabled(kind, partId) {
  return getPageKind(kind).parts.includes(partId);
}
