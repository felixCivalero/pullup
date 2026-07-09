// Shared builder for the host's COMPOSED per-event emails — the signup reveal,
// the waitlist-join note, and the waitlist-promote reveal. Centralising the
// token ctx + room-key mint means the fresh-RSVP path and every promotion path
// resolve the host's WYSIWYG body identically; they can't drift.
//
// A "reveal" (signup / waitlist-promote) carries {location} + {room link}; the
// join note carries neither (its token whitelist excludes them — see
// eventComms.js STEP_TOKENS). This module doesn't police tokens — it just
// resolves whatever the host wrote — so callers pass the right body.
import { getFrontendUrl } from "../lib/urls.js";
import { composedMessageEmail } from "../emails/signupConfirmation.js";
import {
  resolveCommsHtml,
  bodyNeedsRoomKey,
  getEventCommsConfig,
  commsCampaignTag,
} from "./eventComms.js";
import { dispatch as dispatchMessage } from "../messaging/index.js";

// Build the token ctx for an event. Mints a per-recipient room key ONLY when
// the body actually references {room link}/{upload link} — so the join note
// (no room token) never mints a key, and a waitlister can't be handed one.
export async function buildEventCommsCtx({ event, email, personId, body }) {
  let roomKeyUrl = "";
  if (bodyNeedsRoomKey(body) && event?.id && email) {
    try {
      const { mintRoomKey } = await import("./roomKeys.js");
      const rawKey = await mintRoomKey({
        email,
        eventId: event.id,
        personId: personId || null,
      });
      if (rawKey) roomKeyUrl = `${getFrontendUrl().replace(/\/$/, "")}/api/k/${rawKey}`;
    } catch (e) {
      console.error("[composedEventEmail] room key mint error:", e?.message);
    }
  }

  let timeText = "";
  try {
    timeText = event?.startsAt
      ? new Date(event.startsAt).toLocaleString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: event.timezone || undefined,
        })
      : "";
  } catch {
    timeText = "";
  }

  const lat = event?.locationLat;
  const lng = event?.locationLng;
  const hasCoords = lat != null && lng != null;
  const mapsCoords = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`
    : "";
  const mapsAddr = event?.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`
    : "";

  return {
    eventName: event?.title || "the event",
    time: timeText,
    location: event?.location || "",
    locationUrl: mapsCoords || mapsAddr || "",
    coordinates: hasCoords ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : "",
    coordinatesUrl: mapsCoords || "",
    roomUrl: roomKeyUrl,
    uploadUrl: roomKeyUrl,
  };
}

// Resolve a host's composed body → full branded email HTML.
export async function buildComposedEventEmailHtml({
  event,
  email,
  personId,
  body,
  badgeText = "YOU'RE IN",
  noticeBanner = null,
  hostBrand = {},
}) {
  const ctx = await buildEventCommsCtx({ event, email, personId, body });
  return composedMessageEmail({
    eventTitle: event?.title || "",
    badgeText,
    noticeBanner,
    imageUrl: event?.coverImageUrl || event?.imageUrl || "",
    bodyHtml: resolveCommsHtml(body, ctx),
    frontendUrl: getFrontendUrl(),
    ...hostBrand,
  });
}

// One entry point for "the host let this person in off the waitlist" — used by
// every promotion path (host promote, host bulk-promote, the free
// waitlist-link, and the paid Stripe webhook). Sends the host's composed
// waitlistPromote reveal, EMAIL-ONLY: the reveal carries {location} + {room
// link}, which the WhatsApp rsvp_confirm template can't. Respects the host's
// enabled toggle. Best-effort — never throws to the caller.
export async function sendWaitlistPromoteEmail({ event, rsvp, person, hostProfile }) {
  try {
    const email = person?.email || rsvp?.email;
    if (!email || !event?.id) return { sent: false, reason: "no_email" };

    const cfg = await getEventCommsConfig(event.id);
    if (!cfg.waitlistPromote?.enabled) return { sent: false, reason: "disabled" };

    const hostBrand = {
      brandName: hostProfile?.brand || "",
      brandWebsite: hostProfile?.brandWebsite || "",
      contactEmail: hostProfile?.contactEmail || "",
    };
    const html = await buildComposedEventEmailHtml({
      event,
      email,
      personId: person?.id || rsvp?.personId || null,
      body: cfg.waitlistPromote.body,
      badgeText: "YOU'RE IN",
      hostBrand,
    });

    await dispatchMessage({
      recipient: {
        id: person?.id || null,
        email,
        phone_e164: person?.phone_e164 || null,
        phone_verified_at: person?.phone_verified_at || null,
        do_not_contact: person?.do_not_contact || false,
      },
      hostProfile,
      // Email-only: the reveal (location + room) can't ride the WA template.
      whatsapp: null,
      email: {
        subject: "You’re in — a spot just opened",
        htmlBody: html,
      },
      context: {
        personId: person?.id || rsvp?.personId || null,
        hostProfileId: event?.hostId || null,
        campaignTag: commsCampaignTag("waitlistPromote", event?.id),
      },
    });
    return { sent: true };
  } catch (e) {
    console.error("[composedEventEmail] sendWaitlistPromoteEmail failed:", e?.message);
    return { sent: false, reason: "error" };
  }
}

// Catch-up reminder for a LATE promotion. The reminder scheduler fires once per
// event in a window around (start − hoursBefore); a guest let in AFTER that
// window has passed would otherwise never get it. So when we promote someone and
// the reminder is already overdue (past its send time, event not started yet),
// send it to them directly — reusing the scheduler's EXACT idempotency key
// (`reminder-24h-<event>-<person>`), so if they somehow already got it this is a
// no-op at the outbox and no one is ever double-reminded.
//
// Only fires when overdue: promoted BEFORE the send time → the scheduler will
// send it normally (guest is CONFIRMED by then); promoted after start → too late.
// A fresh late RSVP doesn't need this (they just got the full sign-up info); a
// long-ago waitlister finally let in does. Best-effort; never throws.
export async function sendCatchUpReminderIfDue({ event, person, hostProfile }) {
  try {
    const email = person?.email;
    if (!email || !event?.id || !event?.startsAt) return { sent: false, reason: "no_email" };

    const cfg = await getEventCommsConfig(event.id);
    const rc = cfg.reminder;
    // Dateless kinds return reminder.enabled=false, so this also skips them.
    if (!rc?.enabled) return { sent: false, reason: "disabled" };

    const startMs = new Date(event.startsAt).getTime();
    if (!Number.isFinite(startMs)) return { sent: false, reason: "no_start" };
    const now = Date.now();
    const sendAt = startMs - rc.hoursBefore * 3600000;
    // Not overdue yet → the scheduler owns it. Event already started → too late.
    if (now < sendAt || now >= startMs) return { sent: false, reason: "not_overdue" };

    const hostBrand = {
      brandName: hostProfile?.brand || "",
      brandWebsite: hostProfile?.brandWebsite || "",
      contactEmail: hostProfile?.contactEmail || "",
    };
    const ctx = await buildEventCommsCtx({ event, email, personId: person?.id || null, body: rc.body });
    const html = composedMessageEmail({
      eventTitle: event.title,
      badgeText: "HAPPENING SOON",
      imageUrl: event.coverImageUrl || event.imageUrl || "",
      bodyHtml: resolveCommsHtml(rc.body, ctx),
      frontendUrl: getFrontendUrl(),
      ...hostBrand,
    });
    let timePhrase = "soon";
    try {
      timePhrase = new Date(event.startsAt).toLocaleString("en-US", {
        weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false,
      });
    } catch {}
    const hostSig =
      hostProfile?.whatsappSignature ||
      (hostProfile?.name ? `It's me, ${hostProfile.name.split(/\s+/)[0]}` : "PullUp");

    await dispatchMessage({
      recipient: {
        id: person?.id || null,
        email,
        phone_e164: person?.phone_e164 || null,
        phone_verified_at: person?.phone_verified_at || null,
        do_not_contact: person?.do_not_contact || false,
      },
      hostProfile: hostProfile || { id: event.hostId },
      whatsapp: {
        templateKey: "event_reminder_24h",
        variables: {
          event_title: event.title || "the event",
          time_phrase: timePhrase,
          host_signature: hostSig,
        },
      },
      email: {
        subject: `"${event.title}" is coming up`,
        htmlBody: html,
        category: "transactional",
      },
      context: {
        personId: person?.id || null,
        hostProfileId: event.hostId || null,
        // Same key the scheduler uses → dedupes across both, both rails.
        idempotencyKey: `reminder-24h-${event.id}-${person?.id}`,
        campaignTag: commsCampaignTag("reminder", event.id),
        legalBasis: "legitimate_interest",
      },
    });
    return { sent: true };
  } catch (e) {
    console.error("[composedEventEmail] sendCatchUpReminderIfDue failed:", e?.message);
    return { sent: false, reason: "error" };
  }
}

// The full set of messages a guest should get the moment they're let in off the
// waitlist: the composed reveal (location + room) and, if the reminder is
// already overdue, a catch-up reminder so a late promotion still lands in the
// sequence. One call for every promotion path.
export async function sendWaitlistPromotionMessages({ event, rsvp, person, hostProfile }) {
  const reveal = await sendWaitlistPromoteEmail({ event, rsvp, person, hostProfile });
  const reminder = await sendCatchUpReminderIfDue({ event, person, hostProfile });
  return { reveal, reminder };
}
