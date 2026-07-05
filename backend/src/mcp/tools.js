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
import dns from "dns/promises";
import net from "net";

import { makeApi, frontendUrl } from "./api.js";
import { generateWaitlistToken } from "../utils/waitlistTokens.js";
import { eventBanner, toolResultText, toolError } from "./format.js";
import {
  analyzeEvent,
  analyzeCrmSignals,
  completenessSummary,
} from "./suggestions.js";
import { auditJourney } from "./journeyAudit.js";

// The "preview" handed back to the host from chat is the event editor — not
// the public /e/:slug page. Auth is the editor's normal session auth; the
// floating "PullUp" coach widget reads host_actions to know chat has been
// here recently, no per-link token needed.
function editUrlForEventId(id) {
  return frontendUrl(`/app/events/${id}/edit`);
}
function shareUrlForSlug(slug) {
  // utm-tagged share URL for paste-into-IG/WhatsApp. Falls through to the
  // same page; the param is just for attribution. Never carries a preview
  // token — sharing the widget link with strangers would expose the
  // publish/unpublish chrome (and they'd need to sign in to act, but the
  // chrome leak alone is wrong).
  return `${frontendUrl(`/e/${slug}`)}?utm_source=mcp`;
}
function rsvpsDashboardForId(id) {
  return frontendUrl(`/app/events/${id}/guests`);
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

// One entry in the optional `extraRsvpFields` shorthand on create_event /
// update_event. Either a preset type as a bare string ("instagram") or a
// shaped object with required-flag and (for "custom") a label.
const RsvpFieldSpecObject = z.object({
  type: z.enum([
    "instagram",
    "phone",
    "twitter",
    "tiktok",
    "linkedin",
    "company",
    "birthday",
    "custom",
  ]),
  label: z.string().optional().describe(
    "Override the field label shown to guests. Required when type is 'custom'."
  ),
  required: z.boolean().optional().describe(
    "Whether the guest must fill this in to RSVP. Defaults to false."
  ),
});
const RsvpFieldInput = z.union([
  z.enum([
    "instagram",
    "phone",
    "twitter",
    "tiktok",
    "linkedin",
    "company",
    "birthday",
  ]),
  RsvpFieldSpecObject,
]);

// (Brand-design theme input + helpers removed — host brand design is gone.
//  The AI generative hero now lives in events.scene via the set_event_scene
//  tool, not in a brand snapshot.)

// ─── Event-page content: title typography + section blocks ────────────

// Title typography (events.title_settings). Mirrors the editor's title controls.
const TitleSettingsInput = z
  .object({
    visible: z.boolean().optional().describe("Show the title on the page. Default true."),
    align: z.enum(["left", "center", "right"]).optional().describe("Title alignment. Default 'left'."),
    font: z
      .enum(["default", "serif", "mono", "condensed"])
      .optional()
      .describe("Title font style. Default 'default'."),
    size: z.enum(["sm", "md", "lg"]).optional().describe("Title size. Default 'md'."),
    color: z.string().optional().describe("Title color, hex. Default white (#ffffff)."),
    detailsColor: z
      .string()
      .optional()
      .describe("Color of the date/location line under the title, hex."),
    detailsGradient: z
      .string()
      .optional()
      .describe("Scrim/gradient color behind the title area, hex. Only used when detailsGradientEnabled is true."),
    detailsGradientEnabled: z
      .boolean()
      .optional()
      .describe("Enable a gradient behind the title for legibility over the cover image."),
  })
  .optional()
  .describe("Title typography + color (events.title_settings).");

// One content block on the event page (events.sections). Heterogeneous by
// `type`; only the fields relevant to that type are read.
const SectionInput = z.object({
  type: z
    .enum([
      "title",
      "location",
      "datetime",
      "text",
      "hostedby",
      "socials",
      "spotify",
      "applemusic",
      "soundcloud",
      "youtube",
    ])
    .describe(
      "Block type. 'title'/'location'/'datetime' render the event's own title/place/time — include them to set their order and per-block font/color. 'text' = a heading+body block. 'hostedby' = a host/sponsor credit. 'socials' = a social-icon row. 'spotify'/'applemusic'/'soundcloud'/'youtube' = an embedded player."
    ),
  // text
  title: z.string().optional().describe("'text' block: the heading."),
  text: z.string().optional().describe("'text' block: the body (line breaks preserved)."),
  // hostedby
  name: z.string().optional().describe("'hostedby': the host/sponsor name (required for it to render)."),
  logo: z.string().optional().describe("'hostedby': logo image URL."),
  email: z.string().optional().describe("'hostedby': contact email."),
  website: z.string().optional().describe("'hostedby': website URL."),
  // socials
  instagram: z.string().optional().describe("'socials': Instagram URL."),
  spotify: z.string().optional().describe("'socials': Spotify URL."),
  tiktok: z.string().optional().describe("'socials': TikTok URL."),
  soundcloud: z.string().optional().describe("'socials': SoundCloud URL."),
  // music embeds
  url: z
    .string()
    .optional()
    .describe("Music blocks (spotify/applemusic/soundcloud/youtube): the share URL to embed."),
  // per-section theming (applies to title/location/datetime/text/hostedby)
  fontFamily: z
    .string()
    .optional()
    .describe(
      "Per-block font — a curated font name (Inter, DM Sans, Manrope, Space Grotesk, Outfit, Helvetica, Playfair Display, Lora, Cormorant Garamond, Georgia, Space Mono, IBM Plex Mono)."
    ),
  fontColor: z.string().optional().describe("Per-block text color, hex."),
});

const SectionsInput = z
  .array(SectionInput)
  .optional()
  .describe(
    "The event page body as ordered content blocks (events.sections) — the rich alternative to the flat `description`. Typical order: a 'title' block, then 'datetime', 'location', then 'text' blocks / 'hostedby' credits / music embeds / a 'socials' row. Each block can carry its own fontFamily + fontColor. If you omit the structural 'title'/'location'/'datetime' blocks they're added automatically so the event's title/time/place still show. Omit `sections` entirely to leave the page body untouched."
  );

// Ensure the structural blocks exist so the title/time/place always render —
// mirrors the editor, which always seeds them. Only used on CREATE; on update
// the caller's section list is taken as authoritative.
function normalizeSections(sections) {
  if (!Array.isArray(sections)) return sections;
  const present = new Set(sections.map((s) => s && s.type));
  const missing = ["title", "location", "datetime"]
    .filter((t) => !present.has(t))
    .map((type) => ({ type }));
  return [...missing, ...sections];
}

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
  locationLat: z.number().optional().describe(
    "Latitude (decimal degrees) of the venue, for the map pin on the public page."
  ),
  locationLng: z.number().optional().describe(
    "Longitude (decimal degrees) of the venue, for the map pin on the public page."
  ),
  description: z.string().optional().describe(
    "Short flat description — fine for a simple page. For a rich, styled page body use `sections` instead (text blocks, hosted-by, music embeds, per-block fonts/colors)."
  ),
  titleSettings: TitleSettingsInput,
  sections: SectionsInput,
  contactChannel: z.enum(["email", "whatsapp", "both"]).optional().describe(
    "How guests reach the host from the event page. Default 'email'. 'whatsapp' or 'both' surfaces a WhatsApp contact."
  ),
  maxAttendees: z.number().int().positive().optional(),
  imageUrl: z.string().optional().describe(
    "URL of a hosted cover image. Tip: call list_cover_image_gallery first to reuse one of the host's existing images, or call upload_event_image after create to attach a new one. For local files (videos, phone photos), use get_media_upload_link after create — claude.ai web can't read file paths."
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

  // ─── Gating + capacity behaviour ────────────────────────────────────
  requireApproval: z.boolean().optional().describe(
    "If true, every RSVP lands in a pending state until the host approves it. Useful for invite-only-feel events."
  ),
  waitlistEnabled: z.boolean().optional().describe(
    "If true, RSVPs past maxAttendees go onto a waitlist instead of being rejected. Default true when maxAttendees is set."
  ),
  instantWaitlist: z.boolean().optional().describe(
    "If true, every RSVP starts on the waitlist (host promotes manually). Use for fully curated guest lists."
  ),
  maxPlusOnesPerGuest: z.number().int().nonnegative().max(10).optional().describe(
    "How many extra guests each RSVP can bring (0–10). Default 0."
  ),

  // ─── Pricing (Stripe) ──────────────────────────────────────────────
  ticketType: z.enum(["free", "paid"]).optional().describe(
    "'paid' creates a Stripe product/price automatically (the host must already have Stripe Connect set up). Requires ticketPrice. Defaults to 'free'."
  ),
  ticketPrice: z.number().int().positive().optional().describe(
    "Price in CENTS (e.g. 2500 = $25.00). Used only when ticketType is 'paid'."
  ),
  ticketCurrency: z.string().min(3).max(3).optional().describe(
    "ISO currency code, e.g. 'USD', 'EUR', 'SEK'. Default 'USD'."
  ),

  // ─── Event-level social links (shown on the public page) ───────────
  instagram: z.string().optional().describe("Public IG URL or @handle attached to the event."),
  spotify: z.string().optional().describe("Spotify URL (playlist / artist) attached to the event."),
  tiktok: z.string().optional().describe("TikTok URL or @handle attached to the event."),
  soundcloud: z.string().optional().describe("SoundCloud URL attached to the event."),

  // ─── Cosmetics + bucketing ─────────────────────────────────────────
  theme: z.string().optional().describe(
    "Visual theme name (e.g. 'classic', 'minimal'). Affects the public page look."
  ),
  visibility: z.enum(["public", "private"]).optional().describe(
    "'public' = listed on the explore page; 'private' = link-only (host shares the URL). Default 'public'."
  ),
  calendar: z.enum(["personal", "business"]).optional().describe(
    "Which of the host's calendars this event belongs to. 'personal' for private/social events, 'business' for work events. Default 'personal'. Not shown to guests."
  ),

  // ─── RSVP form ─────────────────────────────────────────────────────
  extraRsvpFields: z.array(RsvpFieldInput).optional().describe(
    "Extra questions on the RSVP form, beyond the always-required name/email. Each entry is either a preset type string ('instagram', 'phone', 'twitter', 'tiktok', 'linkedin', 'company', 'birthday') or {type, label?, required?}. For type 'custom', a label is required. Example: ['instagram'] adds an optional Instagram field; [{type:'instagram', required:true}] makes Instagram required; [{type:'custom', label:'Dietary restrictions?', required:false}] adds a free-text question."
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

// Generative hero scene (stored at events.scene, archetype "scene"; mig 104).
const SceneInput = {
  slug: z.string().describe("The event's slug (from create_event or list_events)."),
  html: z
    .string()
    .describe(
      "The scene as a self-contained HTML fragment: markup + inline <style> and <script>. No <html>/<head>/<body>, no network/fetch/external scripts, fully responsive (handle resize), transparent background. Renders sandboxed as the hero.",
    ),
  poster: z
    .string()
    .optional()
    .describe("Optional https image URL — the still fallback for reduced-motion and link/share previews."),
  palette: z
    .array(z.string())
    .optional()
    .describe("The hero's dominant colors as hex strings (2–4). Lets the page vibe-match the body to the hero and sharpens the still-fallback gradient."),
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

const MediaUploadLinkInput = {
  slug: z.string().describe(
    "The event's slug. Returns the event's edit page URL, where the host can drag-drop a media file (image up to 50MB or video up to 500MB) and tune the rest of the event. The host must be signed in to PullUp in that browser."
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

const GetRecentActionsInput = {
  limit: z.number().int().positive().max(100).optional().describe(
    "How many actions to return. Default 25."
  ),
  since: z.string().optional().describe(
    "ISO date/time string — only actions at or after this timestamp."
  ),
  targetType: z.string().optional().describe(
    "Filter by target resource type, e.g. 'event', 'person', 'rsvp', 'payment'."
  ),
  targetId: z.string().optional().describe(
    "Filter to actions against a single target (use together with targetType)."
  ),
  source: z.enum(["ui", "chat", "sdk", "system"]).optional().describe(
    "Filter by where the action came from: 'ui' (web app), 'chat' (this MCP), 'sdk', or 'system'."
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
  personId: z.string().uuid().describe(
    "Person id (UUID). Use find_person first if you only have a name or email."
  ),
};

const FindMatchesInput = {
  personId: z.string().uuid().describe(
    "Person id (UUID) to find lookalikes/connections for. Use find_person first if you only have a name."
  ),
  limit: z.number().int().positive().max(50).optional().describe("Max matches to return (default 10)."),
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
    "If true, only people who opted in to marketing."
  ),
  limit: z.number().int().positive().max(200).optional().describe("Max results. Default 50."),
};

const UpdatePersonInput = {
  personId: z.string().uuid().describe("Person id (UUID)."),
  name: z.string().optional(),
  phone: z.string().optional(),
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

const AddPersonNoteInput = {
  personId: z.string().uuid().describe(
    "Person id (UUID). Use find_person first if you only have a name."
  ),
  content: z.string().describe(
    "The observation, in the host's voice. e.g. 'Talked Leica M6 on the photowalk — wants to get into film.' Keep one note to one moment; add separate notes for separate conversations."
  ),
  eventId: z.string().uuid().optional().describe(
    "Optional event id this note is about (the walk/dinner where it came up). get_person lists the events this person attended."
  ),
  noteDate: z.string().optional().describe(
    "Date the note is about, YYYY-MM-DD. Defaults to today — backdate it to when the conversation actually happened."
  ),
  topic: z.string().optional().describe(
    "Optional one-word topic label for later filtering (e.g. 'gear', 'career', 'family'). This is the AI-only enrichment field — hidden from the host's UI. Set it when you can infer a clean category from the content."
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

const HostBriefSetInput = {
  brief: z.string().max(2000).describe(
    "1–3 paragraphs about the host: who they are, what kinds of events they run, who their audience is, and what they want to grow toward. The AI uses this to calibrate every suggestion."
  ),
};

const ContextPackInput = {
  includePeople: z.boolean().optional().describe(
    "Embed the people of the host's world in the pack. Default false — just the host plus the shape and intelligence of their world (core people, drifters, spenders)."
  ),
  peopleLimit: z.number().int().positive().max(2000).optional().describe(
    "Cap on embedded people when includePeople is true. Default 100."
  ),
};

const PersonPackInput = {
  personId: z.string().optional().describe(
    "The person's id (from query_people / find_person)."
  ),
  query: z.string().optional().describe(
    "Alternatively, a name, email, or @handle to resolve to one person."
  ),
};

const SuggestImprovementsInput = {
  slug: z.string().describe(
    "The event's slug. Returns a ranked list of the most impactful next improvements with the exact MCP call to make each."
  ),
  limit: z.number().int().positive().max(10).optional().describe(
    "Max suggestions to return. Default 5."
  ),
};

const AuditJourneyInput = {
  slug: z.string().describe(
    "The event's slug. Walks the full customer journey (social handoff → page → RSVP form → emails) and returns a stage-by-stage report with the biggest break in the pipe surfaced first."
  ),
};

const CrmSignalsInput = {
  days: z.number().int().positive().max(180).optional().describe(
    "Recent-activity look-back window. Default 30."
  ),
  limit: z.number().int().positive().max(10).optional().describe(
    "Max signals to return. Default 5."
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

// Mirrors the presets the frontend builder offers in CreateEventPage.jsx so
// the public RSVP form, exports, and CRM enrichment all see the same shape.
const RSVP_FIELD_PRESETS = {
  instagram: { type: "instagram", label: "Instagram", placeholder: "Your Instagram username",  iconKey: "instagram", color: "#E1306C" },
  phone:     { type: "phone",     label: "Phone",     placeholder: "Phone number",             iconKey: "phone",     color: "#a3e635" },
  twitter:   { type: "twitter",   label: "X",         placeholder: "Your X username",          iconKey: "twitter",   color: "#ffffff" },
  tiktok:    { type: "tiktok",    label: "TikTok",    placeholder: "Your TikTok username",     iconKey: "tiktok",    color: "#69C9D0" },
  linkedin:  { type: "linkedin",  label: "LinkedIn",  placeholder: "LinkedIn profile URL",     iconKey: "linkedin",  color: "#0A66C2" },
  company:   { type: "company",   label: "Company",   placeholder: "Company / where you work", iconKey: "company",   color: "#c0c0c0" },
  birthday:  { type: "birthday",  label: "Birthday",  placeholder: "Birthday",                 iconKey: "birthday",  color: "#f59e0b", inputType: "date" },
};

function makeFieldId() {
  return "ff_" + Math.random().toString(36).slice(2, 10);
}

// Convert the MCP `extraRsvpFields` shorthand into the full formFields array
// the events table stores (name/email locked + custom presets). Throws on
// missing labels for `custom` so the host gets a clear error from Claude.
function buildFormFieldsFromExtras(extras) {
  const locked = [
    { id: "__name__",  type: "name",  label: "Full name", iconKey: "name",  required: true, locked: true },
    { id: "__email__", type: "email", label: "Email",     iconKey: "email", required: true, locked: true },
  ];
  const custom = (Array.isArray(extras) ? extras : []).map((entry) => {
    const spec = typeof entry === "string" ? { type: entry } : entry || {};
    if (spec.type === "custom") {
      if (!spec.label || !spec.label.trim()) {
        throw new Error(
          "extraRsvpFields: 'custom' fields need a label (the question to show the guest)."
        );
      }
      return {
        id: makeFieldId(),
        type: "custom",
        label: spec.label.trim(),
        placeholder: "Your answer",
        iconKey: "custom",
        color: "#a3e635",
        required: !!spec.required,
      };
    }
    const preset = RSVP_FIELD_PRESETS[spec.type];
    if (!preset) {
      throw new Error(
        `extraRsvpFields: unknown type "${spec.type}". Valid: ${Object.keys(RSVP_FIELD_PRESETS).join(", ")}, or "custom" with a label.`
      );
    }
    return {
      id: makeFieldId(),
      ...preset,
      label: (spec.label && spec.label.trim()) || preset.label,
      required: !!spec.required,
    };
  });
  return [...locked, ...custom];
}

// Creating and publishing pages is where the Creator subscription kicks in
// (typed 402 from the API — and per Felix 2026-07-06, CREATION itself is
// gated, drafts included). The MCP never dead-ends on it: the host gets a
// warm, exact pointer instead of a raw error.
const SUBSCRIPTION_NOTE_PUBLISH =
  "Publishing needs an active PullUp subscription (Creator — 125 kr/month, cancel anytime; " +
  "founding hosts from before July 2026 host free). Your draft is saved and nothing is lost: " +
  "subscribe at https://pullup.se/start or Settings → Billing, then publish again.";
const SUBSCRIPTION_NOTE_CREATE =
  "Creating pages on PullUp needs an active subscription (Creator — 125 kr/month, cancel " +
  "anytime; founding hosts from before July 2026 host free). Nothing was created yet: " +
  "subscribe at https://pullup.se/start or Settings → Billing, then ask again and I'll set " +
  "it up in one go.";

function isSubscriptionRequired(e) {
  return e?.status === 402 || e?.body?.error === "subscription_required";
}

function buildHandlers(api, hostId) {
  const resolveEventBySlug = resolveEventBySlugVia(api);

  async function createEvent(args) {
    const status = args.status || "DRAFT";
    const { extraRsvpFields, ...rest } = args;
    const payload = { ...rest, status };
    if (extraRsvpFields !== undefined) {
      payload.formFields = buildFormFieldsFromExtras(extraRsvpFields);
    }
    if (Array.isArray(payload.sections)) payload.sections = normalizeSections(payload.sections);
    let event;
    try {
      event = await api("POST", "/events", { body: payload });
    } catch (e) {
      if (!isSubscriptionRequired(e)) throw e;
      // Creation itself is behind the tier — no draft fallback exists.
      return toolResultText(`Not created — ${SUBSCRIPTION_NOTE_CREATE}`);
    }
    const { completeness, performance, top } = await buildEventCoaching(event);

    const preview = editUrlForEventId(event.id);
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
      completeness,
      performance,
      nextSuggestion: top,
    });
    return toolResultText(banner);
  }

  async function updateEvent(args) {
    const { slug, extraRsvpFields, ...rest } = args;
    const existing = await resolveEventBySlug(slug);
    const patch = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined)
    );
    if (extraRsvpFields !== undefined) {
      patch.formFields = buildFormFieldsFromExtras(extraRsvpFields);
    }
    // Host-customizable visual theming was removed; `brand` is no longer an
    // editable field (the AI hero lives at events.scene via set_event_scene).
    let updated;
    let paywallNote = null;
    try {
      updated = await api("PUT", `/host/events/${existing.id}`, { body: patch });
    } catch (e) {
      if (!isSubscriptionRequired(e) || patch.status !== "PUBLISHED") throw e;
      // Save the edits without the publish flip, then say why.
      const { status: _dropped, ...withoutStatus } = patch;
      updated = await api("PUT", `/host/events/${existing.id}`, { body: withoutStatus });
      paywallNote = SUBSCRIPTION_NOTE_PUBLISH;
    }

    const newSlug = updated.slug || slug;
    const status = updated.status || existing.status;
    const { completeness, performance, top } = await buildEventCoaching({
      ...existing,
      ...updated,
      slug: newSlug,
    });
    return toolResultText(
      eventBanner({
        title: updated.title || existing.title,
        status,
        previewUrl: editUrlForEventId(updated.id || existing.id),
        shareUrl: status === "PUBLISHED" ? shareUrlForSlug(newSlug) : null,
        rsvpsUrl: rsvpsDashboardForId(updated.id || existing.id),
        note: paywallNote ? `Updated (still a draft). ${paywallNote}` : "Updated.",
        completeness,
        performance,
        nextSuggestion: top,
      })
    );
  }

  // Set a generative animated hero — the host's "go nuts" zone. Stores
  // self-contained scene code (markup + <style>/<script>) at events.scene
  // (migration 104; was events.brand.design); the frontend renders it in a
  // sandboxed iframe (it can look like anything but can't collect data or hit
  // the network — see SceneFrame.jsx). Hero only; the rest of the page stays
  // the trusted block system.
  async function setEventScene(args) {
    const { slug, html, poster, palette } = args;
    if (!html || typeof html !== "string" || !html.trim()) {
      throw new Error("html is required: the scene as an HTML fragment (markup + <style>/<script>).");
    }
    if (html.length > 200000) {
      throw new Error("Scene is too large (>200KB). Keep the hero lean so it stays smooth on mobile.");
    }
    const existing = await resolveEventBySlug(slug);
    // Read the prior scene so a palette-less re-author keeps the existing colors.
    const full = await api("GET", `/host/events/${existing.id}`);
    const priorScene = (full && typeof full.scene === "object" && full.scene) || {};
    // Palette (this call's, else whatever the previous scene carried) drives
    // body vibe-matching + the still-fallback gradient.
    const colors = Array.isArray(palette) && palette.length
      ? palette.filter((c) => typeof c === "string").slice(0, 4)
      : priorScene.params?.colors || null;
    const nextScene = {
      archetype: "scene",
      html,
      ...(poster ? { poster } : {}),
      ...(colors ? { params: { colors } } : {}),
    };
    const updated = await api("PUT", `/host/events/${existing.id}`, { body: { scene: nextScene } });
    const status = updated.status || existing.status;
    return toolResultText(
      eventBanner({
        title: updated.title || existing.title,
        status,
        previewUrl: editUrlForEventId(updated.id || existing.id),
        shareUrl: status === "PUBLISHED" ? shareUrlForSlug(updated.slug || slug) : null,
        rsvpsUrl: rsvpsDashboardForId(updated.id || existing.id),
        note: "Built a custom animated hero. It renders live in the editor — preview it, then publish when it feels right.",
      })
    );
  }

  async function publishEvent(args) {
    const existing = await resolveEventBySlug(args.slug);
    let updated;
    try {
      updated = await api("PUT", `/host/events/${existing.id}/publish`);
    } catch (e) {
      if (!isSubscriptionRequired(e)) throw e;
      return toolResultText(
        `Not published — ${SUBSCRIPTION_NOTE_PUBLISH}\nPreview (draft, safe): ${editUrlForEventId(existing.id)}`,
      );
    }
    return toolResultText(
      eventBanner({
        title: updated.title || existing.title,
        status: "PUBLISHED",
        previewUrl: editUrlForEventId(existing.id),
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
        previewUrl: editUrlForEventId(existing.id),
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

    const preview = editUrlForEventId(existing.id);
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
      `Uploaded a new cover for "${existing.title}".\n\n  Preview: ${editUrlForEventId(existing.id)}`
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
      await assertSafeFetchUrl(args.mediaUrl);
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
        `Uploaded ${detectedType} (${sizeHeader ? Math.round(sizeHeader / 1024 / 1024 * 10) / 10 + "MB" : "size unknown"}) to "${existing.title}".\n  Preview: ${editUrlForEventId(existing.id)}`
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
      `Uploaded ${detectedType} (~${(approxBytes / 1024 / 1024).toFixed(1)}MB) to "${existing.title}".\n  Preview: ${editUrlForEventId(existing.id)}`
    );
  }

  // Point the host straight at the event's edit page. Use when the host has a
  // local file (video, phone photo) and can't pass a URL or base64 — claude.ai
  // web has no filesystem access and the MCP envelope can't carry 100MB+
  // videos. The edit page has the drag-drop media area (talks straight to
  // Supabase storage) plus all the other event controls, so everything lives
  // in one place. Requires the host be signed in to PullUp in that browser.
  async function getMediaUploadLink(args) {
    const existing = await resolveEventBySlug(args.slug);
    // Short-lived, single-event capability. The host opens it from chat, drops
    // a file, and the focused page (frontend /m/:token) attaches it straight to
    // the event — no full editor, no separate login. See the /media-link/:token
    // routes in index.js.
    const token = generateWaitlistToken(
      { type: "media_upload", eventId: existing.id, hostId: hostId || null },
      { expiresIn: "2h" }
    );
    const url = frontendUrl(`/m/${token}`);
    return toolResultText(
      [
        `Quick upload link for "${existing.title}" — drop a video (up to 500MB) or photos (up to 50MB) and they attach straight to the event:`,
        ``,
        `  ${url}`,
        ``,
        `It's a focused uploader, not the full editor. Once the file lands, close the tab and come back here — tell me "done" and I'll confirm it's on the event. Link's good for 2 hours.`,
      ].join("\n")
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

  // The host's plan + billing state — the MCP twin of Settings → Billing.
  async function getBillingStatus() {
    const [s, sum] = await Promise.all([
      api("GET", "/host/subscription"),
      api("GET", "/host/billing/summary"),
    ]);
    const plan = s?.plan || {};
    const ent = s?.entitlement || {};
    const fmtDay = (iso) => {
      try { return new Date(iso).toISOString().slice(0, 10); } catch { return "soon"; }
    };
    const lines = [];
    if (ent.reason === "early" || plan.plan === "early") {
      lines.push("Plan: Founding member — hosting is free for this host, forever. Only the ticket fee ever applies.");
    } else if (plan.subscriptionStatus === "active") {
      const tierName = s?.tier?.name === "agency" ? "Agency" : "Creator";
      lines.push(
        `Plan: ${tierName} — ${s?.tier?.priceSek ?? 125} kr/month · ` +
          (plan.cancelAtPeriodEnd
            ? `cancelled, hosting until ${fmtDay(plan.currentPeriodEnd)} (resume anytime from Settings → Billing).`
            : `active, renews ${fmtDay(plan.currentPeriodEnd)}.`),
      );
      if (plan.founding) lines.push("Also a founding member: cancelling just returns them to hosting free.");
    } else if (plan.subscriptionStatus === "past_due") {
      lines.push("Plan: payment retrying — hosting continues during the grace window. Fix the card in Settings → Billing.");
    } else if (!s?.enforced) {
      lines.push("Plan: hosting is open on this deployment (subscriptions not enforced).");
    } else {
      lines.push(
        "Plan: not subscribed. Creating and publishing pages needs the Creator subscription — 125 kr/month, cancel anytime — at https://pullup.se/start or Settings → Billing.",
      );
    }
    lines.push(
      `Ticket fee: ${((sum?.plan?.ticketFeeBps ?? 300) / 100).toFixed(0)}% on paid tickets — the only usage fee. Agency (for teams) is coming soon via hello@pullup.se.`,
    );
    const byCur = Object.entries(sum?.month?.byCurrency || {}).filter(
      ([, v]) => (v.grossCents || 0) > 0 || (v.feeCents || 0) > 0,
    );
    if (byCur.length) {
      for (const [cur, v] of byCur) {
        lines.push(`This month: sold ${fmtMoney(v.grossCents || 0, cur)} in tickets · PullUp fee ${fmtMoney(v.feeCents || 0, cur)}.`);
      }
    } else {
      lines.push("This month: no ticket sales yet.");
    }
    return toolResultText(lines.join("\n"));
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

    return toolResultText(lines.join("\n"));
  }

  async function duplicateEvent(args) {
    const src = await resolveEventBySlug(args.slug);
    // Delegate to the shared duplicate endpoint so chat and the dashboard button
    // behave identically — same clone semantics (theme, sections, settings,
    // location pin, AND the media gallery), always landing as a DRAFT. Optional
    // title/startsAt overrides ride through; they default server-side otherwise.
    const { event: created } = await api(
      "POST",
      `/host/events/${src.id}/duplicate`,
      { body: { title: args.title, startsAt: args.startsAt } },
    );

    return toolResultText(
      eventBanner({
        title: created.title,
        status: "DRAFT",
        previewUrl: editUrlForEventId(created.id),
        rsvpsUrl: rsvpsDashboardForId(created.id),
        note: `Duplicated from "${src.title || src.slug}". Update or publish when ready.`,
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
    const raw = await api("GET", `/host/crm/people/${args.personId}`);
    if (!raw) return toolResultText(`No person found with id ${args.personId}.`);
    // The detail endpoint returns { person, touchpoints }. Tolerate a flattened
    // shape too so this stays robust if the API ever changes.
    const p = raw.person || raw;
    const touchpoints = raw.touchpoints || p.touchpoints || {};
    const notes = Array.isArray(touchpoints.notes) ? touchpoints.notes : [];

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
    ].filter(Boolean);

    if (Array.isArray(events) && events.length > 0) {
      lines.push("");
      lines.push(`Recent events:`);
      for (const e of events.slice(0, 8)) {
        const when = e.startsAt ? new Date(e.startsAt).toLocaleDateString("en-GB") : "—";
        lines.push(`  • ${e.title || "(untitled)"}  (${when})  → slug: ${e.slug || "—"}`);
      }
    }

    // Timeline notes — the host's running log of what they've learned about
    // this person. This is the richest context for personalising a follow-up.
    if (notes.length > 0) {
      const titleById = {};
      for (const e of events) if (e && e.id) titleById[e.id] = e.title;
      lines.push("");
      lines.push(`Notes (${notes.length}):`);
      for (const n of notes.slice(0, 10)) {
        const when = n.noteDate
          ? new Date(`${n.noteDate}T00:00:00`).toLocaleDateString("en-GB")
          : "—";
        const evt = n.eventId && titleById[n.eventId] ? ` @ ${titleById[n.eventId]}` : "";
        const topic = n.topic ? ` [${n.topic}]` : "";
        lines.push(`  • ${when}${evt}${topic} — ${n.content}`);
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

  async function addPersonNote(args) {
    const { personId, ...rest } = args;
    const body = Object.fromEntries(
      Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== "")
    );
    const note = await api("POST", `/host/crm/people/${personId}/notes`, { body });
    const when = note?.noteDate
      ? new Date(`${note.noteDate}T00:00:00`).toLocaleDateString("en-GB")
      : "today";
    const topic = note?.topic ? `  [${note.topic}]` : "";
    return toolResultText(
      `Noted on ${when}${topic}\n  "${note?.content || rest.content}"`
    );
  }

  async function findMatches(args) {
    const limit = args.limit || 10;
    const data = await api("GET", `/host/crm/people/${args.personId}/matches`, { query: { limit } });
    const matches = data?.matches || [];
    if (!matches.length) {
      return toolResultText("No clear matches yet — not enough shared events or linked profiles to connect them to anyone.");
    }
    const subj = data?.subject?.name ? ` for ${data.subject.name}` : "";
    const lines = matches.map((m, i) =>
      `${i + 1}. ${m.name}  (score ${m.score})\n   ${(m.reasons || []).join(" · ")}`
    );
    return toolResultText(`Closest people${subj}:\n${lines.join("\n")}`);
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

  // ── Coaching: brief + analyzer plumbing ──────────────────────────
  // Best-effort cache of the host brief within one MCP request. Reading
  // the profile costs a DB hit + storage signed-URL calls, so we don't
  // want to pay it on every event mutation in the same chat turn.
  let cachedBrief = null;
  let cachedBriefLoaded = false;
  async function loadBriefForCoaching() {
    if (cachedBriefLoaded) return cachedBrief;
    cachedBriefLoaded = true;
    try {
      const profile = await api("GET", "/host/profile");
      cachedBrief = profile?.hostBrief || "";
    } catch {
      cachedBrief = "";
    }
    return cachedBrief;
  }

  // Pull event analytics (page views, RSVPs, conversion, fill) for PUBLISHED
  // events so the coach can ground suggestions in real numbers. Best-effort —
  // a failed/missing analytics fetch just means no performance line and no
  // performance signals; everything else still works.
  async function fetchAnalyticsForCoaching(event) {
    if (!event?.id) return null;
    if (event.status !== "PUBLISHED") return null;
    try {
      const periodEnd = new Date();
      const periodStart = new Date(periodEnd.getTime() - 30 * 86400000);
      return await api("GET", `/host/events/${event.id}/analytics`, {
        query: {
          startDate: periodStart.toISOString(),
          endDate: periodEnd.toISOString(),
        },
      });
    } catch {
      return null;
    }
  }

  // Bundle: { completeness, performance, top } for inline banners.
  async function buildEventCoaching(event) {
    if (!event) return { completeness: null, performance: null, top: null };
    let media = [];
    let allEvents = [];
    try {
      const m = await api("GET", `/host/events/${event.id}/media`);
      media = Array.isArray(m) ? m : (m?.media || []);
    } catch {
      // non-fatal — fall back to event.imageUrl
    }
    try {
      allEvents = await api("GET", "/events");
    } catch {
      allEvents = [];
    }
    const brief = await loadBriefForCoaching();
    const analytics = await fetchAnalyticsForCoaching(event);
    const { suggestions, performance } = analyzeEvent({
      event,
      brief,
      media,
      allEvents,
      analytics,
    });
    const top = suggestions[0] || null;
    return {
      completeness: completenessSummary({ event, media }),
      performance: performance?.line || null,
      top,
    };
  }

  // ── Host brief: read + write ────────────────────────────────────
  async function getHostBrief() {
    let brief = "";
    try {
      const profile = await api("GET", "/host/profile");
      brief = profile?.hostBrief || "";
    } catch {
      brief = "";
    }
    cachedBrief = brief;
    cachedBriefLoaded = true;
    if (!brief) {
      return toolResultText(
        [
          "No host brief set yet.",
          "",
          "Ask the host one short question — 'Tell me what you're building. What kinds of events, who are they for, where do you want to take this?' — then call set_host_brief with their answer.",
          "From then on, every event-creation suggestion will be calibrated to this brief.",
        ].join("\n")
      );
    }
    return toolResultText(
      [
        "Host brief (use this to calibrate suggestions for THIS host):",
        "",
        brief,
      ].join("\n")
    );
  }

  async function setHostBrief(args) {
    const brief = String(args.brief || "").trim();
    if (!brief) throw new Error("brief is required (1–3 paragraphs).");
    await api("PUT", "/host/profile", { body: { hostBrief: brief } });
    cachedBrief = brief;
    cachedBriefLoaded = true;
    return toolResultText(
      [
        "Saved. From now on, every event suggestion is tuned to this brief.",
        "",
        brief,
      ].join("\n")
    );
  }

  // ── CRM signals ─────────────────────────────────────────────────
  // Pulls segments + recent activity in parallel, runs the analyzer,
  // formats a short ranked list. Pure read-only — the host decides
  // what to act on.
  async function getCrmSignals(args) {
    const days = args.days || 30;
    const [segments, recent, brief] = await Promise.all([
      api("GET", "/host/crm/segments", { query: { topN: 5 } }).catch(() => null),
      api("GET", "/host/crm/recent", { query: { days } }).catch(() => null),
      loadBriefForCoaching(),
    ]);

    const { suggestions } = analyzeCrmSignals({
      segments,
      recent: { ...(recent || {}), days },
      brief,
    });

    const limit = Math.max(1, Math.min(10, args.limit || 5));
    const top = suggestions.slice(0, limit);
    if (top.length === 0) {
      return toolResultText(
        `No high-impact CRM signals right now — your roster looks tended. Pop back in after the next event or call get_crm_summary for the wider picture.`
      );
    }
    const lines = [
      `CRM signals — who's worth a touch right now (window: last ${days}d)`,
      "",
    ];
    top.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.headline}`);
      if (s.why) lines.push(`   ${s.why}`);
      if (s.call) lines.push(`   → ${s.call}`);
      lines.push("");
    });
    return toolResultText(lines.join("\n").trim());
  }

  // ── On-demand: full ranked list of improvements for one event ───
  async function suggestEventImprovements(args) {
    const existing = await resolveEventBySlug(args.slug);
    let media = [];
    let allEvents = [];
    try {
      const m = await api("GET", `/host/events/${existing.id}/media`);
      media = Array.isArray(m) ? m : (m?.media || []);
    } catch { /* fall through */ }
    try {
      allEvents = await api("GET", "/events");
    } catch { /* fall through */ }
    const brief = await loadBriefForCoaching();
    const analytics = await fetchAnalyticsForCoaching(existing);
    const { category, series, suggestions, performance } = analyzeEvent({
      event: existing,
      brief,
      media,
      allEvents,
      analytics,
    });

    const limit = Math.max(1, Math.min(10, args.limit || 5));
    const top = suggestions.slice(0, limit);
    if (top.length === 0) {
      return toolResultText(
        [
          `"${existing.title}" is in good shape — nothing high-impact stands out.`,
          performance?.line ? `Performance: ${performance.line}` : null,
          "",
          `Detected category: ${category}.${series?.prior ? ` (series: prior was "${series.prior.title}")` : ""}`,
          brief ? "" : "Tip: call get_host_brief / set_host_brief to give the AI more context about who this is for.",
        ].filter(Boolean).join("\n")
      );
    }
    const lines = [
      `Suggestions for "${existing.title}"  (category: ${category}${series?.prior ? `, series: "${series.prior.title}"` : ""})`,
    ];
    if (performance?.line) lines.push(`Performance: ${performance.line}`);
    lines.push("");
    top.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.headline}`);
      if (s.why) lines.push(`   ${s.why}`);
      if (s.call) lines.push(`   → ${s.call}`);
      lines.push("");
    });
    if (!brief) {
      lines.push("Tip: set_host_brief once to sharpen these suggestions for this host's specific journey.");
    }
    return toolResultText(lines.join("\n").trim());
  }

  async function auditCustomerJourney(args) {
    const existing = await resolveEventBySlug(args.slug);
    let media = [];
    let allEvents = [];
    try {
      const m = await api("GET", `/host/events/${existing.id}/media`);
      media = Array.isArray(m) ? m : (m?.media || []);
    } catch { /* fall through */ }
    try {
      allEvents = await api("GET", "/events");
    } catch { /* fall through */ }
    const brief = await loadBriefForCoaching();
    const analytics = await fetchAnalyticsForCoaching(existing);

    const audit = auditJourney({
      event: existing,
      brief,
      media,
      allEvents,
      analytics,
    });

    const lines = [
      `Customer-journey audit — "${existing.title}" [${existing.status}]`,
      "",
    ];
    for (const [, stage] of Object.entries(audit.stages)) {
      const marker =
        stage.status === "good" ? "✓" : stage.status === "warn" ? "·" : "✗";
      lines.push(`  ${marker} ${stage.label}${stage.headline ? ` — ${stage.headline}` : ""}`);
      for (const fix of stage.fixes) {
        lines.push(`      • ${fix.headline}`);
        if (fix.why) lines.push(`        ${fix.why}`);
        if (fix.call) lines.push(`        → ${fix.call}`);
      }
    }
    if (audit.ranked_breakpoints.length > 0) {
      lines.push("");
      lines.push("  Biggest break in the journey:");
      const top = audit.ranked_breakpoints[0];
      lines.push(`    ${top.headline}`);
      if (top.why) lines.push(`    ${top.why}`);
      if (top.call) lines.push(`    → ${top.call}`);
    } else {
      lines.push("");
      lines.push("  No clear breakpoints — the journey reads end-to-end.");
    }

    return toolResultText(lines.join("\n"));
  }

  // ── Recent actions ─────────────────────────────────────────────
  // Reads from host_actions — every mutating action the host took, via UI
  // or chat, in MCP-tool shape. Lets the coach "know what just happened"
  // when a new chat opens cold.
  async function getRecentActions(args) {
    const limit = Math.max(1, Math.min(100, args.limit || 25));
    const query = { limit };
    if (args.since) query.since = args.since;
    if (args.targetType) query.targetType = args.targetType;
    if (args.targetId) query.targetId = args.targetId;
    if (args.source) query.source = args.source;

    let resp;
    try {
      resp = await api("GET", "/host/actions/recent", { query });
    } catch (err) {
      return toolResultText(`Couldn't load the action log: ${err.message}`);
    }
    const items = resp?.items || [];
    if (items.length === 0) {
      return toolResultText("No actions logged in that window yet.");
    }

    // Compact text rendering — newest first, one line per action with a
    // hint about source so the assistant can tell what the host did
    // in the app vs in chat.
    const lines = [
      `Recent actions (${items.length} of last ${limit})`,
      "",
    ];
    for (const a of items) {
      const when = relativeTime(a.created_at);
      const tgt =
        a.target_type && a.target_id
          ? ` [${a.target_type}:${shortId(a.target_id)}]`
          : "";
      const detail = summarizeAction(a);
      lines.push(`${when} · ${a.source} · ${a.tool}${tgt}${detail ? ` — ${detail}` : ""}`);
    }
    return toolResultText(lines.join("\n"));
  }

  // ── Context pack — the portable smart twin ────────────────────────────
  // Data ownership that carries the intelligence, not just rows: a markdown
  // brief of the host's world (or one person) you paste into ANY AI so it
  // knows this creator as of PullUp.
  async function exportContextPack(args) {
    const query = {};
    if (args.includePeople === true) query.people = "true";
    if (args.peopleLimit) query.limit = args.peopleLimit;
    const pack = await api("GET", "/host/context-pack", { query });
    const md = pack?.markdown || "(empty — no world yet)";
    const dl =
      "/host/context-pack?format=markdown" +
      (args.includePeople ? "&people=true" : "");
    const footer = [
      "",
      "—",
      `Portable context pack: paste this into any AI to brief it on this creator's world as of PullUp. Raw .md download: ${dl}`,
    ].join("\n");
    return toolResultText(md + "\n" + footer);
  }

  async function exportPersonPack(args) {
    let personId = args.personId || null;
    if (!personId && args.query) {
      const found = await api("GET", "/host/crm/people", {
        query: { search: args.query, limit: 1 },
      });
      const list = Array.isArray(found) ? found : found?.people || [];
      if (!list.length) throw new Error(`No person found matching "${args.query}".`);
      personId = list[0].id;
    }
    if (!personId) {
      throw new Error("Provide personId or query (a name, email, or @handle).");
    }
    const pack = await api("GET", `/host/context-pack/people/${personId}`);
    return toolResultText(pack?.markdown || "(empty)");
  }

  return {
    createEvent,
    updateEvent,
    setEventScene,
    publishEvent,
    unpublishEvent,
    listEvents,
    getEvent,
    listRsvps,
    uploadEventImage,
    uploadEventMedia,
    getMediaUploadLink,
    listCoverImageGallery,
    getCrmSummary,
    getRevenueSummary,
    getBillingStatus,
    getAttendanceTrends,
    getAudienceSegments,
    getRecentActivity,
    // Slice A — Events completion
    getEventAnalytics,
    duplicateEvent,
    deleteEvent,
    // Slice B — CRM completion
    findPerson,
    getPerson,
    queryPeople,
    updatePerson,
    addPersonNote,
    findMatches,
    // Slice D — Guest actions
    updateRsvp,
    refundPayment,
    // Slice E — AI coaching
    getHostBrief,
    setHostBrief,
    suggestEventImprovements,
    getCrmSignals,
    auditCustomerJourney,
    getRecentActions,
    // Portable smart twin — data ownership that carries the intelligence
    exportContextPack,
    exportPersonPack,
  };
}

// Compact "5 min ago" / "2h ago" / "3d ago" — keeps action-log output
// scannable inside chat without dragging in moment/date-fns.
function relativeTime(iso) {
  if (!iso) return "?";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "?";
  const diffSec = Math.floor((Date.now() - then) / 1000);
  if (diffSec < 60) return `${Math.max(diffSec, 0)}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function shortId(id) {
  const s = String(id || "");
  return s.length > 10 ? s.slice(0, 8) : s;
}

// Pull a short human detail out of an action's args+result so the log line
// is useful at a glance. Keeps the renderer dumb on unknown tools.
function summarizeAction(a) {
  const r = a.result || {};
  const args = a.args || {};
  switch (a.tool) {
    case "create_event":
    case "update_event":
    case "publish_event":
    case "unpublish_event":
    case "delete_event":
      return [args.title, r.slug, r.status].filter(Boolean).join(" · ");
    case "upload_event_image":
    case "upload_event_media":
      return r.url ? `→ ${r.url}` : null;
    case "update_rsvp":
      return [args.status || r.status].filter(Boolean).join(" · ");
    case "refund_payment":
      return r.amount != null ? `amount ${r.amount}${r.isFullRefund ? " (full)" : ""}` : null;
    case "update_person":
      return r.name || null;
    case "add_person_note": {
      const c = String(args.content || "");
      return c ? `"${c.length > 60 ? `${c.slice(0, 60)}…` : c}"` : null;
    }
    default:
      return null;
  }
}

// SSRF guard for any user-supplied URL we're about to fetch. PAT-holders
// would otherwise be able to point upload_event_image / upload_event_media at
// http://169.254.169.254/latest/meta-data/iam/... (AWS metadata) or
// http://127.0.0.1:3001 to probe internal services. Restrict scheme to https
// and reject any hostname that resolves to a private / link-local / loopback
// address. There is a residual DNS-rebind window between this check and the
// real fetch — acceptable for an MCP tool but worth knowing.
function isPrivateOrReservedIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  if (a === 0) return true;                                   // 0.0.0.0/8
  if (a === 10) return true;                                  // 10.0.0.0/8
  if (a === 127) return true;                                 // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true;                    // 169.254/16 link-local incl. AWS metadata
  if (a === 172 && b >= 16 && b <= 31) return true;           // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                    // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true;          // 100.64/10 CGNAT
  if (a >= 224) return true;                                  // multicast + reserved
  return false;
}

function isPrivateOrReservedIPv6(ip) {
  const lower = ip.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true;                 // link-local fe80::/10
  if (/^f[cd]/.test(lower)) return true;                      // unique local fc00::/7
  if (lower.startsWith("::ffff:")) {                          // v4-mapped
    const v4 = lower.slice(7);
    if (net.isIPv4(v4)) return isPrivateOrReservedIPv4(v4);
  }
  return false;
}

async function assertSafeFetchUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (u.protocol !== "https:") {
    throw new Error("URL must use https://.");
  }
  const host = u.hostname;
  if (net.isIP(host)) {
    if (net.isIPv4(host) && isPrivateOrReservedIPv4(host)) {
      throw new Error("URL points to a private/reserved IP.");
    }
    if (net.isIPv6(host) && isPrivateOrReservedIPv6(host)) {
      throw new Error("URL points to a private/reserved IP.");
    }
    return u;
  }
  let addrs;
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (err) {
    throw new Error(`Could not resolve URL host: ${err.message}`);
  }
  for (const { address, family } of addrs) {
    if (family === 4 && isPrivateOrReservedIPv4(address)) {
      throw new Error("URL resolves to a private/reserved IP.");
    }
    if (family === 6 && isPrivateOrReservedIPv6(address)) {
      throw new Error("URL resolves to a private/reserved IP.");
    }
  }
  return u;
}

async function fetchAsBuffer(url) {
  await assertSafeFetchUrl(url);
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

// MCP standard tool annotations let an annotation-aware client (and the
// connected model) reason about a tool's safety without parsing its prose:
// readOnlyHint (no state change), destructiveHint (irreversible / hard to
// undo — money or real people), idempotentHint (re-running with the same args
// changes nothing further). We classify by name in one place so every tool —
// and every future one — declares its blast radius.
const READ_ONLY_TOOLS = new Set([
  "list_events", "get_event", "list_rsvps", "list_cover_image_gallery",
  "get_crm_summary", "get_revenue_summary", "get_billing_status", "get_attendance_trends",
  "get_audience_segments", "get_recent_activity",
  "get_event_analytics", "find_person", "get_person", "query_people",
  "find_matches",
  "suggest_event_improvements",
  "get_crm_signals", "audit_customer_journey",
  "get_recent_actions", "get_host_brief",
  "export_context_pack", "export_person_pack",
]);

// Irreversible: moves real money or reaches real people in a way you can't take
// back. These are the tools a client should gate hardest.
const DESTRUCTIVE_TOOLS = new Set([
  "delete_event", "refund_payment",
]);

// Mutating but safe to repeat with the same args (re-applying lands the same
// state). Not auto-safe like reads, but cheap to retry.
const IDEMPOTENT_TOOLS = new Set([
  "publish_event", "unpublish_event", "set_host_brief", "update_event",
  "set_event_scene", "update_person", "update_rsvp",
]);

function annotateTool(t) {
  const annotations = { title: t.title };
  if (READ_ONLY_TOOLS.has(t.name)) {
    annotations.readOnlyHint = true;
    return annotations;
  }
  annotations.readOnlyHint = false;
  annotations.destructiveHint = DESTRUCTIVE_TOOLS.has(t.name);
  if (IDEMPOTENT_TOOLS.has(t.name)) annotations.idempotentHint = true;
  return annotations;
}

// One spine, many heads. The server is stateless so it can't lazy-load tools,
// but it can serve a right-sized slice per URL: /mcp/create mounts the
// event-builder head (which by construction can't refund, send, or delete —
// smaller blast radius), /mcp/crm the relationship-ops head, /mcp the full
// power cockpit. Profiles are name allow-lists; null/unknown ⇒ the full surface
// (never silently empty).
const TOOL_PROFILES = {
  create: new Set([
    "create_event", "update_event", "set_event_scene", "publish_event",
    "unpublish_event", "duplicate_event", "get_event", "list_events",
    "upload_event_image", "upload_event_media", "get_media_upload_link",
    "list_cover_image_gallery", "suggest_event_improvements",
    "get_event_analytics", "get_host_brief", "set_host_brief",
  ]),
  crm: new Set([
    "find_person", "get_person", "query_people", "update_person",
    "find_matches",
    "add_person_note", "get_crm_summary", "get_crm_signals",
    "get_audience_segments", "get_attendance_trends",
    "get_revenue_summary", "get_billing_status", "refund_payment", "list_rsvps",
    "update_rsvp", "list_events", "get_event", "get_event_analytics",
    "audit_customer_journey", "get_recent_activity", "get_recent_actions",
    "get_host_brief",
    "export_context_pack", "export_person_pack",
  ]),
};

// Known profile names, for callers that want to validate a URL segment.
export const MCP_PROFILES = Object.keys(TOOL_PROFILES);

export function buildTools(ctx) {
  const api = makeApi(ctx.token);
  const h = buildHandlers(api, ctx?.user?.id || null);
  const allow = TOOL_PROFILES[ctx?.profile] || null;
  const defs = [
    {
      name: "create_event",
      title: "Create a PullUp event",
      description:
        "Creates a new event on PullUp. Defaults to DRAFT so the host can preview before going public. Returns the preview/share URLs. Pass status='PUBLISHED' to publish immediately. Build a rich page: `sections` for the styled body (text blocks, hosted-by credits, music embeds) and `titleSettings` for title typography. PullUp renders one clean default look — there is no per-event brand theming.",
      inputSchema: CreateEventInput,
      handler: h.createEvent,
    },
    {
      name: "update_event",
      title: "Update a PullUp event",
      description:
        "Updates fields on an existing event. Pass only the fields you want to change. Works on DRAFT and PUBLISHED events alike. Pass `sections` to replace the page body (ordered content blocks) and `titleSettings` for title typography. Note: `sections` REPLACES the whole body — pass the complete set of blocks you want, not just a delta. For tweaking one block on an existing rich page, the host's editor is better.",
      inputSchema: UpdateEventInput,
      handler: h.updateEvent,
    },
    {
      name: "set_event_scene",
      title: "Build a generative animated hero",
      description:
        "Sets the event's HERO to a custom animated scene you author as code — the one place to 'go nuts' visually (bubble/metaball bursts, liquid metal, particles, parallax, glowing 3D-feel headline type, scanlines, etc.). Use this when the host wants a look the preset shader + cover can't express. Hero-only and purely decorative; the rest of the page (title, sections, RSVP) stays PullUp's trusted system.\n\nPass `html` as a self-contained FRAGMENT: markup PLUS inline <style> and <script>. No <html>/<head>/<body> — those and a strict sandbox are provided.\n\nTECHNIQUE — make it RELIABLE (it renders live on a real guest page; a blank/erroring hero is a FAILURE):\n• Use ONLY 2D <canvas> (getContext('2d')) + CSS animations/transforms. They are bulletproof one-shot and do everything you need: metaball/bubble bursts, liquid, bloom/glow, gradients, parallax, scanlines, and big 3D-FEEL depth + headline type via CSS 3D transforms + gradient/background-clip text.\n• WebGL/GLSL is BANNED — do NOT call getContext('webgl'|'webgl2'), do NOT write shaders (no createShader/gl_FragColor/precision). One-shot shader code reliably fails to compile/link and floods the console with errors + renders blank. Achieve any '3D'/'bubble'/'shiny' look with 2D canvas (radial-gradient spheres with specular highlights, additive blending, blur) + CSS instead. There is no acceptable reason to use WebGL here.\n• ALWAYS paint a CSS background (a palette gradient) on the root element, so even if an animation layer fails the hero still looks designed — never blank or gray.\n• Render visible content on the FIRST frame.\n\nAESTHETIC — aim for premium, of-the-moment design (liquid chrome, iridescent metaball blobs, molten-metal typography, holographic sheen on soft gradient backdrops — high gloss, not flat). Reliable 2D recipes for that look:\n• CHROME/METAL fill (shapes OR text): a near-vertical gradient ramping white→silver→dark-grey→white (fake reflection) + a small bright specular highlight (white radial) + a darker rim and a thin top white edge for gloss.\n• IRIDESCENT/HOLOGRAPHIC: overlay a slowly-rotating conic or linear RAINBOW gradient (cyan→magenta→violet→teal) at low opacity with ctx.globalCompositeOperation 'overlay'/'screen' (or CSS mix-blend-mode) — the oil-slick sheen in the references.\n• LIQUID / GOO (molten 'wet' text + merging blobs): apply the classic SVG goo filter — <filter><feGaussianBlur stdDeviation=N result=b/><feColorMatrix in=b type=matrix values=\"1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 19 -9\"/></filter>. CRITICAL: CALIBRATE the blur to the type size and keep it LIGHT — the headline MUST stay LEGIBLE. Letters keep their recognizable forms with bubbled/liquid edges that merge ONLY where they touch (like the POLE DANCE reference); they must NOT dissolve into unreadable blobs (too-high stdDeviation is the #1 failure). Start subtle and only merge at contact points. Then SHADE the gooey type with the chrome gradient + a specular highlight + the iridescent overlay so it reads as liquid SILVER/CHROME — never flat white. Animate as a slow liquid breathe, not a melt.\n• METABALLS in canvas: soft radial-gradient circles drawn with 'lighter' (additive) blending, then a blur+contrast pass thresholds them into gooey blobs; shade with the chrome gradient + iridescent overlay.\n• BACKDROP: soft pale gradient (lavender / silver / cool grey) like the refs, subtle vignette + faint film grain.\n• TYPE: bold condensed display headline; you may make the TEXT ITSELF the chrome/liquid subject (chrome gradient fill + goo filter). Small monospace 'spec' labels (codes, vertical side text) add the editorial poster feel.\nCompose in layers: gradient backdrop → goo/metaball chrome blobs (+ iridescent overlay) → headline. Motion: slow, eased, looping.\n\nPOSTER COMPOSITION — compose the hero as a COMPLETE poster, not a background with a title under it. The event's headline/title is the typographic CENTERPIECE: big, bold display weight, with the chrome/liquid treatment, and the layout is built around it (it must stay legible). Add editorial 'poster furniture' like the references: a thin frame or corner brackets, a small monospace spec line (date · venue · a code/serial number), VERTICAL side labels, a divider line or asterisk/star marks, deliberate asymmetry + generous whitespace, and clear hierarchy (one dominant headline → secondary line → tiny spec text). Use the event's REAL title/date/location (given in CURRENT EVENT STATE) as the poster copy. When you put the headline in the poster, HIDE the page's duplicate structured title — in the same turn call update_event with titleSettings.visible=false. Date/location/RSVP stay intact in the trusted body below.\n\nHARD rules:\n• Sandboxed, NO network — never fetch/XHR/WebSocket/cookies/localStorage/external <script src>. Inline everything; it cannot and must not collect data.\n• Fully RESPONSIVE: fill 100% width/height, use vw/vh/%/clamp, handle window 'resize' (re-fit canvas to its parent). ONE scene serves a 360px phone and a wide desktop.\n• Keep it lean for mobile (cap particle counts / devicePixelRatio); pause on document.hidden.\n• Images only via https URLs the host provides (display only).\n\nProvide `poster` (https image URL) when you have one (still fallback for reduced-motion + link previews). Pass `palette` (the hero's dominant hex colors) so the page can vibe-match. AFTER this call, also update_event to harmonize the body (bg/button colors + title/section fonts matched to the hero) and add a Spotify player.",
      inputSchema: SceneInput,
      handler: h.setEventScene,
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
        "Adds media to an event's gallery. Supports images (jpg/png/webp/gif) up to 50MB and videos (mp4/webm/mov) up to 500MB. Pass a publicly fetchable mediaUrl (preferred for anything over ~5MB — server streams it directly to storage, bypassing MCP body limits) OR mediaBase64 for small inline content (≤30MB). Optionally set setAsCover=true for images to also make it the event's cover. For LOCAL files (anything that lives on the host's computer/phone without a public URL), call get_media_upload_link instead — claude.ai web can't read file paths.",
      inputSchema: UploadMediaInput,
      handler: h.uploadEventMedia,
    },
    {
      name: "get_media_upload_link",
      title: "Get a focused upload link for local files",
      description:
        "Returns a short-lived (2h) link to a focused, single-purpose uploader where the host drag-and-drops a local media file (image up to 50MB or video up to 500MB) and it attaches straight to the event. No full editor, no separate sign-in — the link itself authorizes the upload, and the host closes the tab to return to the chat. Use this whenever the host has a local file with no public URL: claude.ai web has no filesystem access and the MCP envelope can't carry large videos. After the host says they've uploaded, call get_event to confirm the media landed.",
      inputSchema: MediaUploadLinkInput,
      handler: h.getMediaUploadLink,
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
        "Returns gross/net revenue, refund totals, payment count, unique payers, and top-revenue events — all from Stripe payments tied to the host's events. Use this for 'how much have I made', 'what's my revenue', 'top-grossing events', refund questions, etc. (Ticket money only — for what the host PAYS PullUp, use get_billing_status.)",
      inputSchema: RevenueSummaryInput,
      handler: h.getRevenueSummary,
    },
    {
      name: "get_billing_status",
      title: "Get the host's PullUp plan & billing state",
      description:
        "The MCP twin of Settings → Billing: which plan the host is on (Creator 125 kr/month · Agency for teams coming soon · founding members host free forever), subscription status with renewal or end date, the 3% paid-ticket fee, and this month's ticket sales + fees. Use for 'am I subscribed', 'what does PullUp cost me', 'when does it renew', or whenever a publish came back subscription-required.",
      inputSchema: {},
      handler: h.getBillingStatus,
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
    // ─── Slice A — Events completion ────────────────────────────────
    {
      name: "get_event_analytics",
      title: "Get analytics for one event",
      description:
        "Returns per-event analytics: page views (unique + total), period-over-period change, device split, traffic sources, RSVPs, fill rate, conversion rate, show-up rate, and revenue. Use for 'how is photo-walk-2 doing', 'where are people coming from', 'what's my conversion rate'.",
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
        "Returns one person's full profile: identity fields (IG/twitter/tiktok/linkedin/company), tags, lifetime spend, every event they've attended, and the host's timeline notes about them. Use after find_person, or when the host references a specific person id.",
      inputSchema: GetPersonInput,
      handler: h.getPerson,
    },
    {
      name: "query_people",
      title: "Query people in the CRM",
      description:
        "Filter the CRM by attendance count, attendance to a specific event, lifetime spend range, tags, and marketing-consent status. Returns a list. Use for segmentation: 'who attended both walks', 'my top 20 spenders', 'people with the vip tag who consented to marketing', 'first-timers from last month'.",
      inputSchema: QueryPeopleInput,
      handler: h.queryPeople,
    },
    {
      name: "update_person",
      title: "Update a person's CRM fields",
      description:
        "Patches a person record. Pass only the fields to change. Useful for enriching contacts post-event: add an IG handle the host grabbed in person, replace the tag list, etc. tags is a FULL replacement (pass [] to clear). To log an observation about someone, use add_person_note instead.",
      inputSchema: UpdatePersonInput,
      handler: h.updatePerson,
    },
    {
      name: "find_matches",
      title: "Find a person's closest connections (with reasons)",
      description:
        "Given a person, ranks who else in the host's world is closest to them and WHY — shared events (co-attendance) fused with Instagram signals (reach tier, verified, follow reciprocity). Each match carries explainable reasons. Use for introductions ('who should meet Sara'), lookalikes ('find people like my top guest'), and curated invites.",
      inputSchema: FindMatchesInput,
      handler: h.findMatches,
    },
    {
      name: "add_person_note",
      title: "Add a timeline note about a person",
      description:
        "Logs a dated observation on a person's CRM timeline — what the host learned about them at an event ('talked Leica on the photowalk, wants to get into film'). Optionally tie it to the event it came up at and backdate it. These build a running history the host (and you) read back via get_person. Set `topic` to a clean one-word label when you can infer one — it's a hidden filter field, invisible in the host UI. Use this for narrative observations; use update_person tags for queryable labels.",
      inputSchema: AddPersonNoteInput,
      handler: h.addPersonNote,
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

    // ─── Slice E — AI coaching / hand-holding the host ─────────────
    {
      name: "get_host_brief",
      title: "Read the host's freeform brief",
      description:
        "Returns the host's saved brief — who they are, what kinds of events they run, who their audience is, what they're growing toward. If empty, returns a hint telling you to ask the host one short question and then call set_host_brief. ALWAYS call this near the start of a conversation: every event suggestion you make should be calibrated to this brief.",
      inputSchema: {},
      handler: h.getHostBrief,
    },
    {
      name: "set_host_brief",
      title: "Save the host's freeform brief",
      description:
        "Persists the host's brief (1–3 paragraphs) so it's available on every future conversation. Call this AFTER the host has actually told you about their events and audience — never invent the content. Overwrites any prior brief.",
      inputSchema: HostBriefSetInput,
      handler: h.setHostBrief,
    },
    {
      name: "suggest_event_improvements",
      title: "Get ranked next-step suggestions for one event",
      description:
        "Returns a prioritized list of the most impactful improvements for one event — cover media, vibe links, RSVP gating, description depth, series continuity, etc. — each with the exact MCP call to apply it. Category-aware, brief-aware, stakes-aware (intensity scales with event size and ticket price), and performance-grounded for PUBLISHED events. Use this when the host says 'what should I add' / 'is it ready' / 'how do I make this pop' / 'why isn't anyone signing up'.",
      inputSchema: SuggestImprovementsInput,
      handler: h.suggestEventImprovements,
    },
    {
      name: "get_crm_signals",
      title: "Proactive CRM insights — who's worth a touch right now",
      description:
        "Surfaces a short ranked list of CRM moves worth making this week: top spenders not yet VIP-tagged, recent newcomers worth a personal follow-up, regulars who may be drifting, marketing-consented people who haven't heard from the host in a while. Brief-aware (intimate hosts get bumped recency signals). Use this when the host says 'who should I be talking to' / 'how's the audience' / 'anything I'm missing in the CRM'.",
      inputSchema: CrmSignalsInput,
      handler: h.getCrmSignals,
    },
    {
      name: "audit_customer_journey",
      title: "Audit the full guest journey for one event",
      description:
        "Walks the four stages a guest experiences — social handoff (share card / IG / WhatsApp paste), event page (cover / copy / vibe links), RSVP form (friction / capture), and emails (promo / day-of / follow-up) — and returns a stage-by-stage report with the single biggest breakpoint surfaced first. Use this when the host says 'how does this look end-to-end', 'audit my event', 'is the journey tight', or before publishing/sharing a major event. Complements suggest_event_improvements (which focuses on the page) with the stages around it.",
      inputSchema: AuditJourneyInput,
      handler: h.auditCustomerJourney,
    },
    {
      name: "get_recent_actions",
      title: "What did the host just do (UI + chat)",
      description:
        "Returns the host's recent mutating actions across the whole product, in MCP-tool shape — anything they did in the web app AND anything done via this MCP. Use this at the START of a fresh chat to ground the assistant ('I see you just published Volume 01 and checked in 40 guests') or when the host asks 'what did I do this week' / 'pick up where I left off'. Optional filters: targetType ('event' | 'person' | 'rsvp' | 'payment'), targetId, source ('ui' | 'chat'), since (ISO datetime).",
      inputSchema: GetRecentActionsInput,
      handler: h.getRecentActions,
    },
    {
      name: "export_context_pack",
      title: "Export the host's portable smart twin",
      description:
        "Builds the host's PORTABLE CONTEXT PACK — who they are (brief + brand), the shape of their world (people, events, regulars, dinner-goers, spenders), and the resolved intelligence normally locked inside PullUp (core people who keep coming back, regulars who've gone quiet, biggest spenders). Returns ready-to-paste markdown you hand to ANY AI so it knows this creator as of PullUp — the smarts, not just rows. Set includePeople=true to embed the people of their world too. This is the host THEMSELVES; use export_person_pack for one specific person. Use when the host says 'export my data / give me my AI brief / what does PullUp know about me'.",
      inputSchema: ContextPackInput,
      handler: h.exportContextPack,
    },
    {
      name: "export_person_pack",
      title: "Export one person's resolved record",
      description:
        "Builds ONE person's portable pack — their identity fused across every channel (email / phone / Instagram), their full history with the host, IG reach + follow reciprocity, the host's private notes, and who they're closest to in the host's world. Pass personId or a query (name / email / @handle). Returns markdown you can feed to an AI so it knows this person as of PullUp. Use export_context_pack for the host themselves or the whole world.",
      inputSchema: PersonPackInput,
      handler: h.exportPersonPack,
    },
  ];
  const scoped = allow ? defs.filter((t) => allow.has(t.name)) : defs;
  return scoped.map((t) => ({ ...t, annotations: annotateTool(t) }));
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
