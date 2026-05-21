// coachIntents — the bridge between the suggestion engine and one-tap UI
// buttons.
//
// suggestions.js returns items shaped {key, score, headline, why, call}
// where `call` is a human-readable MCP-tool hint. The web UI doesn't speak
// MCP-call-strings; it needs structured intents: where to navigate, which
// modal to open, which API to fire. That mapping lives here.
//
// Keys that don't map to a one-click intent today are dropped — the
// suggestion still exists, the analyzer is still right, the UI just doesn't
// surface it as a button. Add a case below to bring it in.

function eventEditUrl(event) {
  return `/app/events/${event.id}/edit`;
}

// Translate an analyzeEvent suggestion key into a UI intent. Returns null
// when the key has no clean one-tap shortcut.
export function keyToEventIntent(key, _suggestion, ctx) {
  const { event } = ctx;
  if (!event) return null;
  const edit = eventEditUrl(event);
  switch (key) {
    case "cover":
    case "video":
      // Cover/media upload lives in the in-app editor — the upload modal
      // is part of the cover section. Direct deep-link not wired yet.
      return { type: "navigate", url: edit };
    case "vibe":
    case "description":
    case "gating":
    case "plus_ones":
    case "ticketing":
      return { type: "navigate", url: edit };
    case "series":
      // Series duplication is two-step (pick prior, then edit deltas) —
      // skip the one-click affordance until we have a "duplicate from"
      // shortcut in the create flow.
      return null;
    case "perf_capped":
      return {
        type: "navigate",
        url: `/app/events/${event.id}/guests?status=waitlist`,
      };
    case "perf_filling":
      return { type: "navigate", url: edit };
    case "perf_quiet":
      // No campaigns sent yet — drop into the CRM with the event preselected
      // (CrmPage's existing eventId-aware flow would pick it up).
      return { type: "navigate", url: `/crm?eventId=${event.id}` };
    case "perf_low_conversion":
    case "perf_campaign_weak":
      return { type: "navigate", url: `/app/events/${event.id}/analytics` };
    default:
      return null;
  }
}

// analyzeCampaign keys → intents. Most campaign suggestions are about subject
// quality or audience size; both surface inside CrmPage already — clicking
// the button just routes to the right tab.
export function keyToCampaignIntent(key, _suggestion, ctx) {
  const { campaign } = ctx;
  if (!campaign) return null;
  const composeUrl = `/crm?campaignId=${campaign.id}`;
  switch (key) {
    case "camp_subject_missing":
    case "camp_subject_weak":
    case "camp_subject_urgency_overuse":
      // Email tab, subject field gets implicit focus when the host scrolls there.
      return { type: "navigate", url: composeUrl, tab: "email" };
    case "camp_audience_empty":
    case "camp_audience_huge":
      return { type: "navigate", url: composeUrl, tab: "segment" };
    case "camp_event_freshness_old":
    case "camp_event_freshness_no_event":
      return campaign.eventId
        ? { type: "navigate", url: `/app/events/${campaign.eventId}/edit` }
        : null;
    case "camp_preview_gate":
      // Host is already on the preview page; no useful one-tap shortcut.
      return null;
    default:
      return null;
  }
}

// analyzeCrmSignals keys → intents. Most signals are read-only ("who's
// worth a touch") so the button just routes to the segment view filtered
// to that cohort. v1 keeps it simple: tap → /crm with no extra filter.
export function keyToCrmIntent(_key, _suggestion) {
  return { type: "navigate", url: "/crm" };
}
