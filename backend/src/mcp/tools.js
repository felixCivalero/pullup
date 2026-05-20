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

    const lines = [
      `Email campaigns: ${t.campaigns_sent} sent`,
      `  Total sends:    ${t.total_sent || 0}`,
      `  Delivered:      ${t.total_delivered || 0}`,
      `  Opened:         ${t.total_opened || 0}  (${pct(t.open_rate_pct)})`,
      `  Clicked:        ${t.total_clicked || 0}  (${pct(t.click_rate_pct)})`,
      `  Bounced:        ${t.total_bounced || 0}  (${pct(t.bounce_rate_pct)})`,
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
    getCrmSummary,
    getRevenueSummary,
    getAttendanceTrends,
    getAudienceSegments,
    getRecentActivity,
    getEmailSummary,
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
