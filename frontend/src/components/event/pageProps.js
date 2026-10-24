// One mapping from an event to the page components' props, shared by the
// public page (/e/:slug) and the editor's live preview — so what the editor
// shows is what a guest gets. The shape follows the old app's EventPage
// (branch pullup-app) minus tickets, rooms, scenes and products.
export function pageProps(event, { rsvpContent = null } = {}) {
  const signup = event.signupSettings || {};
  const ended = new Date(event.endsAt || event.startsAt || 0).getTime() < Date.now();
  return {
    title: event.titleSettings?.visible === false ? null : event.title,
    description: event.text || "",
    location: event.hideLocation ? null : event.location,
    locationLat: event.locationLat ?? null,
    locationLng: event.locationLng ?? null,
    showCoordinates: !!event.showCoordinates,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone || "Europe/Stockholm",
    media: event.media || [],
    mediaSettings: event.mediaSettings || {},
    imagePreview: event.imageUrl || null,
    ticketType: "free",
    isEventPast: !!event.startsAt && ended,
    isSoldOut: false,
    rsvpsPaused: false,
    sections: event.sections || [],
    design: null,
    hideLocation: !!event.hideLocation,
    hideDate: !!event.hideDate,
    revealHint: event.revealHint || null,
    dateRevealHint: event.dateRevealHint || null,
    rsvpContent,
    kind: "event",
    hideSignup: !!signup.hidden,
    signupLabel: signup.label || null,
    signupCta: signup.cta || null,
  };
}

export const DESKTOP_MIN_WIDTH = 1024;
