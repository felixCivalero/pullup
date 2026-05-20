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

const UploadMediaInput = {
  slug: z.string().describe(
    "The event's slug. Media is attached to this event's gallery."
  ),
  mediaUrl: z.string().optional().describe(
    "Public URL of a media file. Preferred path — supports large files (up to 500MB for videos) because the server streams it directly to storage. Accepts jpg/png/webp/gif images and mp4/webm/mov videos."
  ),
  mediaBase64: z.string().optional().describe(
    "Media as a base64 data URL or raw base64. Use only for small inline images (≤40MB encoded, ≤30MB decoded). For videos or larger files, use mediaUrl."
  ),
  mediaType: z.enum(["image", "video"]).optional().describe(
    "Override autodetection. Auto-detected from mime type if omitted."
  ),
  setAsCover: z.boolean().optional().describe(
    "If true, sets this media as the event's cover image. For videos, the auto-generated thumbnail is used as the cover."
  ),
};

const CrmSummaryInput = {
  topN: z.number().int().positive().max(20).optional().describe(
    "How many top repeat-attendees and top events to include in the summary. Default 5."
  ),
};

const RevenueSummaryInput = {
  topN: z.number().int().positive().max(20).optional().describe(
    "How many top-revenue events to include. Default 5."
  ),
};

const TrendsInput = {
  months: z.number().int().positive().max(60).optional().describe(
    "How many recent months to include in the time series. Default 12."
  ),
};

const SegmentsInput = {
  topN: z.number().int().positive().max(20).optional().describe(
    "How many top spenders to include. Default 5."
  ),
};

const RecentActivityInput = {
  days: z.number().int().positive().max(365).optional().describe(
    "Look-back window in days. Default 30."
  ),
};

const EmailSummaryInput = {
  topN: z.number().int().positive().max(20).optional().describe(
    "How many top campaigns (by open rate) to include. Default 5."
  ),
};

// ─── Slice A — Events completion ──────────────────────────────────────

const EventAnalyticsInput = {
  slug: z.string().describe("The event's slug."),
  days: z.number().int().positive().max(365).optional().describe(
    "Look-back window in days. Default 30. Sets both current and prior comparison periods."
  ),
};

const DuplicateEventInput = {
  slug: z.string().describe("Slug of the source event to clone."),
  title: z.string().optional().describe(
    "Title for the new event. Defaults to '<original title> (copy)'."
  ),
  startsAt: z.string().optional().describe(
    "Start time for the new event (ISO 8601). Defaults to 7 days after the source event's start."
  ),
};

const DeleteEventInput = {
  slug: z.string().describe("The event's slug. Destructive — RSVPs and payments stay in the CRM, but the event itself is gone."),
  confirm: z.literal(true).describe(
    "Must be `true` to proceed. Forces a confirmation step so this can't be triggered accidentally by Claude."
  ),
};

// ─── Slice B — CRM completion ─────────────────────────────────────────

const FindPersonInput = {
  query: z.string().describe(
    "Free-text search across name, email, Instagram handle, and phone. Returns up to 20 matches."
  ),
};

const GetPersonInput = {
  personId: z.string().describe(
    "Person id (UUID). Use find_person first if you only have a name or email."
  ),
};

const QueryPeopleInput = {
  attendedEventSlug: z.string().optional().describe(
    "Limit to people who have attended this event (by slug)."
  ),
  eventsAttendedMin: z.number().int().nonnegative().optional().describe(
    "Only people with at least this many confirmed RSVPs across all events."
  ),
  eventsAttendedMax: z.number().int().nonnegative().optional().describe("Upper bound on event count."),
  totalSpendMinCents: z.number().int().nonnegative().optional().describe(
    "Minimum lifetime spend in cents (e.g. 5000 = $50)."
  ),
  totalSpendMaxCents: z.number().int().nonnegative().optional().describe("Upper bound on lifetime spend in cents."),
  tags: z.string().optional().describe(
    "Comma-separated list of tag strings. Matches people who have ALL listed tags."
  ),
  marketingConsentedOnly: z.boolean().optional().describe(
    "If true, only people who opted in to marketing (sendable for campaigns)."
  ),
  limit: z.number().int().positive().max(200).optional().describe("Max results. Default 50."),
};

const UpdatePersonInput = {
  personId: z.string().describe("Person id (UUID)."),
  name: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional().describe(
    "Full replacement tag list. Pass [] to clear all tags."
  ),
  instagram: z.string().optional(),
  twitter: z.string().optional(),
  tiktok: z.string().optional(),
  linkedin: z.string().optional(),
  company: z.string().optional(),
  birthday: z.string().optional().describe("Free-form birthday string (e.g. '1992-04-17' or 'April 17')."),
};

// ─── Slice C — Email completion ───────────────────────────────────────

const ListCampaignsInput = {
  status: z.enum(["draft", "scheduled", "sending", "sent", "failed", "any"]).optional().describe(
    "Filter by campaign status. Defaults to any."
  ),
  limit: z.number().int().positive().max(100).optional().describe("Max results. Default 20."),
};

const GetCampaignInput = {
  campaignId: z.string().describe("Campaign id (UUID)."),
};

const DraftCampaignInput = {
  subject: z.string().describe("Email subject line."),
  eventSlug: z.string().describe(
    "Slug of the event this campaign is about. Required — campaigns are always anchored to an event in PullUp."
  ),
  templateType: z.enum(["event", "followup"]).optional().describe(
    "'event' = pre-event invite/announcement. 'followup' = post-event recap/thanks. Default 'event'."
  ),
  message: z.string().optional().describe(
    "Plain-text body for the email. Used as the main message block. Optional — campaigns can be drafted with just a subject and refined later in the UI."
  ),
  filterAttendedEventSlug: z.string().optional().describe(
    "Audience filter: only people who attended this event. Most useful for 'followup' templates."
  ),
  filterTags: z.string().optional().describe(
    "Audience filter: comma-separated tag list. Matches people with ALL listed tags."
  ),
};

const SendCampaignInput = {
  campaignId: z.string().describe("Campaign id from draft_campaign or list_campaigns."),
  confirm: z.literal(true).describe(
    "Must be `true` to proceed. Forces a confirmation step so Claude can't fire a send without explicit user approval."
  ),
};

// ─── Slice D — Guest actions ──────────────────────────────────────────

const UpdateRsvpInput = {
  eventSlug: z.string().describe("Slug of the event."),
  rsvpEmail: z.string().describe(
    "Email of the guest whose RSVP to update. Use list_rsvps to find emails."
  ),
  action: z.enum(["check_in", "promote_from_waitlist", "cancel"]).describe(
    "'check_in' marks the guest as pulled-up. 'promote_from_waitlist' moves a WAITLIST RSVP to CONFIRMED (and triggers the confirmation email). 'cancel' cancels the booking (and triggers a cancellation email; refunds for paid events must be done with refund_payment)."
  ),
};

const RefundPaymentInput = {
  eventSlug: z.string().describe("Slug of the event."),
  payerEmail: z.string().describe(
    "Email of the guest who paid. The tool finds their payment for this event."
  ),
  amountCents: z.number().int().positive().optional().describe(
    "Refund amount in cents. Omit for a full refund (or the remaining unrefunded amount if a partial refund was already issued)."
  ),
  reason: z.string().optional().describe("Free-text reason recorded with the refund."),
  moveToWaitlist: z.boolean().optional().describe(
    "If true (default), the refunded RSVP is moved back to WAITLIST so the host can re-promote later. Set false to leave it cancelled."
  ),
  confirm: z.literal(true).describe(
    "Must be `true`. Refunds move real money and email the guest — never auto-fire from a model inference."
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
      // /host/events/:id/guests returns { event, guests } — not a bare array
    // and not { rsvps }. Older code paths used `rsvps`, so accept both.
    const list = Array.isArray(guests)
      ? guests
      : guests?.guests || guests?.rsvps || [];
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
    // /host/events/:id/guests returns { event, guests } — not a bare array
    // and not { rsvps }. Older code paths used `rsvps`, so accept both.
    const list = Array.isArray(guests)
      ? guests
      : guests?.guests || guests?.rsvps || [];

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

  async function uploadEventMedia(args) {
    const existing = await resolveEventBySlug(args.slug);
    if (!args.mediaUrl && !args.mediaBase64) {
      throw new Error("Provide either mediaUrl or mediaBase64.");
    }

    // ── URL path: stream-fetch and upload via signed Supabase URL ──
    // This bypasses the 50MB /mcp body limit entirely because the bytes
    // never traverse the MCP JSON-RPC envelope — the server fetches the
    // remote URL, then PUTs to a Supabase-issued upload URL.
    if (args.mediaUrl) {
      const headResp = await fetch(args.mediaUrl, { method: "HEAD" }).catch(() => null);
      const ctype = headResp?.headers?.get?.("content-type") || "";
      const detectedType = args.mediaType || inferMediaTypeFromMime(ctype) || inferMediaTypeFromUrl(args.mediaUrl);
      if (!detectedType) {
        throw new Error("Could not detect media type. Pass mediaType: 'image' or 'video' to override.");
      }
      const mime = ctype && /^(image|video)\//.test(ctype)
        ? ctype.split(";")[0]
        : detectedType === "video"
          ? "video/mp4"
          : "image/jpeg";

      const sizeHeader = Number(headResp?.headers?.get?.("content-length") || 0);
      const maxBytes = detectedType === "video" ? 500 * 1024 * 1024 : 50 * 1024 * 1024;
      if (sizeHeader && sizeHeader > maxBytes) {
        throw new Error(
          `Media is ${(sizeHeader / 1024 / 1024).toFixed(1)}MB. Limit is ${maxBytes / 1024 / 1024}MB for ${detectedType}s.`
        );
      }

      // Mint a signed upload URL scoped to this event.
      const tokenResp = await api("POST", `/host/events/${existing.id}/storage-token`, {
        body: { mimeType: mime, kind: "main", position: 0 },
      });
      if (!tokenResp?.uploadUrl || !tokenResp?.path) {
        throw new Error("Failed to mint upload URL.");
      }

      // Stream the remote file into the signed Supabase URL. fetch().body
      // is a ReadableStream; we PUT it directly. Node 20+ handles this.
      const src = await fetch(args.mediaUrl);
      if (!src.ok) throw new Error(`Source URL returned HTTP ${src.status}.`);
      const uploadResp = await fetch(tokenResp.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": mime,
          // Supabase signed-upload accepts the body without further auth.
        },
        body: src.body,
        duplex: "half",
      });
      if (!uploadResp.ok) {
        const text = await uploadResp.text().catch(() => "");
        throw new Error(`Storage upload failed: ${uploadResp.status} ${text.slice(0, 200)}`);
      }

      // Register the uploaded media against the event. For videos, the
      // existing /media endpoint expects an optional thumbnail; we skip
      // it for now (Supabase doesn't auto-generate video thumbnails and
      // the host can swap one in via the dashboard if needed).
      await api("POST", `/host/events/${existing.id}/media`, {
        body: {
          storagePath: tokenResp.path,
          mediaType: detectedType,
          mimeType: mime,
          position: 0,
        },
      });

      // If asked to set as cover and it's an image, update the event's
      // cover. For videos, the first item is auto-marked cover by the
      // media endpoint; otherwise the host can promote via the dashboard.
      if (args.setAsCover && detectedType === "image") {
        await api("POST", `/host/events/${existing.id}/image`, {
          body: { storagePath: tokenResp.path },
        });
      }

      return toolResultText(
        `Uploaded ${detectedType} (${sizeHeader ? Math.round(sizeHeader / 1024 / 1024 * 10) / 10 + "MB" : "size unknown"}) to "${existing.title}".\n  Preview: ${previewUrlForSlug(existing.slug)}`
      );
    }

    // ── Base64 path: small inline media only ──
    const detectedType = args.mediaType || inferMediaTypeFromBase64(args.mediaBase64) || "image";
    const mime = sniffMimeFromBase64(args.mediaBase64) || (detectedType === "video" ? "video/mp4" : "image/png");
    const approxBytes = Math.floor((args.mediaBase64.length * 3) / 4);
    const maxBytes = detectedType === "video" ? 30 * 1024 * 1024 : 30 * 1024 * 1024;
    if (approxBytes > maxBytes) {
      throw new Error(
        `Inline media is ~${(approxBytes / 1024 / 1024).toFixed(1)}MB. For files this large, use mediaUrl instead.`
      );
    }

    const dataUrl = args.mediaBase64.startsWith("data:")
      ? args.mediaBase64
      : `data:${mime};base64,${args.mediaBase64}`;

    await api("POST", `/host/events/${existing.id}/media`, {
      body: {
        mediaData: dataUrl,
        mediaType: detectedType,
        mimeType: mime,
        position: 0,
      },
    });

    return toolResultText(
      `Uploaded ${detectedType} (~${(approxBytes / 1024 / 1024).toFixed(1)}MB) to "${existing.title}".\n  Preview: ${previewUrlForSlug(existing.slug)}`
    );
  }

  async function getCrmSummary(args) {
    const topN = args.topN || 5;

    // Single round-trip — backend calls Postgres host_crm_summary() which
    // does all the aggregation in one query plan. Shape:
    //   { events: {total, published, draft, upcoming, past},
    //     rsvps:  {confirmed, waitlist, unique_people, total_plus_ones, dinners},
    //     topAttendees: [{id, name, email, events_attended}, …],
    //     topEvents:    [{id, title, slug, attendance}, …] }
    const data = await api("GET", "/host/crm/summary", { query: { topN } });
    const ev = data?.events || {};
    const rs = data?.rsvps || {};
    const topAttendees = Array.isArray(data?.topAttendees) ? data.topAttendees : [];
    const topEvents = Array.isArray(data?.topEvents) ? data.topEvents : [];

    const lines = [
      `Events:    ${ev.total ?? 0} total (${ev.published ?? 0} published, ${ev.draft ?? 0} draft) — ${ev.upcoming ?? 0} upcoming, ${ev.past ?? 0} past`,
      `People:    ${rs.unique_people ?? 0} unique guests in your CRM`,
      `RSVPs:     ${rs.confirmed ?? 0} confirmed${rs.waitlist ? ` (+${rs.waitlist} waitlist)` : ""}${rs.total_plus_ones ? `, ${rs.total_plus_ones} plus-ones brought` : ""}`,
      rs.dinners ? `Dinners:   ${rs.dinners} dinner bookings` : null,
    ].filter(Boolean);

    if (topAttendees.length > 0) {
      lines.push("");
      lines.push(`Top ${topAttendees.length} repeat attendees:`);
      for (const p of topAttendees) {
        const name = p.name || p.email || "(no name)";
        const n = Number(p.events_attended) || 0;
        lines.push(`  • ${name}  —  ${n} event${n === 1 ? "" : "s"}`);
      }
    }

    if (topEvents.length > 0) {
      lines.push("");
      lines.push(`Top ${topEvents.length} events by attendance:`);
      for (const e of topEvents) {
        const slug = e.slug ? `  → slug: ${e.slug}` : "";
        lines.push(`  • ${e.title || "(untitled)"}  —  ${e.attendance} confirmed${slug}`);
      }
    }

    return toolResultText(lines.join("\n"));
  }

  // Format a cents amount in the given currency. Avoids Intl.NumberFormat
  // edge cases by formatting manually (cents → major units, with the
  // currency code suffixed).
  function fmtMoney(cents, currency = "usd") {
    const major = (Number(cents) || 0) / 100;
    const code = String(currency || "usd").toUpperCase();
    const num = major.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${num} ${code}`;
  }

  function pct(n) {
    if (n === null || n === undefined) return "—";
    return `${Number(n).toFixed(1)}%`;
  }

  async function getRevenueSummary(args) {
    const topN = args.topN || 5;
    const d = await api("GET", "/host/crm/revenue", { query: { topN } });
    const t = d?.totals || {};
    const currency = d?.currency || "usd";
    const topEvents = Array.isArray(d?.topEventsByRevenue) ? d.topEventsByRevenue : [];

    const lines = [
      `Gross:     ${fmtMoney(t.gross_cents, currency)} across ${t.payments || 0} payment${t.payments === 1 ? "" : "s"}`,
      `Refunded:  ${fmtMoney(t.refunded_cents, currency)} (${t.refunded_payments || 0} payment${t.refunded_payments === 1 ? "" : "s"})`,
      `Net:       ${fmtMoney(t.net_cents, currency)}`,
      `Payers:    ${t.unique_payers || 0} unique`,
    ];
    if (topEvents.length > 0) {
      lines.push("");
      lines.push(`Top ${topEvents.length} events by net revenue:`);
      for (const e of topEvents) {
        lines.push(`  • ${e.title || "(untitled)"}  —  ${fmtMoney(e.net_cents, currency)}  (${e.payments} payment${e.payments === 1 ? "" : "s"})  → slug: ${e.slug || "—"}`);
      }
    }
    return toolResultText(lines.join("\n"));
  }

  async function getAttendanceTrends(args) {
    const months = args.months || 12;
    const d = await api("GET", "/host/crm/trends", { query: { months } });
    const series = Array.isArray(d?.months) ? d.months : [];
    if (series.length === 0) {
      return toolResultText(`No events in the last ${months} months.`);
    }
    const lines = [
      `Monthly attendance (last ${months} months, ${series.length} active):`,
      "",
      "  Month     Events  Confirmed  +Ones  Total guests  Show-up",
      "  ────────  ──────  ─────────  ─────  ────────────  ───────",
    ];
    for (const m of series) {
      lines.push(
        `  ${m.month}   ${String(m.events).padStart(6)}   ${String(m.confirmedRsvps).padStart(7)}  ${String(m.plusOnes).padStart(5)}   ${String(m.totalGuests).padStart(11)}   ${m.showUpRatePct == null ? "  —" : pct(m.showUpRatePct).padStart(6)}`
      );
    }
    // Quick trend hint: compare first vs last active month.
    if (series.length >= 2) {
      const first = series[0];
      const last = series[series.length - 1];
      const delta = (last.confirmedRsvps || 0) - (first.confirmedRsvps || 0);
      const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      lines.push("");
      lines.push(`Trend: ${first.month} → ${last.month}, confirmed RSVPs ${dir} ${Math.abs(delta)}.`);
    }
    return toolResultText(lines.join("\n"));
  }

  async function getAudienceSegments(args) {
    const topN = args.topN || 5;
    const d = await api("GET", "/host/crm/segments", { query: { topN } });
    const s = d?.segments || {};
    const tops = Array.isArray(d?.topSpenders) ? d.topSpenders : [];
    const total = s.total_people || 0;
    const pctOf = (n) => total > 0 ? `${((Number(n) || 0) * 100 / total).toFixed(1)}%` : "—";

    const lines = [
      `Audience (${total} people with at least one confirmed RSVP):`,
      `  First-timers (1 event):     ${s.first_timers || 0}  (${pctOf(s.first_timers)})`,
      `  Occasional (2–4 events):    ${s.occasional || 0}  (${pctOf(s.occasional)})`,
      `  Regulars (5+ events):       ${s.regulars || 0}  (${pctOf(s.regulars)})`,
      `  VIP-flagged:                ${s.vips || 0}`,
      `  Marketing-consented:        ${s.marketing_consented || 0}  (${pctOf(s.marketing_consented)})`,
      `  Dinner attenders (ever):    ${s.dinner_attenders || 0}  (${pctOf(s.dinner_attenders)})`,
    ];
    if (tops.length > 0) {
      lines.push("");
      lines.push(`Top ${tops.length} spenders:`);
      for (const p of tops) {
        const name = p.name || p.email || "(no name)";
        lines.push(`  • ${name}  —  ${fmtMoney(p.total_spend_cents, "usd")}  (${p.attended} event${p.attended === 1 ? "" : "s"})`);
      }
    }
    return toolResultText(lines.join("\n"));
  }

  async function getRecentActivity(args) {
    const days = args.days || 30;
    const d = await api("GET", "/host/crm/recent", { query: { days } });
    const rev = d?.revenue || {};
    const pv = d?.pageViews || {};
    const trending = Array.isArray(d?.trendingEvents) ? d.trendingEvents : [];

    const lines = [
      `Last ${days} days:`,
      `  RSVPs received:    ${d.rsvpsReceived || 0}`,
      `  New people:        ${d.newPeople || 0}  (first-ever RSVP to your events)`,
      `  Revenue:           ${fmtMoney(rev.net_cents, d.currency)}  (${rev.payments || 0} payment${rev.payments === 1 ? "" : "s"})`,
      `  Page views:        ${pv.views || 0}  (${pv.unique_visitors || 0} unique)`,
    ];
    if (trending.length > 0) {
      lines.push("");
      lines.push(`Trending events:`);
      for (const e of trending) {
        lines.push(`  • ${e.title || "(untitled)"}  —  ${e.recent_rsvps} RSVP${e.recent_rsvps === 1 ? "" : "s"}  → slug: ${e.slug || "—"}`);
      }
    }
    return toolResultText(lines.join("\n"));
  }

  async function getEmailSummary(args) {
    const topN = args.topN || 5;
    const d = await api("GET", "/host/crm/emails", { query: { topN } });
    const t = d?.totals || {};
    const top = Array.isArray(d?.topByOpenRate) ? d.topByOpenRate : [];

    if (!t.campaigns_sent) {
      return toolResultText("No campaigns sent yet.");
    }

    const sent = t.total_sent || 0;
    const delivered = t.total_delivered || 0;
    const failed = t.total_failed || 0;
    const deliveryRatePct = sent > 0 ? `${(100 * delivered / sent).toFixed(1)}%` : "—";
    // Engagement rates are most meaningful as a fraction of DELIVERED, not
    // attempted — opens on a failed send are impossible by definition.
    const openOfDelivered = delivered > 0 ? `${(100 * (t.total_opened || 0) / delivered).toFixed(1)}%` : "—";
    const clickOfDelivered = delivered > 0 ? `${(100 * (t.total_clicked || 0) / delivered).toFixed(1)}%` : "—";

    const lines = [
      `Email campaigns: ${t.campaigns_sent} sent`,
      `  Attempts:       ${sent}`,
      `  Delivered:      ${delivered}  (${deliveryRatePct} of attempts)`,
      `  Failed:         ${failed}${failed > 0 && sent > 0 ? `  (${(100 * failed / sent).toFixed(1)}% of attempts — investigate)` : ""}`,
      `  Bounced:        ${t.total_bounced || 0}  (${pct(t.bounce_rate_pct)})`,
      `  Opened:         ${t.total_opened || 0}  (${openOfDelivered} of delivered, ${pct(t.open_rate_pct)} of attempts)`,
      `  Clicked:        ${t.total_clicked || 0}  (${clickOfDelivered} of delivered, ${pct(t.click_rate_pct)} of attempts)`,
    ];
    if (t.total_complained) {
      lines.push(`  Complaints:     ${t.total_complained}`);
    }
    if (top.length > 0) {
      lines.push("");
      lines.push(`Top ${top.length} by open rate:`);
      for (const c of top) {
        const when = c.sent_at ? new Date(c.sent_at).toLocaleDateString("en-GB") : "—";
        lines.push(`  • "${c.subject || c.name || "(no subject)"}"  —  ${pct(c.open_rate_pct)} open, ${pct(c.click_rate_pct)} click  (${c.sent} sent, ${when})`);
      }
    }
    return toolResultText(lines.join("\n"));
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

  // ─── Slice A — Events completion ──────────────────────────────────

  async function getEventAnalytics(args) {
    const existing = await resolveEventBySlug(args.slug);
    const days = args.days || 30;
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * 86400000);
    const d = await api("GET", `/host/events/${existing.id}/analytics`, {
      query: {
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString(),
      },
    });

    const sources = Array.isArray(d?.sources) ? d.sources : [];
    const ds = d?.device_split || {};
    const period = d?.period || {};
    const currency = d?.ticket_currency || "usd";

    const lines = [
      `${existing.title}  —  last ${days} days`,
      "",
      `  Page views:        ${d?.total_views ?? 0}  (${d?.unique_visitors ?? 0} unique)`,
      `  vs prev period:    ${period.uniqueChange == null ? "—" : `${period.uniqueChange > 0 ? "+" : ""}${period.uniqueChange}%`}  (${period.prevUnique ?? 0} → ${period.currentUnique ?? 0} unique)`,
      `  Devices:           mobile ${ds.mobile || 0}  ·  desktop ${ds.desktop || 0}  ·  unknown ${ds.unknown || 0}`,
      "",
      `  RSVPs:             ${d?.rsvp_count ?? 0} confirmed`,
      d?.capacity ? `  Fill rate:         ${pct(d?.fill_rate)}  (${d?.rsvp_count}/${d?.capacity})` : null,
      `  Conversion:        ${pct(d?.conversion_rate)}  (RSVPs / unique visitors)`,
      `  Show-up rate:      ${pct(d?.show_rate)}  (${d?.pulled_up ?? 0}/${d?.rsvp_count ?? 0})`,
      d?.is_paid ? `  Revenue:           ${fmtMoney(d?.revenue ?? 0, currency)}` : null,
    ].filter(Boolean);

    if (sources.length > 0) {
      lines.push("");
      lines.push("Traffic sources:");
      for (const s of sources.slice(0, 8)) {
        lines.push(`  • ${s.source || "(unknown)"}  —  ${s.count} visitor${s.count === 1 ? "" : "s"}`);
      }
    }

    if (Array.isArray(d?.campaigns) && d.campaigns.length > 0) {
      lines.push("");
      lines.push("Campaigns featuring this event:");
      for (const c of d.campaigns.slice(0, 5)) {
        lines.push(`  • "${c.subject || c.name || "(no subject)"}"  —  ${c.sent || 0} sent, ${c.rsvps || 0} RSVPs attributed`);
      }
    }

    return toolResultText(lines.join("\n"));
  }

  async function duplicateEvent(args) {
    const src = await resolveEventBySlug(args.slug);
    // Pull the full event so we copy theme, sections, settings — not just
    // top-level fields. The host expects "duplicate" to mean an editable
    // clone, not a stripped skeleton.
    const full = await api("GET", `/host/events/${src.id}`);

    const newStartsAt = args.startsAt
      || (full.startsAt
        ? new Date(new Date(full.startsAt).getTime() + 7 * 86400000).toISOString()
        : new Date(Date.now() + 7 * 86400000).toISOString());
    const newTitle = args.title || `${full.title} (copy)`;

    // Strip identity / lifecycle fields so POST starts a new record.
    const {
      id, slug, hostId, createdAt, updatedAt,
      stripeProductId, stripePriceId,
      ...rest
    } = full;

    const payload = {
      ...rest,
      title: newTitle,
      startsAt: newStartsAt,
      status: "DRAFT", // Always land as DRAFT so the host previews before going live.
    };

    const created = await api("POST", "/events", { body: payload });

    return toolResultText(
      eventBanner({
        title: created.title,
        status: "DRAFT",
        previewUrl: previewUrlForSlug(created.slug),
        rsvpsUrl: rsvpsDashboardForId(created.id),
        note: `Duplicated from "${full.title}". Update or publish when ready.`,
      })
    );
  }

  async function deleteEvent(args) {
    if (args.confirm !== true) {
      throw new Error("Pass confirm: true to actually delete. This is destructive.");
    }
    const existing = await resolveEventBySlug(args.slug);
    await api("DELETE", `/host/events/${existing.id}`);
    return toolResultText(
      `Deleted "${existing.title}" (slug: ${existing.slug}). RSVPs and payments stay in the CRM; the event itself is gone.`
    );
  }

  // ─── Slice B — CRM completion ─────────────────────────────────────

  function formatPersonLine(p) {
    const name = p.name || "(no name)";
    const email = p.email || "(no email)";
    const ig = p.instagram ? `  @${p.instagram.replace(/^@/, "")}` : "";
    const events = p.eventsAttended || p.events_attended || 0;
    return `  • ${name}  <${email}>${ig}  —  ${events} event${events === 1 ? "" : "s"}  →  id: ${p.id}`;
  }

  async function findPerson(args) {
    if (!args.query || !String(args.query).trim()) {
      throw new Error("query is required.");
    }
    const data = await api("GET", "/host/crm/people", {
      query: { search: args.query, limit: 20 },
    });
    const people = Array.isArray(data) ? data : (data?.people || []);
    if (people.length === 0) {
      return toolResultText(`No people matched "${args.query}".`);
    }
    const lines = people.slice(0, 20).map(formatPersonLine);
    return toolResultText(
      `${people.length} match${people.length === 1 ? "" : "es"} for "${args.query}":\n${lines.join("\n")}`
    );
  }

  async function getPerson(args) {
    const p = await api("GET", `/host/crm/people/${args.personId}`);
    if (!p) return toolResultText(`No person found with id ${args.personId}.`);

    const events = Array.isArray(p.eventsAttended) ? p.eventsAttended : (p.events || []);
    const eventsCount = typeof p.eventsAttended === "number"
      ? p.eventsAttended
      : (typeof p.events_attended === "number" ? p.events_attended : events.length || 0);
    const spend = Number(p.totalSpendCents || p.total_spend_cents || 0);
    const currency = p.currency || "usd";

    const lines = [
      `${p.name || "(no name)"}  <${p.email || "(no email)"}>`,
      p.instagram ? `  Instagram:    @${p.instagram.replace(/^@/, "")}` : null,
      p.phone ? `  Phone:        ${p.phone}` : null,
      p.company ? `  Company:      ${p.company}` : null,
      "",
      `  Events:       ${eventsCount} confirmed RSVP${eventsCount === 1 ? "" : "s"}`,
      spend > 0 ? `  Spent:        ${fmtMoney(spend, currency)}` : null,
      p.tags && p.tags.length ? `  Tags:         ${p.tags.join(", ")}` : null,
      p.notes ? `  Notes:        ${p.notes}` : null,
    ].filter(Boolean);

    if (Array.isArray(events) && events.length > 0) {
      lines.push("");
      lines.push(`Recent events:`);
      for (const e of events.slice(0, 8)) {
        const when = e.startsAt ? new Date(e.startsAt).toLocaleDateString("en-GB") : "—";
        lines.push(`  • ${e.title || "(untitled)"}  (${when})  → slug: ${e.slug || "—"}`);
      }
    }

    return toolResultText(lines.join("\n"));
  }

  async function queryPeople(args) {
    const query = {};
    if (args.attendedEventSlug) {
      const ev = await resolveEventBySlug(args.attendedEventSlug);
      query.attendedEventId = ev.id;
    }
    if (args.eventsAttendedMin != null) query.eventsAttendedMin = args.eventsAttendedMin;
    if (args.eventsAttendedMax != null) query.eventsAttendedMax = args.eventsAttendedMax;
    if (args.totalSpendMinCents != null) query.totalSpendMin = args.totalSpendMinCents;
    if (args.totalSpendMaxCents != null) query.totalSpendMax = args.totalSpendMaxCents;
    if (args.tags) query.tags = args.tags;
    if (args.marketingConsentedOnly) query.subscriptionType = "consented";
    query.limit = args.limit || 50;

    const data = await api("GET", "/host/crm/people", { query });
    const people = Array.isArray(data) ? data : (data?.people || []);
    const total = (data && typeof data.total === "number") ? data.total : people.length;
    if (people.length === 0) {
      return toolResultText("No people match those filters.");
    }
    const lines = people.slice(0, query.limit).map(formatPersonLine);
    return toolResultText(
      `${total} match${total === 1 ? "" : "es"} (showing ${people.length}):\n${lines.join("\n")}`
    );
  }

  async function updatePerson(args) {
    const { personId, ...rest } = args;
    const patch = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) {
      throw new Error("No fields to update — pass at least one field besides personId.");
    }
    const updated = await api("PUT", `/host/crm/people/${personId}`, { body: patch });
    const changed = Object.keys(patch);
    return toolResultText(
      `Updated ${updated?.name || updated?.email || "person"}.\n  Fields:  ${changed.join(", ")}`
    );
  }

  // ─── Slice C — Email completion ───────────────────────────────────

  async function listCampaigns(args) {
    const query = {};
    if (args.status && args.status !== "any") query.status = args.status;
    if (args.limit) query.limit = args.limit;
    const items = await api("GET", "/host/crm/campaigns", { query });
    const limit = args.limit || 20;
    const slice = (items || []).slice(0, limit);
    if (slice.length === 0) {
      return toolResultText("No campaigns yet. Use draft_campaign to create one.");
    }
    const lines = slice.map((c) => {
      const when = c.sentAt
        ? new Date(c.sentAt).toLocaleDateString("en-GB")
        : (c.createdAt ? `drafted ${new Date(c.createdAt).toLocaleDateString("en-GB")}` : "—");
      const recip = c.totalRecipients ? `${c.totalRecipients} recipients` : "no audience yet";
      return `  • "${c.subject || c.name || "(no subject)"}"  [${(c.status || "?").toUpperCase()}]  ${recip}  ${when}  →  id: ${c.id}`;
    });
    return toolResultText(
      `${slice.length} campaign${slice.length === 1 ? "" : "s"}:\n${lines.join("\n")}`
    );
  }

  async function getCampaign(args) {
    const c = await api("GET", `/host/crm/campaigns/${args.campaignId}`);
    if (!c) return toolResultText(`Campaign ${args.campaignId} not found.`);
    const total = Number(c.totalRecipients || 0);
    const sent = Number(c.totalSent || 0);
    const failed = Number(c.totalFailed || 0);
    const lines = [
      `"${c.subject || c.name || "(no subject)"}"  [${(c.status || "?").toUpperCase()}]`,
      `  Type:         ${c.templateType || "—"}`,
      `  Event:        ${c.eventId || "—"}`,
      `  Recipients:   ${total}`,
      `  Sent:         ${sent}${failed ? `  (${failed} failed)` : ""}`,
      c.sentAt ? `  Sent at:      ${new Date(c.sentAt).toLocaleString("en-GB")}` : null,
      c.createdAt ? `  Created:      ${new Date(c.createdAt).toLocaleString("en-GB")}` : null,
    ].filter(Boolean);
    return toolResultText(lines.join("\n"));
  }

  async function draftCampaign(args) {
    const ev = await resolveEventBySlug(args.eventSlug);

    // Build a minimal block-based templateContent the backend accepts.
    // The host can edit/refine in the UI; chat-drafted campaigns ship a
    // single paragraph block from `message`. Text blocks require a `style`
    // of 'heading' or 'paragraph' per the followup-template validator.
    const templateContent = args.message
      ? {
          blocks: [
            { type: "text", style: "paragraph", text: String(args.message) },
          ],
        }
      : { blocks: [] };

    const filterCriteria = {};
    if (args.filterAttendedEventSlug) {
      const filterEv = await resolveEventBySlug(args.filterAttendedEventSlug);
      filterCriteria.attendedEventId = filterEv.id;
    }
    if (args.filterTags) filterCriteria.tags = args.filterTags;

    const created = await api("POST", "/host/crm/campaigns", {
      body: {
        subject: args.subject,
        eventId: ev.id,
        templateType: args.templateType || "event",
        templateContent,
        filterCriteria,
      },
    });

    const previewUrl = frontendUrl(`/host/crm/campaigns/${created.campaignId}/preview`);
    return toolResultText(
      [
        "─────────────────────────────────────",
        "  Campaign drafted (NOT sent)",
        `  "${args.subject}"  →  ${ev.title}`,
        `  Audience: ${created.totalRecipients ?? 0} recipients`,
        "",
        `  → Preview:    ${previewUrl}`,
        `  → To send:    call send_campaign with campaignId="${created.campaignId}" and confirm=true`,
        "─────────────────────────────────────",
      ].join("\n")
    );
  }

  async function sendCampaign(args) {
    if (args.confirm !== true) {
      throw new Error("Pass confirm: true to actually send. This emails real people.");
    }
    const r = await api("POST", `/host/crm/campaigns/${args.campaignId}/send`);
    return toolResultText(
      `Campaign send started. Status: ${r?.status || "sending"}.\nUse get_campaign with id ${args.campaignId} in a minute to see delivery counts.`
    );
  }

  // ─── Slice D — Guest actions ──────────────────────────────────────

  async function findRsvpByEmail(eventId, email) {
    const guests = await api("GET", `/host/events/${eventId}/guests`);
    const list = Array.isArray(guests) ? guests : guests?.guests || guests?.rsvps || [];
    const target = email.trim().toLowerCase();
    const match = list.find((g) => (g.email || "").toLowerCase() === target);
    if (!match) {
      throw new Error(
        `No RSVP found for ${email} on this event. Use list_rsvps to see who's signed up.`
      );
    }
    return match;
  }

  async function updateRsvp(args) {
    const ev = await resolveEventBySlug(args.eventSlug);
    const rsvp = await findRsvpByEmail(ev.id, args.rsvpEmail);

    if (args.action === "check_in") {
      // pulledUpForCocktails=true marks attendance. For dinner events,
      // hosts use the dashboard for the more granular toggle.
      await api("PUT", `/host/events/${ev.id}/rsvps/${rsvp.id}`, {
        body: { pulledUpForCocktails: true },
      });
      return toolResultText(`Checked in ${rsvp.name || rsvp.email} for "${ev.title}".`);
    }

    if (args.action === "promote_from_waitlist") {
      const status = (rsvp.bookingStatus || rsvp.status || "").toLowerCase();
      if (status !== "waitlist") {
        return toolResultText(
          `${rsvp.name || rsvp.email} is already ${rsvp.bookingStatus || rsvp.status}, not on the waitlist.`
        );
      }
      await api("POST", `/host/events/${ev.id}/rsvps/${rsvp.id}/promote`);
      return toolResultText(
        `Promoted ${rsvp.name || rsvp.email} from waitlist to CONFIRMED for "${ev.title}". They'll receive the confirmation email.`
      );
    }

    if (args.action === "cancel") {
      await api("POST", `/host/events/${ev.id}/rsvps/${rsvp.id}/cancel`);
      return toolResultText(
        `Cancelled ${rsvp.name || rsvp.email}'s RSVP for "${ev.title}". They'll receive a cancellation email. (For paid events, run refund_payment separately.)`
      );
    }

    throw new Error(`Unknown action: ${args.action}`);
  }

  async function refundPayment(args) {
    if (args.confirm !== true) {
      throw new Error("Pass confirm: true. Refunds move real money.");
    }
    const ev = await resolveEventBySlug(args.eventSlug);

    // Find the payer's payment for this event. /host/events/:id/payments
    // returns the event's payments scoped to the host.
    const payments = await api("GET", `/host/events/${ev.id}/payments`);
    const list = Array.isArray(payments) ? payments : (payments?.payments || []);
    const target = args.payerEmail.trim().toLowerCase();
    const candidate = list.find((p) => {
      const email = (p.email || p.payerEmail || p.guestEmail || "").toLowerCase();
      return email === target && (p.status === "succeeded" || p.status === "partial_refund");
    });
    if (!candidate) {
      throw new Error(
        `No refundable payment found for ${args.payerEmail} on "${ev.title}".`
      );
    }

    const body = { moveToWaitlist: args.moveToWaitlist !== false };
    if (args.amountCents != null) body.amount = args.amountCents;
    if (args.reason) body.reason = args.reason;

    const r = await api("POST", `/host/events/${ev.id}/payments/${candidate.id}/refund`, {
      body,
    });

    const amount = (r?.amount_refunded ?? r?.refund?.amount ?? args.amountCents);
    return toolResultText(
      `Refunded ${amount != null ? fmtMoney(amount, candidate.currency || "usd") : "(amount confirmed by Stripe)"} to ${args.payerEmail} for "${ev.title}".${body.moveToWaitlist ? " Moved RSVP back to WAITLIST." : ""}`
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
    uploadEventMedia,
    listCoverImageGallery,
    getCrmSummary,
    getRevenueSummary,
    getAttendanceTrends,
    getAudienceSegments,
    getRecentActivity,
    getEmailSummary,
    // Slice A — Events completion
    getEventAnalytics,
    duplicateEvent,
    deleteEvent,
    // Slice B — CRM completion
    findPerson,
    getPerson,
    queryPeople,
    updatePerson,
    // Slice C — Email completion
    listCampaigns,
    getCampaign,
    draftCampaign,
    sendCampaign,
    // Slice D — Guest actions
    updateRsvp,
    refundPayment,
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
// Handles the formats Supabase storage accepts for images + videos.
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
  // ISO base media file format (mp4/mov/m4v) — bytes 4..8 are 'ftyp'.
  if (buf.length >= 12 && buf.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  // WebM / Matroska EBML header.
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return "video/webm";
  }
  return null;
}

function sniffMimeFromBase64(s) {
  if (!s) return null;
  const raw = s.startsWith("data:") ? s.split(",")[1] || "" : s;
  try {
    const head = Buffer.from(raw.slice(0, 64), "base64"); // sniff the first ~48 bytes
    return sniffMime(head);
  } catch {
    return null;
  }
}

function inferMediaTypeFromMime(mime) {
  if (!mime) return null;
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return null;
}

function inferMediaTypeFromUrl(url) {
  const lower = String(url || "").toLowerCase().split("?")[0];
  if (/\.(jpg|jpeg|png|webp|gif)$/.test(lower)) return "image";
  if (/\.(mp4|webm|mov|m4v)$/.test(lower)) return "video";
  return null;
}

function inferMediaTypeFromBase64(s) {
  const mime = sniffMimeFromBase64(s);
  return inferMediaTypeFromMime(mime);
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
        "Sets a new cover image on an event. Provide an imageUrl (publicly fetchable) or imageBase64 (data URL or raw base64). ≤10MB. For larger images, gallery additions, or videos, use upload_event_media instead.",
      inputSchema: UploadImageInput,
      handler: h.uploadEventImage,
    },
    {
      name: "upload_event_media",
      title: "Upload an image or video to an event's gallery",
      description:
        "Adds media to an event's gallery. Supports images (jpg/png/webp/gif) up to 50MB and videos (mp4/webm/mov) up to 500MB. Pass a publicly fetchable mediaUrl (preferred for anything over ~5MB — server streams it directly to storage, bypassing MCP body limits) OR mediaBase64 for small inline content (≤30MB). Optionally set setAsCover=true for images to also make it the event's cover.",
      inputSchema: UploadMediaInput,
      handler: h.uploadEventMedia,
    },
    {
      name: "list_cover_image_gallery",
      title: "List previously-used cover images",
      description:
        "Returns URLs of cover and media images the host has used on past events. Use this when the host says 'use one of my previous images' — pick a URL and pass it as imageUrl to create_event or update_event.",
      inputSchema: ListGalleryInput,
      handler: h.listCoverImageGallery,
    },
    {
      name: "get_crm_summary",
      title: "Get a one-shot CRM summary",
      description:
        "Returns aggregate stats across ALL of the host's events in a SINGLE round-trip: total events (with status + upcoming/past split), total unique guests in the CRM, total confirmed RSVPs, plus-ones brought, dinner bookings, top repeat attendees, and top events by attendance. Prefer this over calling list_rsvps on each event when the user asks about totals, counts, or 'who comes the most'.",
      inputSchema: CrmSummaryInput,
      handler: h.getCrmSummary,
    },
    {
      name: "get_revenue_summary",
      title: "Get a revenue summary",
      description:
        "Returns gross/net revenue, refund totals, payment count, unique payers, and top-revenue events — all from Stripe payments tied to the host's events. Use this for 'how much have I made', 'what's my revenue', 'top-grossing events', refund questions, etc.",
      inputSchema: RevenueSummaryInput,
      handler: h.getRevenueSummary,
    },
    {
      name: "get_attendance_trends",
      title: "Get monthly attendance trends",
      description:
        "Returns a month-by-month time series for the last N months: number of events, confirmed RSVPs, plus-ones, total guests, and show-up rate (pulled_up / confirmed). Use for 'are my events growing', 'what was my best month', 'show-up rate over time'.",
      inputSchema: TrendsInput,
      handler: h.getAttendanceTrends,
    },
    {
      name: "get_audience_segments",
      title: "Get audience segmentation",
      description:
        "Returns audience breakdown by attendance: first-timers (1 event), occasional (2–4), regulars (5+), VIP-flagged, marketing-consented, and dinner attenders. Plus the top N spenders. Use for 'who are my regulars', 'how many first-timers', 'who are my biggest spenders', segmentation for newsletters, etc.",
      inputSchema: SegmentsInput,
      handler: h.getAudienceSegments,
    },
    {
      name: "get_recent_activity",
      title: "Get recent activity",
      description:
        "Returns activity in the last N days: RSVPs received, new people (first-ever RSVP), revenue, page views, and trending events. Use for 'what happened this week', 'recent signups', 'how's the new event doing', 'what's trending'.",
      inputSchema: RecentActivityInput,
      handler: h.getRecentActivity,
    },
    {
      name: "get_email_summary",
      title: "Get email campaign performance",
      description:
        "Returns campaign totals (sent, delivered, opened, clicked, bounced) plus open/click/bounce rates and the top N campaigns by open rate. Use for 'how are my emails doing', 'best-performing subject lines', 'what's my open rate'.",
      inputSchema: EmailSummaryInput,
      handler: h.getEmailSummary,
    },

    // ─── Slice A — Events completion ────────────────────────────────
    {
      name: "get_event_analytics",
      title: "Get analytics for one event",
      description:
        "Returns per-event analytics: page views (unique + total), period-over-period change, device split, traffic sources, RSVPs, fill rate, conversion rate, show-up rate, revenue, and any campaigns that promoted this event. Use for 'how is photo-walk-2 doing', 'where are people coming from', 'what's my conversion rate'.",
      inputSchema: EventAnalyticsInput,
      handler: h.getEventAnalytics,
    },
    {
      name: "duplicate_event",
      title: "Duplicate an event as a new DRAFT",
      description:
        "Clones an existing event — copies title, description, image, theme, sections, ticketing, form fields, settings — and creates a new DRAFT. Default new start = source start + 7 days. Use for 'set up next week's walk like last week's' or 'clone vol 03 for vol 04'.",
      inputSchema: DuplicateEventInput,
      handler: h.duplicateEvent,
    },
    {
      name: "delete_event",
      title: "Delete an event (destructive)",
      description:
        "Permanently deletes an event. RSVPs and payments stay in the CRM, but the event page is gone. Requires confirm: true so it can't fire from a casual instruction.",
      inputSchema: DeleteEventInput,
      handler: h.deleteEvent,
    },

    // ─── Slice B — CRM completion ───────────────────────────────────
    {
      name: "find_person",
      title: "Find a person by name, email, IG, or phone",
      description:
        "Free-text search across the host's CRM. Returns up to 20 matches with id, name, email, IG handle, and attendance count. Use when the host names someone ('find sara', 'do I have mia in my CRM') — then use get_person for the full profile.",
      inputSchema: FindPersonInput,
      handler: h.findPerson,
    },
    {
      name: "get_person",
      title: "Get a person's full profile",
      description:
        "Returns one person's full profile: identity fields (IG/twitter/tiktok/linkedin/company), tags, notes, lifetime spend, every event they've attended. Use after find_person, or when the host references a specific person id.",
      inputSchema: GetPersonInput,
      handler: h.getPerson,
    },
    {
      name: "query_people",
      title: "Query people in the CRM",
      description:
        "Filter the CRM by attendance count, attendance to a specific event, lifetime spend range, tags, and marketing-consent status. Returns a list. Use for segmentation: 'who attended both walks', 'my top 20 spenders', 'people with the vip tag who consented to marketing', 'first-timers from last month'. For draft_campaign audiences, prefer the same-shape filters there.",
      inputSchema: QueryPeopleInput,
      handler: h.queryPeople,
    },
    {
      name: "update_person",
      title: "Update a person's CRM fields",
      description:
        "Patches a person record. Pass only the fields to change. Useful for enriching contacts post-event: add an IG handle the host grabbed in person, set notes, replace the tag list, etc. tags is a FULL replacement (pass [] to clear).",
      inputSchema: UpdatePersonInput,
      handler: h.updatePerson,
    },

    // ─── Slice C — Email completion ─────────────────────────────────
    {
      name: "list_campaigns",
      title: "List email campaigns",
      description:
        "Lists the host's campaigns, newest first, with status, recipient count, and sent count. Filter by status='draft' / 'sending' / 'sent' / 'failed'. Use for 'what campaigns have I sent', 'find my last follow-up', 'any drafts pending'.",
      inputSchema: ListCampaignsInput,
      handler: h.listCampaigns,
    },
    {
      name: "get_campaign",
      title: "Get campaign details + send status",
      description:
        "Returns one campaign's full status: subject, type, recipient count, sent/failed counts, and timestamps. Use after list_campaigns, or after send_campaign to poll progress.",
      inputSchema: GetCampaignInput,
      handler: h.getCampaign,
    },
    {
      name: "draft_campaign",
      title: "Draft an email campaign",
      description:
        "Creates a DRAFT email campaign tied to one event. Subject is required; message is an optional plain-text body. Audience can be filtered to people who attended a specific event (great for follow-ups) or people with specific tags. Returns a preview URL the host can review. Does NOT send — pair with send_campaign(confirm: true) to actually fire.",
      inputSchema: DraftCampaignInput,
      handler: h.draftCampaign,
    },
    {
      name: "send_campaign",
      title: "Send a drafted campaign",
      description:
        "Fires a drafted campaign to its audience. IRREVERSIBLE — sends real email to real people. Requires confirm: true. The host should review the preview from draft_campaign first.",
      inputSchema: SendCampaignInput,
      handler: h.sendCampaign,
    },

    // ─── Slice D — Guest actions ────────────────────────────────────
    {
      name: "update_rsvp",
      title: "Check in, promote, or cancel an RSVP",
      description:
        "Acts on one RSVP, identified by event slug + guest email. action='check_in' marks the guest as attended. action='promote_from_waitlist' moves a WAITLIST RSVP to CONFIRMED (and triggers the confirmation email). action='cancel' cancels the booking (and triggers a cancellation email). For refunds on paid events, use refund_payment instead.",
      inputSchema: UpdateRsvpInput,
      handler: h.updateRsvp,
    },
    {
      name: "refund_payment",
      title: "Refund a guest's payment",
      description:
        "Refunds a guest's Stripe payment for one event. Looks up the payment by guest email. Defaults to a full refund and moves the RSVP back to WAITLIST so the host can re-promote. Pass amountCents for a partial refund. IRREVERSIBLE — moves real money and emails the guest. Requires confirm: true.",
      inputSchema: RefundPaymentInput,
      handler: h.refundPayment,
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
