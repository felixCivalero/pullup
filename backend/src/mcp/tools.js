// PullUp MCP tools — the surface Claude reaches for when a host talks
// about their events from claude.ai / Claude Desktop / Claude Code.
//
// Design notes:
//   - Tools accept `slug` (not `id`). Slugs round-trip nicely in chat and
//     match what the host sees in URLs. Slug → id is resolved internally.
//   - All API calls go via the loopback REST API (see ./api.js). That
//     guarantees behavior matches what the website does.
//   - upload_event_image accepts an imageUrl or base64 (no local file
//     paths — claude.ai web has no filesystem access on the host machine).
//   - No browser auto-open: a remote MCP can't pop a window on Adam's
//     machine. We return preview/share URLs prominently in every response
//     so Claude shows them inline and Adam clicks through.

import { z } from "zod";

import { makeApi, frontendUrl } from "./api.js";
import { eventBanner, toolResultText, toolError } from "./format.js";

function previewUrlForSlug(slug) {
  return frontendUrl(`/e/${slug}`);
}
function shareUrlForSlug(slug) {
  // utm-tagged share URL for paste-into-IG/WhatsApp. Falls through to the
  // same page; the param is just for attribution.
  return `${previewUrlForSlug(slug)}?utm_source=mcp`;
}
function rsvpsDashboardForId(id) {
  return frontendUrl(`/host/events/${id}/guests`);
}

// Resolve slug → event by listing the user's events. GET /events is
// authenticated, scoped to the caller's hosted events, and small (tens of
// events per host). One round-trip per lookup is fine.
function resolveEventBySlugVia(api) {
  return async function (slug) {
    if (!slug) throw new Error("slug is required");
    const events = await api("GET", "/events");
    const match = (events || []).find((e) => e.slug === slug);
    if (!match) {
      throw new Error(
        `No event found with slug "${slug}" on your account. Use list_events to see available slugs.`
      );
    }
    return match;
  };
}

// ───────────────────────────────────────────────────────────────────────
// Schemas
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
    "URL of a hosted cover image. Tip: call list_cover_image_gallery first to reuse one of the host's existing images, or call upload_event_image after create to attach a new one."
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

const UpdateEventInput = {
  slug: z.string().describe("The event's slug (from create_event or list_events)."),
  ...Object.fromEntries(
    Object.entries(CreateEventInput).map(([k, v]) => [
      k,
      v.optional ? v.optional() : v,
    ])
  ),
  title: z.string().optional(),
  startsAt: z.string().optional(),
};

const SlugOnlyInput = {
  slug: z.string().describe("The event's slug."),
};

const ListEventsInput = {
  status: z.enum(["DRAFT", "PUBLISHED", "ANY"]).optional().describe(
    "Filter by status. Defaults to ANY."
  ),
  upcomingOnly: z.boolean().optional().describe(
    "If true, only events with startsAt in the future."
  ),
  limit: z.number().int().positive().max(50).optional().describe("Max results. Default 20."),
};

const ListRsvpsInput = {
  slug: z.string().describe("The event's slug."),
  status: z.enum(["confirmed", "waitlist", "any"]).optional().describe(
    "Filter by RSVP status. Defaults to any."
  ),
};

const UploadImageInput = {
  slug: z.string().describe(
    "The event's slug. The image will be set as that event's cover."
  ),
  imageUrl: z.string().optional().describe(
    "Public URL of an image (jpg/png/webp/gif, ≤10MB). The server fetches it and stores a copy."
  ),
  imageBase64: z.string().optional().describe(
    "Image as a base64 data URL ('data:image/png;base64,…') or raw base64 string. Use this when the host has attached an image to the conversation. ≤10MB."
  ),
};

const ListGalleryInput = {
  limit: z.number().int().positive().max(50).optional().describe(
    "Max images to return. Default 20."
  ),
};

// ───────────────────────────────────────────────────────────────────────
// Handlers
// ───────────────────────────────────────────────────────────────────────

function buildHandlers(api) {
  const resolveEventBySlug = resolveEventBySlugVia(api);

  async function createEvent(args) {
    const status = args.status || "DRAFT";
    const payload = { ...args, status };
    const event = await api("POST", "/events", { body: payload });

    const preview = previewUrlForSlug(event.slug);
    const banner = eventBanner({
      title: event.title,
      status,
      previewUrl: preview,
      shareUrl: status === "PUBLISHED" ? shareUrlForSlug(event.slug) : null,
      rsvpsUrl: rsvpsDashboardForId(event.id),
      note:
        status === "DRAFT"
          ? `To publish: call publish_event with slug "${event.slug}", or update first.`
          : null,
    });
    return toolResultText(banner);
  }

  async function updateEvent(args) {
    const { slug, ...rest } = args;
    const existing = await resolveEventBySlug(slug);
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined)
    );
    const updated = await api("PUT", `/host/events/${existing.id}`, { body: patch });

    const newSlug = updated.slug || slug;
    const status = updated.status || existing.status;
    return toolResultText(
      eventBanner({
        title: updated.title || existing.title,
        status,
        previewUrl: previewUrlForSlug(newSlug),
        shareUrl: status === "PUBLISHED" ? shareUrlForSlug(newSlug) : null,
        rsvpsUrl: rsvpsDashboardForId(updated.id || existing.id),
        note: "Updated.",
      })
    );
  }

  async function publishEvent(args) {
    const existing = await resolveEventBySlug(args.slug);
    const updated = await api("PUT", `/host/events/${existing.id}/publish`);
    return toolResultText(
      eventBanner({
        title: updated.title || existing.title,
        status: "PUBLISHED",
        previewUrl: previewUrlForSlug(args.slug),
        shareUrl: shareUrlForSlug(args.slug),
        rsvpsUrl: rsvpsDashboardForId(existing.id),
        note: "Note: FB/IG share-preview caches can take ~24h to refresh after big edits.",
      })
    );
  }

  async function unpublishEvent(args) {
    const existing = await resolveEventBySlug(args.slug);
    const updated = await api("PUT", `/host/events/${existing.id}`, {
      body: { status: "DRAFT" },
    });
    return toolResultText(
      eventBanner({
        title: updated.title || existing.title,
        status: "DRAFT",
        previewUrl: previewUrlForSlug(args.slug),
        rsvpsUrl: rsvpsDashboardForId(existing.id),
        note:
          "Reverted to DRAFT. Existing RSVPs are kept. Social-platform caches keep the previously-public preview ~24h.",
      })
    );
  }

  async function listEvents(args) {
    const events = await api("GET", "/events");
    const now = Date.now();
    let filtered = events || [];
    if (args.status && args.status !== "ANY") {
      filtered = filtered.filter((e) => e.status === args.status);
    }
    if (args.upcomingOnly) {
      filtered = filtered.filter(
        (e) => e.startsAt && new Date(e.startsAt).getTime() > now
      );
    }
    const limit = args.limit || 20;
    filtered = filtered.slice(0, limit);

    if (filtered.length === 0) return toolResultText("No events match those filters.");

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
    return toolResultText(
      `${filtered.length} event${filtered.length === 1 ? "" : "s"}:\n${lines.join("\n")}`
    );
  }

  async function getEvent(args) {
    const existing = await resolveEventBySlug(args.slug);
    let rsvpCount = null;
    let waitlistCount = null;
    try {
      const guests = await api("GET", `/host/events/${existing.id}/guests`);
      const list = Array.isArray(guests) ? guests : guests?.rsvps || [];
      rsvpCount = list.filter((g) => {
        const s = (g.bookingStatus || g.status || "").toLowerCase();
        return s !== "waitlist";
      }).length;
      waitlistCount = list.filter((g) => {
        const s = (g.bookingStatus || g.status || "").toLowerCase();
        return s === "waitlist";
      }).length;
    } catch {
      // non-fatal — still return event details
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
      : existing.location || "(no location)";

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
    ]
      .filter(Boolean)
      .join("\n");
    return toolResultText(block);
  }

  async function listRsvps(args) {
    const existing = await resolveEventBySlug(args.slug);
    const guests = await api("GET", `/host/events/${existing.id}/guests`);
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

  async function uploadEventImage(args) {
    const existing = await resolveEventBySlug(args.slug);

    let imageData;
    if (args.imageUrl) {
      const buf = await fetchAsBuffer(args.imageUrl);
      if (buf.byteLength > 10 * 1024 * 1024) {
        throw new Error(
          `Image is ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB. Please use a file under 10MB.`
        );
      }
      // Best-effort mime from the response is dropped here — the upload
      // endpoint accepts a data URL and derives extension from the mime
      // prefix. Default to png if we can't tell.
      const mime = sniffMime(buf) || "image/png";
      imageData = `data:${mime};base64,${buf.toString("base64")}`;
    } else if (args.imageBase64) {
      // Accept either a full data URL or raw base64. If raw, default to png.
      imageData = args.imageBase64.startsWith("data:")
        ? args.imageBase64
        : `data:image/png;base64,${args.imageBase64}`;
      const approxBytes = Math.floor((args.imageBase64.length * 3) / 4);
      if (approxBytes > 10 * 1024 * 1024) {
        throw new Error(
          `Image is ~${(approxBytes / 1024 / 1024).toFixed(1)}MB. Please use a file under 10MB.`
        );
      }
    } else {
      throw new Error("Provide either imageUrl or imageBase64.");
    }

    await api("POST", `/host/events/${existing.id}/image`, {
      body: { imageData },
    });

    return toolResultText(
      `Uploaded a new cover for "${existing.title}".\n\n  Preview: ${previewUrlForSlug(existing.slug)}`
    );
  }

  async function listCoverImageGallery(args) {
    const items = await api("GET", "/host/crm/event-image-gallery");
    const limit = args.limit || 20;
    const slice = (items || []).slice(0, limit);
    if (slice.length === 0) {
      return toolResultText(
        "No images in your gallery yet. Upload one with upload_event_image."
      );
    }
    const lines = slice.map((i, n) => `  ${n + 1}. ${i.url}    (from: ${i.eventTitle})`);
    return toolResultText(
      `${slice.length} image${slice.length === 1 ? "" : "s"} in your gallery:\n${lines.join("\n")}\n\nTo reuse one, pass its URL as imageUrl when calling create_event or update_event.`
    );
  }

  return {
    createEvent,
    updateEvent,
    publishEvent,
    unpublishEvent,
    listEvents,
    getEvent,
    listRsvps,
    uploadEventImage,
    listCoverImageGallery,
  };
}

async function fetchAsBuffer(url) {
  let resp;
  try {
    resp = await fetch(url);
  } catch (err) {
    throw new Error(`Could not fetch image URL: ${err.message}`);
  }
  if (!resp.ok) throw new Error(`Image URL returned HTTP ${resp.status}`);
  const ab = await resp.arrayBuffer();
  return Buffer.from(ab);
}

// Tiny magic-number sniffer so URL uploads round-trip with the right mime.
// We only handle the four formats the backend storage accepts.
function sniffMime(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  ) return "image/png";
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) return "image/webp";
  if (
    buf.length >= 6 &&
    (buf.toString("ascii", 0, 6) === "GIF87a" || buf.toString("ascii", 0, 6) === "GIF89a")
  ) return "image/gif";
  return null;
}

// ───────────────────────────────────────────────────────────────────────
// Registry
// ───────────────────────────────────────────────────────────────────────

export function buildTools(ctx) {
  const api = makeApi(ctx.token);
  const h = buildHandlers(api);
  return [
    {
      name: "create_event",
      title: "Create a PullUp event",
      description:
        "Creates a new event on PullUp. Defaults to DRAFT so the host can preview before going public. Returns the preview/share URLs. Pass status='PUBLISHED' to publish immediately.",
      inputSchema: CreateEventInput,
      handler: h.createEvent,
    },
    {
      name: "update_event",
      title: "Update a PullUp event",
      description:
        "Updates fields on an existing event. Pass only the fields you want to change. Works on DRAFT and PUBLISHED events alike.",
      inputSchema: UpdateEventInput,
      handler: h.updateEvent,
    },
    {
      name: "publish_event",
      title: "Publish a DRAFT event",
      description:
        "Flips an event from DRAFT to PUBLISHED — makes it visible to the public and enables RSVPs.",
      inputSchema: SlugOnlyInput,
      handler: h.publishEvent,
    },
    {
      name: "unpublish_event",
      title: "Move an event back to DRAFT",
      description:
        "Hides an event from public listings and pauses new RSVPs. Existing RSVPs are kept. Social-platform share-preview caches keep the previously-public preview for ~24h.",
      inputSchema: SlugOnlyInput,
      handler: h.unpublishEvent,
    },
    {
      name: "list_events",
      title: "List the host's events",
      description:
        "Lists events owned or co-hosted by the authenticated user. Supports status and upcoming filters.",
      inputSchema: ListEventsInput,
      handler: h.listEvents,
    },
    {
      name: "get_event",
      title: "Get event details + RSVP count",
      description:
        "Returns details for one event by slug, including current confirmed and waitlisted RSVP counts and the share/preview URLs.",
      inputSchema: SlugOnlyInput,
      handler: h.getEvent,
    },
    {
      name: "list_rsvps",
      title: "List RSVPs for an event",
      description:
        "Returns the RSVP list (name, email, status, party size) for one event. Use status='confirmed' or 'waitlist' to filter.",
      inputSchema: ListRsvpsInput,
      handler: h.listRsvps,
    },
    {
      name: "upload_event_image",
      title: "Upload a cover image to an event",
      description:
        "Sets a new cover image on an event. Provide an imageUrl (publicly fetchable) or imageBase64 (data URL or raw base64). ≤10MB.",
      inputSchema: UploadImageInput,
      handler: h.uploadEventImage,
    },
    {
      name: "list_cover_image_gallery",
      title: "List previously-used cover images",
      description:
        "Returns URLs of cover and media images the host has used on past events. Use this when the host says 'use one of my previous images' — pick a URL and pass it as imageUrl to create_event or update_event.",
      inputSchema: ListGalleryInput,
      handler: h.listCoverImageGallery,
    },
  ];
}

// Wrap a handler so any thrown error becomes a structured tool error
// instead of crashing the MCP request.
export function wrapHandler(handler) {
  return async (args) => {
    try {
      return await handler(args || {});
    } catch (err) {
      return toolError(err?.message || String(err));
    }
  };
}
