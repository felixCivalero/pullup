// Walk the full guest journey for ONE event — the moments where a host
// loses people between "saw this on IG" and "showed up at the door" —
// and report breakpoints stage by stage.
//
// Stages, in the order a guest experiences them:
//   1. social   — the share card / OG image / handoff from IG/WhatsApp/etc.
//   2. page     — the event page itself (cover, copy, vibe links).
//   3. form     — RSVP friction.
//
// We don't duplicate analyzeEvent's heuristics here. Page-stage fixes are
// pulled straight from the journey-tagged suggestions it already returns.
// This file's job is the stages and breakpoint ranking — not re-discovering
// what makes a good cover.

import { analyzeEvent } from "./suggestions.js";

export function auditJourney({
  event,
  host = null,
  allEvents = [],
  media = [],
  brief = "",
  analytics = null,
} = {}) {
  if (!event) {
    return {
      event: null,
      stages: {},
      ranked_breakpoints: [],
    };
  }

  const slug = event.slug || event.id;
  const hasMedia =
    (Array.isArray(media) && media.length > 0) ||
    !!event.imageUrl ||
    !!event.coverImageUrl;
  const hasVideo =
    Array.isArray(media) && media.some((m) => m?.mediaType === "video");

  // Reuse the event coach for page-level breakpoints — only keep the
  // journey-tagged ones so the audit doesn't drift into unrelated nudges.
  const { suggestions: pageSuggestions = [] } = analyzeEvent({
    event,
    brief,
    media,
    allEvents,
    analytics,
  });
  const pageFixes = pageSuggestions.filter((s) => s.journeyAware);

  const stages = {};

  // ── 1. Social handoff ───────────────────────────────────────────────
  // The share card is the very first impression. Without a cover the
  // OG image falls back to a generic placeholder — kills click-through
  // from IG bio links and WhatsApp pastes.
  {
    const fixes = [];
    if (!hasMedia) {
      fixes.push({
        key: "social_no_cover",
        score: 92,
        headline: "Share card has nothing to show",
        why: "Without a cover, IG / WhatsApp / FB will fall back to a generic placeholder when someone pastes the link. The first impression is empty.",
        call: `get_media_upload_link({ slug: "${slug}" })`,
      });
    }
    // Brief mentions IG / visual, event has no IG link → the social-feed
    // continuity is broken: guest can't bounce back to the host's grid.
    const briefIg = /\b(instagram|ig|insta)\b/i.test(brief);
    if (briefIg && !event.instagram) {
      fixes.push({
        key: "social_no_ig_link",
        score: 70,
        headline: "No IG link on the event page",
        why: "Your brief leans on Instagram, but this event doesn't link back to your handle. Guests landing from a non-IG source can't find your grid.",
        call: `update_event({ slug: "${slug}", instagram: "…" })`,
      });
    }
    stages.social = stageOf("Social handoff", fixes, {
      good: "Share card will render with a cover — opens clean from IG / WhatsApp pastes.",
    });
  }

  // ── 2. Page ─────────────────────────────────────────────────────────
  // Everything analyzeEvent already flagged as journey-affecting.
  stages.page = stageOf("Event page", pageFixes, {
    good: "Cover, copy, and vibe links are landing — the page extends the host's social presence.",
  });

  // ── 3. RSVP form friction ──────────────────────────────────────────
  {
    const fixes = [];
    const fields = Array.isArray(event?.formFields) ? event.formFields : [];
    const customRequired = fields.filter((f) => f && !f.locked && f.required).length;
    if (customRequired > 3) {
      fixes.push({
        key: "form_too_many_required",
        score: 65,
        headline: `${customRequired} required fields is a lot to ask`,
        why: "Each extra required field is friction. Keep two, maybe three, beyond name+email. Move the rest to optional.",
        call: `update_event({ slug: "${slug}", extraRsvpFields: [ /* drop the non-essential required flags */ ] })`,
      });
    }
    // If the event is paid and the form has zero gating beyond defaults,
    // the host is leaving a lot of useful pre-event info on the table.
    if ((event?.ticketType === "paid" || event?.ticketPrice) && customRequired === 0) {
      fixes.push({
        key: "form_paid_no_capture",
        score: 55,
        headline: "Paid event with no extra capture",
        why: "Once a guest pays they've already cleared the highest bar. One Instagram or dietary field at that point costs nothing and tells you who's in the room.",
        call: `update_event({ slug: "${slug}", extraRsvpFields: [{ type: "instagram", required: true }] })`,
      });
    }
    stages.form = stageOf("RSVP form", fixes, {
      good: "Form is light enough to convert and rich enough to tell you who's coming.",
    });
  }

  // ── Rank breakpoints across all stages ────────────────────────────
  const ranked = []
    .concat(stages.social.fixes, stages.page.fixes, stages.form.fixes)
    .sort((a, b) => b.score - a.score);

  return {
    event: { slug, title: event.title || null, status: event.status || null },
    stages,
    ranked_breakpoints: ranked,
  };
}

// Bucket a stage's status from its fixes: any fix ≥80 = gap, any fix = warn,
// none = good. Status drives the audit's narrative summary.
function stageOf(label, fixes, copy = {}) {
  let status = "good";
  if (fixes.some((f) => f.score >= 80)) status = "gap";
  else if (fixes.length > 0) status = "warn";
  return {
    label,
    status,
    headline: status === "good" ? copy.good || `${label}: clean` : null,
    fixes,
  };
}
