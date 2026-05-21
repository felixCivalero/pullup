// Coach widget one-click mutations.
//
// The widget's suggestion buttons used to navigate the host to the right
// tab; some of them now perform the action AND navigate. Each mutation
// fetches the current event, appends one item idempotently (skip if it's
// already there), and PUTs the patched array — the existing PUT
// /host/events/:id endpoint handles persistence + emitIntent logging.

import { authenticatedFetch } from "./api.js";

async function getEvent(eventId) {
  const res = await authenticatedFetch(`/host/events/${eventId}`);
  if (!res.ok) throw new Error(`Couldn't load event (${res.status})`);
  return await res.json();
}

async function putEvent(eventId, patch) {
  const res = await authenticatedFetch(`/host/events/${eventId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Save failed (${res.status})`);
  }
  return await res.json();
}

// Default Spotify URL — matches the editor's "Add section" Spotify button so
// the host gets a working embed immediately and can swap in their own link.
const DEFAULT_SPOTIFY_URL = "https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT";

/** Append a Spotify section pre-filled with a default URL, matching the
 *  editor's "Add section" Spotify button byte-for-byte so the host lands on
 *  a working embed they can replace in one paste.
 *  Idempotent: skips if one already exists. */
export async function addSpotifySection(eventId) {
  const event = await getEvent(eventId);
  const sections = Array.isArray(event.sections) ? event.sections : [];
  if (sections.some((s) => s?.type === "spotify")) {
    return { ok: true, skipped: true, reason: "exists" };
  }
  const next = [...sections, { type: "spotify", url: DEFAULT_SPOTIFY_URL }];
  await putEvent(eventId, { sections: next });
  return { ok: true };
}

/** Append a required Instagram handle to the event's RSVP form fields.
 *  Matches RSVP_FIELD_PRESETS.instagram on the backend byte-for-byte so the
 *  public RSVP form / CRM enrichment / exports all see the same shape.
 *  Idempotent. */
export async function addInstagramField(eventId) {
  const event = await getEvent(eventId);
  const formFields = Array.isArray(event.formFields) ? event.formFields : [];
  if (formFields.some((f) => f?.type === "instagram")) {
    return { ok: true, skipped: true, reason: "exists" };
  }
  const field = {
    id: "ff_" + Math.random().toString(36).slice(2, 10),
    type: "instagram",
    label: "Instagram",
    placeholder: "Your Instagram username",
    iconKey: "instagram",
    color: "#E1306C",
    required: true,
  };
  await putEvent(eventId, { formFields: [...formFields, field] });
  return { ok: true };
}
