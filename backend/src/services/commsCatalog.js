// backend/src/services/commsCatalog.js
//
// The comms studio's source of truth: every automatic send-out, rendered as it
// will actually look on each rail (email HTML + WhatsApp text) with THIS host's
// brand, signature, and optional custom note applied. Powers the Settings →
// Comms gallery (preview), the per-message note editor, and "send a test".
//
// What's editable vs locked (honest):
//   • brand (colors/font/logo) + signature → styling/voice, fully host-controlled
//   • per-message note → injected into the EMAIL body (WhatsApp templates are
//     Meta-locked, so the note never appears there)
//   • template WORDING → consistent-by-design (not free-text editable)

import {
  signupConfirmationEmail,
  reminder24hEmail,
  waitlistOfferEmail,
  reservationEmail,
  cancellationEmail,
  refundEmail,
} from "../emails/signupConfirmation.js";
import { TEMPLATES, renderTemplate, activeKey } from "../whatsapp/templates/registry.js";

// A representative event used purely to render previews.
const MOCK = {
  guestName: "Alex Rivera",
  firstName: "Alex",
  eventTitle: "Rooftop Sessions Vol. 4",
  startsAt: "2026-07-18T19:00:00+02:00",
  endsAt: "2026-07-18T23:00:00+02:00",
  timezone: "Europe/Stockholm",
  location: "Söder Rooftop, Stockholm",
  locationLat: 59.3138,
  locationLng: 18.0726,
  slug: "rooftop-sessions-4",
  eventId: "preview-event-id",
  imageUrl: "",
  whenPhrase: "Saturday 19:00",
};

// Resolve the host's voice bundle the same way the live send paths do.
// Host-customizable visual email branding was removed — emails always wear the
// PullUp default look — so this no longer builds a visual brand token bundle.
// brandName/brandWebsite/contactEmail remain (footer text + voice).
export function buildHostComms(hostProfile = {}) {
  const signature =
    hostProfile.whatsapp_signature || hostProfile.whatsappSignature ||
    (hostProfile.name ? `It's me, ${String(hostProfile.name).split(/\s+/)[0]}` : "PullUp");
  return {
    signature,
    brandName: hostProfile.brand || hostProfile.brandName || "",
    brandWebsite: hostProfile.brand_website || hostProfile.brandWebsite || "",
    contactEmail: hostProfile.contact_email || hostProfile.contactEmail || "",
  };
}

// The catalog. Each entry knows how to render its email + (optional) WhatsApp.
// `note` is the host's saved custom note for that message (from comms_overrides).
function catalog(b, frontendUrl) {
  const base = {
    eventTitle: MOCK.eventTitle, date: MOCK.whenPhrase, imageUrl: MOCK.imageUrl,
    location: MOCK.location, locationLat: MOCK.locationLat, locationLng: MOCK.locationLng,
    startsAt: MOCK.startsAt, endsAt: MOCK.endsAt,
    timezone: MOCK.timezone, slug: MOCK.slug, eventId: MOCK.eventId, frontendUrl,
    brandName: b.brandName, brandWebsite: b.brandWebsite, contactEmail: b.contactEmail,
  };
  const waSig = b.signature;
  return [
    {
      key: "rsvp_confirm",
      label: "RSVP confirmed",
      description: "Sent the moment a guest's spot is confirmed (free + paid).",
      email: (note) => ({ subject: "Your spot is confirmed", html: signupConfirmationEmail({ ...base, name: MOCK.guestName, isWaitlist: false, customNote: note }) }),
      wa: "rsvp_confirm",
      waVars: { guest_first_name: MOCK.firstName, event_title: MOCK.eventTitle, event_when: MOCK.whenPhrase, host_signature: waSig },
    },
    {
      key: "waitlist_added",
      label: "Added to waitlist",
      description: "Sent when an event is full and the guest joins the waitlist.",
      email: (note) => ({ subject: "You're on the waitlist", html: signupConfirmationEmail({ ...base, name: MOCK.guestName, isWaitlist: true, customNote: note }) }),
      wa: null,
    },
    {
      key: "waitlist_offer",
      label: "Waitlist spot opened",
      description: "Time-sensitive: a spot freed up and the guest can claim it.",
      email: (note) => ({ subject: "A spot has opened up!", html: waitlistOfferEmail({ ...base, name: MOCK.guestName, offerLink: `${frontendUrl}/e/${MOCK.slug}?wl=token`, isPaidEvent: true, expiresInMinutes: 360, customNote: note }) }),
      wa: "waitlist_promotion",
      waVars: { guest_first_name: MOCK.firstName, event_title: MOCK.eventTitle, link: `${frontendUrl}/e/${MOCK.slug}?wl=token` },
    },
    {
      key: "reminder_24h",
      label: "24-hour reminder",
      description: "Sent ~24h before the event to confirmed guests.",
      email: (note) => ({ subject: `${MOCK.eventTitle} is tomorrow`, html: reminder24hEmail({ ...base, name: MOCK.guestName, customNote: note }) }),
      wa: "event_reminder_24h",
      waVars: { event_title: MOCK.eventTitle, time_phrase: "tomorrow at 19:00", host_signature: waSig },
    },
    {
      key: "reservation",
      label: "Reservation (payment pending)",
      description: "Paid events: the spot is held while the guest completes payment.",
      email: (note) => ({ subject: "Your spot is reserved", html: reservationEmail({ ...base, name: MOCK.guestName, holdMinutes: 30, customNote: note }) }),
      wa: null,
    },
    {
      key: "cancellation",
      label: "Booking cancelled by host",
      description: "Sent when a host cancels a guest's booking.",
      email: () => ({ subject: "Your booking was cancelled", html: cancellationEmail({ ...base, name: MOCK.guestName }) }),
      // Must match the live send (index.js cancel/delete paths use booking_cancelled).
      wa: "booking_cancelled",
      waVars: { guest_first_name: MOCK.firstName, event_title: MOCK.eventTitle, host_signature: waSig },
      editableNote: false,
    },
    {
      key: "refund",
      label: "Refund processed",
      description: "Financial record — always email (kept in the inbox).",
      email: () => ({ subject: "Your refund was processed", html: refundEmail({ ...base, name: MOCK.guestName, refundAmount: "250", currency: "sek", isFullRefund: true }) }),
      wa: null,
      emailOnly: true,
      editableNote: false,
    },
  ];
}

// Render the full catalog for a host (previews + editability + saved notes).
export function renderComms({ hostProfile = {}, overrides = {}, frontendUrl = "https://pullup.se" }) {
  const b = buildHostComms(hostProfile);
  return catalog(b, frontendUrl).map((m) => {
    const note = (overrides?.[m.key]?.note || "").toString();
    let email = null;
    try { email = m.email(note); } catch (e) { email = { subject: "(preview failed)", html: `<p>${e.message}</p>` }; }
    let whatsapp = { available: false };
    // Preview the template that's actually LIVE for this message — the host-leads
    // _v2 once flipped, the original until then — so the studio never shows copy
    // a guest won't receive.
    const waKey = m.wa ? activeKey(m.wa) : null;
    if (waKey && TEMPLATES[waKey]) {
      let text = "";
      try { text = renderTemplate(waKey, m.waVars); } catch (e) { text = `(template error: ${e.message})`; }
      const status = TEMPLATES[waKey].status;
      // `live` = Meta has approved this template, so it can actually ship on
      // WhatsApp. Until then dispatch() routes this message to email — the UI
      // must say so rather than implying WhatsApp is already going out.
      whatsapp = { available: true, templateKey: waKey, status, live: status === "approved", text, locked: true };
    }
    return {
      key: m.key,
      label: m.label,
      description: m.description,
      channels: m.emailOnly ? ["email"] : (whatsapp.available ? ["whatsapp", "email"] : ["email"]),
      // The rail a guest actually receives today: WhatsApp only once approved.
      deliveredVia: whatsapp.live ? "whatsapp" : "email",
      email,
      whatsapp,
      note,
      editableNote: m.editableNote !== false,
    };
  });
}

export const MESSAGE_KEYS = ["rsvp_confirm", "waitlist_added", "waitlist_offer", "reminder_24h", "reservation", "cancellation", "refund"];
