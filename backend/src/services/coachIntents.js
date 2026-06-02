// coachIntents — the bridge between the suggestion engine and one-tap UI
// buttons.
//
// suggestions.js returns items shaped {key, score, headline, why, call}
// where `call` is a human-readable MCP-tool hint. The web UI doesn't speak
// MCP-call-strings; it needs structured intents: where to navigate, which
// modal to open, which API to fire. That mapping lives here.
//
// Keys that don't map to a one-click intent today are dropped — the
// suggestion still exists, the analyzer is still right, the UI just doesn't
// surface it as a button. Add a case below to bring it in.

function eventEditUrl(event) {
  return `/app/events/${event.id}/edit`;
}

// Translate an analyzeEvent suggestion key into a UI intent. Returns null
// when the key has no clean one-tap shortcut.
//
// The `focus` field is read by the widget dispatcher: when the host is
// already on the editor and the intent URL matches the current page, the
// widget appends `?focus=<value>` instead of navigating. CreateEventPage
// reads that param and flips to the matching tab (with a brief gold flash
// so the host sees where to land).
export function keyToEventIntent(key, _suggestion, ctx) {
  const { event } = ctx;
  if (!event) return null;
  const edit = eventEditUrl(event);
  switch (key) {
    case "cover":
    case "video":
      // Media upload needs the host's eyes + file picker — keep as nav.
      return { type: "navigate", url: edit, focus: "media" };
    case "vibe":
      // One-click adds an empty Spotify section the host then fills in.
      return {
        type: "mutate",
        mutation: "add_spotify_section",
        afterUrl: edit,
        focus: "details",
      };
    case "description":
      return { type: "navigate", url: edit, focus: "details" };
    case "gating":
      // One-click adds the Instagram form field as required.
      return {
        type: "mutate",
        mutation: "add_instagram_field",
        afterUrl: edit,
        focus: "form",
      };
    case "plus_ones":
    case "ticketing":
      return { type: "navigate", url: edit, focus: "tickets" };
    case "series":
      // Series duplication is two-step (pick prior, then edit deltas) —
      // skip the one-click affordance until we have a "duplicate from"
      // shortcut in the create flow.
      return null;
    case "perf_capped":
      return {
        type: "navigate",
        url: `/app/events/${event.id}/guests?status=waitlist`,
      };
    case "perf_filling":
      return { type: "navigate", url: edit, focus: "tickets" };
    case "perf_low_conversion":
      return { type: "navigate", url: `/app/events/${event.id}/analytics` };
    default:
      return null;
  }
}

// analyzeCrmSignals keys → intents. Most signals are read-only ("who's
// worth a touch") so the button just routes to the segment view filtered
// to that cohort. v1 keeps it simple: tap → /crm with no extra filter.
export function keyToCrmIntent(_key, _suggestion) {
  return { type: "navigate", url: "/crm" };
}
