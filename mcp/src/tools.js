// PullUp MCP tools — the surface Claude reaches for when the user talks
// about their events.
//
// Design notes:
//   - All tools accept `slug` (not `id`). Slugs are what the host sees in
//     URLs and are easier for Claude to round-trip. We resolve slug → id
//     internally for routes that need it.
//   - Single-event mutations (create/update/publish/unpublish) auto-open
//     the preview in the host's browser via openBrowser.js. Queries do
//     not auto-open (would spam windows).
//   - Errors throw; the server wraps them into structured tool errors.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

import { apiRequest, frontendUrl } from "./api.js";
import { openInBrowser } from "./openBrowser.js";
import { eventBanner, toolResultText, toolError } from "./format.js";

// Resolve slug → event id by listing the user's events. We could add a
// dedicated lookup endpoint, but `GET /events` is already authenticated,
// scoped to the caller's hosted events, and small (each host has tens of
// events at most). One round-trip per lookup is fine for v1.
async function resolveEventBySlug(slug) {
  if (!slug) throw new Error("slug is required");
  const events = await apiRequest("GET", "/events");
  const match = (events || []).find((e) => e.slug === slug);
  if (!match) {
    throw new Error(
      `No event found with slug "${slug}" on your account. Use list_events to see available slugs.`
    );
  }
  return match;
}

function previewUrlForSlug(slug) {
  return frontendUrl(`/e/${slug}`);
}
function shareUrlForSlug(slug) {
  // UTM-tagged share URL for paste-into-IG/etc. Falls through to the same
  // page; the param is just for analytics attribution.
  return `${previewUrlForSlug(slug)}?utm_source=mcp`;
}
function rsvpsDashboardForId(id) {
  return frontendUrl(`/host/events/${id}/guests`);
}

// ───────────────────────────────────────────────────────────────────────
// create_event
// ───────────────────────────────────────────────────────────────────────
const CreateEventInput = {
  title: z.string().describe("Event title."),
  startsAt: z.string().describe(
    "Start time as an ISO 8601 string with timezone offset, e.g. '2026-06-24T18:30:00+02:00'."
  ),
  endsAt: z.string().optional().describe("Optional end time, ISO 8601."),
  timezone: z.string().optional().describe(
    "IANA timezone, e.g. 'Europe/Stockholm'. Defaults to the host's local timezone."
  ),
  location: z.string().optional().describe("Public address or venue name."),
  description: z.string().optional(),
  maxAttendees: z.number().int().positive().optional(),
  imageUrl: z.string().optional().describe(
    "URL of a hosted cover image. Use upload_event_image first to get one."
  ),
  hideLocation: z.boolean().optional().describe(
    "If true, public pages and shares hide the address. Use revealHint for the public substitute."
  ),
  hideDate: z.boolean().optional().describe(
    "If true, public pages and shares hide the date/time. Use dateRevealHint for the public substitute. startsAt is still required (kept as a private placeholder for sorting/reminders)."
  ),
  revealHint: z.string().optional().describe(
    "Public substitute when hideLocation is true. E.g. \"DM @adam_flambo 'I'm in' to get details\"."
  ),
  dateRevealHint: z.string().optional().describe(
    "Public substitute when hideDate is true. E.g. 'Date announced soon'."
  ),
  status: z.enum(["DRAFT", "PUBLISHED"]).optional().describe(
    "Defaults to DRAFT so the host can preview before going public. Pass 'PUBLISHED' to publish immediately."
  ),
};

async function createEvent(args) {
  const status = args.status || "DRAFT";
  const payload = { ...args, status };
  const event = await apiRequest("POST", "/events", { body: payload });

  const preview = previewUrlForSlug(event.slug);
  openInBrowser(preview);

  const banner = eventBanner({
    title: event.title,
    status,
    previewUrl: preview,
    shareUrl: status === "PUBLISHED" ? shareUrlForSlug(event.slug) : null,
    rsvpsUrl: rsvpsDashboardForId(event.id),
    note: status === "DRAFT"
      ? `To publish: call publish_event with slug "${event.slug}", or update first.`
      : null,
  });
  return toolResultText(banner);
}

// ───────────────────────────────────────────────────────────────────────
// update_event
// ───────────────────────────────────────────────────────────────────────
const UpdateEventInput = {
  slug: z.string().describe("The event's slug (from create_event or list_events)."),
  ...Object.fromEntries(
    Object.entries(CreateEventInput)
      .filter(([k]) => k !== "title" && k !== "startsAt")
      .map(([k, v]) => [k, v.optional ? v.optional() : v])
  ),
  title: z.string().optional(),
  startsAt: z.string().optional(),
};

async function updateEvent(args) {
  const { slug, ...rest } = args;
  const existing = await resolveEventBySlug(slug);
  // Drop undefined fields so we don't accidentally null out other columns.
  const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  const updated = await apiRequest("PUT", `/host/events/${existing.id}`, { body: patch });

  const preview = previewUrlForSlug(updated.slug || slug);
  openInBrowser(preview);

  const banner = eventBanner({
    title: updated.title,
    status: updated.status || existing.status,
    previewUrl: preview,
    shareUrl: (updated.status || existing.status) === "PUBLISHED" ? shareUrlForSlug(updated.slug || slug) : null,
    rsvpsUrl: rsvpsDashboardForId(updated.id || existing.id),
    note: "Updated. Preview re-opened.",
  });
  return toolResultText(banner);
}

// ───────────────────────────────────────────────────────────────────────
// publish_event / unpublish_event
// ───────────────────────────────────────────────────────────────────────
const SlugOnlyInput = {
  slug: z.string().describe("The event's slug."),
};

async function publishEvent(args) {
  const existing = await resolveEventBySlug(args.slug);
  const updated = await apiRequest("PUT", `/host/events/${existing.id}/publish`);

  const preview = previewUrlForSlug(args.slug);
  openInBrowser(preview);

  return toolResultText(eventBanner({
    title: updated.title || existing.title,
    status: "PUBLISHED",
    previewUrl: preview,
    shareUrl: shareUrlForSlug(args.slug),
    rsvpsUrl: rsvpsDashboardForId(existing.id),
    note: "Note: share-preview caches on FB/IG/etc. may take ~24h to refresh after big edits.",
  }));
}

async function unpublishEvent(args) {
  const existing = await resolveEventBySlug(args.slug);
  const updated = await apiRequest("PUT", `/host/events/${existing.id}`, {
    body: { status: "DRAFT" },
  });

  return toolResultText(eventBanner({
    title: updated.title || existing.title,
    status: "DRAFT",
    previewUrl: previewUrlForSlug(args.slug),
    rsvpsUrl: rsvpsDashboardForId(existing.id),
    note: "Reverted to DRAFT. Existing RSVPs are kept. Note: social platforms keep their cached preview for ~24h.",
  }));
}

// ───────────────────────────────────────────────────────────────────────
// list_events
// ───────────────────────────────────────────────────────────────────────
const ListEventsInput = {
  status: z.enum(["DRAFT", "PUBLISHED", "ANY"]).optional().describe(
    "Filter by status. Defaults to ANY."
  ),
  upcomingOnly: z.boolean().optional().describe(
    "If true, only events with startsAt in the future."
  ),
  limit: z.number().int().positive().max(50).optional().describe("Max results. Default 20."),
};

async function listEvents(args) {
  const events = await apiRequest("GET", "/events");
  const now = Date.now();
  let filtered = events || [];
  if (args.status && args.status !== "ANY") {
    filtered = filtered.filter((e) => e.status === args.status);
  }
  if (args.upcomingOnly) {
    filtered = filtered.filter((e) => e.startsAt && new Date(e.startsAt).getTime() > now);
  }
  const limit = args.limit || 20;
  filtered = filtered.slice(0, limit);

  if (filtered.length === 0) {
    return toolResultText("No events match those filters.");
  }

  const lines = filtered.map((e) => {
    const when = e.startsAt
      ? new Date(e.startsAt).toLocaleString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "(no date)";
    return `  • ${e.title}  [${e.status}]  ${when}  → slug: ${e.slug}`;
  });
  return toolResultText(`${filtered.length} event${filtered.length === 1 ? "" : "s"}:\n${lines.join("\n")}`);
}

// ───────────────────────────────────────────────────────────────────────
// get_event
// ───────────────────────────────────────────────────────────────────────
async function getEvent(args) {
  const existing = await resolveEventBySlug(args.slug);
  // Pull guests for an accurate RSVP count. /host/events/:id/guests is the
  // authoritative source — the count on the event row can lag.
  let rsvpCount = null;
  let waitlistCount = null;
  try {
    const guests = await apiRequest("GET", `/host/events/${existing.id}/guests`);
    const list = Array.isArray(guests) ? guests : guests?.rsvps || [];
    rsvpCount = list.filter((g) => (g.bookingStatus || g.status) !== "WAITLIST" && (g.bookingStatus || g.status) !== "waitlist").length;
    waitlistCount = list.filter((g) => (g.bookingStatus || g.status) === "WAITLIST" || (g.bookingStatus || g.status) === "waitlist").length;
  } catch {
    // Non-fatal — show event details even if guest fetch fails.
  }

  const when = existing.startsAt
    ? new Date(existing.startsAt).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "(no date)";
  const where = existing.hideLocation
    ? `(hidden — public sees: "${existing.revealHint || "Location revealed later"}")`
    : (existing.location || "(no location)");

  const preview = previewUrlForSlug(existing.slug);
  const block = [
    `${existing.title} [${existing.status}]`,
    `  When:     ${when}${existing.hideDate ? " (HIDDEN — public sees TBA)" : ""}`,
    `  Where:    ${where}`,
    `  RSVPs:    ${rsvpCount ?? "?"} confirmed${existing.maxAttendees ? ` / ${existing.maxAttendees} cap` : ""}${waitlistCount ? ` (+${waitlistCount} waitlist)` : ""}`,
    "",
    `  Preview:  ${preview}`,
    existing.status === "PUBLISHED" ? `  Share:    ${shareUrlForSlug(existing.slug)}` : null,
    `  Guests:   ${rsvpsDashboardForId(existing.id)}`,
  ].filter(Boolean).join("\n");
  return toolResultText(block);
}

// ───────────────────────────────────────────────────────────────────────
// list_rsvps
// ───────────────────────────────────────────────────────────────────────
const ListRsvpsInput = {
  slug: z.string().describe("The event's slug."),
  status: z.enum(["confirmed", "waitlist", "any"]).optional().describe(
    "Filter by RSVP status. Defaults to any."
  ),
};

async function listRsvps(args) {
  const existing = await resolveEventBySlug(args.slug);
  const guests = await apiRequest("GET", `/host/events/${existing.id}/guests`);
  const list = Array.isArray(guests) ? guests : guests?.rsvps || [];

  let filtered = list;
  if (args.status === "confirmed") {
    filtered = list.filter((g) => {
      const s = (g.bookingStatus || g.status || "").toLowerCase();
      return s !== "waitlist";
    });
  } else if (args.status === "waitlist") {
    filtered = list.filter((g) => {
      const s = (g.bookingStatus || g.status || "").toLowerCase();
      return s === "waitlist";
    });
  }

  if (filtered.length === 0) {
    return toolResultText(`No RSVPs match for "${existing.title}".`);
  }

  const lines = filtered.map((g) => {
    const name = g.name || "(no name)";
    const email = g.email || "";
    const status = (g.bookingStatus || g.status || "").toUpperCase();
    const plusOnes = Number(g.plusOnes) || 0;
    const party = plusOnes > 0 ? ` +${plusOnes}` : "";
    return `  • ${name}${party}  [${status}]  ${email}`;
  });
  return toolResultText(
    `${existing.title} — ${filtered.length} RSVP${filtered.length === 1 ? "" : "s"}:\n${lines.join("\n")}`
  );
}

// ───────────────────────────────────────────────────────────────────────
// upload_event_image
// ───────────────────────────────────────────────────────────────────────
const UploadImageInput = {
  slug: z.string().describe(
    "The event's slug. The image will be set as that event's cover."
  ),
  filePath: z.string().describe(
    "Absolute path to a local image file (jpg, png, webp). Read by the MCP and uploaded to PullUp Storage."
  ),
};

const IMAGE_MIME = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function uploadEventImage(args) {
  const existing = await resolveEventBySlug(args.slug);
  const ext = path.extname(args.filePath).toLowerCase();
  const mime = IMAGE_MIME[ext];
  if (!mime) {
    throw new Error(`Unsupported image extension "${ext}". Use jpg, png, webp, or gif.`);
  }
  const buffer = await readFile(args.filePath);
  // The backend accepts a data URL in `imageData`. ~15MB is the express
  // json limit; warn the user if their file is much larger.
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw new Error(
      `Image is ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB. Please use a file under 10MB.`
    );
  }
  const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;

  await apiRequest("POST", `/host/events/${existing.id}/image`, {
    body: { imageData: dataUrl },
  });

  // The backend stores the image and updates the event. Re-open the preview
  // so the host sees the new cover immediately.
  const preview = previewUrlForSlug(existing.slug);
  openInBrowser(preview);

  return toolResultText(
    `Uploaded ${path.basename(args.filePath)} as the cover for "${existing.title}".\n\n  Preview: ${preview}`
  );
}

// ───────────────────────────────────────────────────────────────────────
// Registry — what the server exposes to Claude
// ───────────────────────────────────────────────────────────────────────
export const tools = [
  {
    name: "create_event",
    title: "Create a PullUp event",
    description:
      "Creates a new event on PullUp. Defaults to DRAFT so the host can preview before going public. Auto-opens the preview in the host's browser. Pass status='PUBLISHED' to publish immediately.",
    inputSchema: CreateEventInput,
    handler: createEvent,
  },
  {
    name: "update_event",
    title: "Update a PullUp event",
    description:
      "Updates fields on an existing event. Pass only the fields you want to change. Works on DRAFT and PUBLISHED events alike.",
    inputSchema: UpdateEventInput,
    handler: updateEvent,
  },
  {
    name: "publish_event",
    title: "Publish a DRAFT event",
    description:
      "Flips an event from DRAFT to PUBLISHED — makes it visible to the public and enables RSVPs.",
    inputSchema: SlugOnlyInput,
    handler: publishEvent,
  },
  {
    name: "unpublish_event",
    title: "Move an event back to DRAFT",
    description:
      "Hides an event from public listings and pauses new RSVPs. Existing RSVPs are kept. Social-platform share-preview caches keep the previously-public preview for ~24h.",
    inputSchema: SlugOnlyInput,
    handler: unpublishEvent,
  },
  {
    name: "list_events",
    title: "List the host's events",
    description:
      "Lists events owned or co-hosted by the authenticated user. Supports status and upcoming filters.",
    inputSchema: ListEventsInput,
    handler: listEvents,
  },
  {
    name: "get_event",
    title: "Get event details + RSVP count",
    description:
      "Returns details for one event by slug, including current confirmed and waitlisted RSVP counts and the share/preview URLs.",
    inputSchema: SlugOnlyInput,
    handler: getEvent,
  },
  {
    name: "list_rsvps",
    title: "List RSVPs for an event",
    description:
      "Returns the RSVP list (name, email, status, party size) for one event. Use status='confirmed' or 'waitlist' to filter.",
    inputSchema: ListRsvpsInput,
    handler: listRsvps,
  },
  {
    name: "upload_event_image",
    title: "Upload a cover image to an event",
    description:
      "Reads a local image file (jpg/png/webp/gif, ≤10MB) from the host's machine and sets it as the event's cover. Auto-opens the preview to show the new cover.",
    inputSchema: UploadImageInput,
    handler: uploadEventImage,
  },
];

// Wrap a handler so any thrown error is surfaced as a structured tool error
// instead of a hard crash. Claude sees a useful message, the MCP keeps
// running.
export function wrapHandler(handler) {
  return async (args) => {
    try {
      return await handler(args || {});
    } catch (err) {
      return toolError(err?.message || String(err));
    }
  };
}
