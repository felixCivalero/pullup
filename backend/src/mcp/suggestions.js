// Event-completeness analyzer for the MCP. The job: look at one event +
// any context the AI has about the host (their brief and earlier events)
// and produce a ranked list of next-most-impactful improvements.
//
// Why this lives in its own file:
//   - createEvent / updateEvent banners want the top suggestion only.
//   - The suggest_event_improvements tool wants the whole ranked list.
//   - Both call analyzeEvent() and pull what they need.
//
// Design principles (from product brainstorming):
//   - Be category-aware. A music event needs Spotify; a dinner doesn't.
//   - Push "custom video > stock image" as the gold standard, but stop
//     once a video is attached.
//   - Detect recurring series (vol N, "— March", part 2, etc.) and push
//     duplicate_event for continuity.
//   - Respect the host's brief: re-weight suggestions to match.

const CATEGORY_KEYWORDS = {
  music: [
    "dj",
    "set",
    "live",
    "concert",
    "gig",
    "music",
    "rave",
    "club",
    "boiler",
    "session",
    "vinyl",
    "band",
    "festival",
    "jam",
  ],
  dinner: ["dinner", "supper", "feast", "tasting", "menu", "chef", "lunch", "brunch", "salon"],
  party: ["party", "rooftop", "afterparty", "after-party", "bash", "celebration", "mixer", "social"],
  workshop: ["workshop", "class", "course", "intensive", "training", "masterclass", "lab"],
  talk: ["talk", "panel", "fireside", "keynote", "qa", "q&a", "lecture", "conversation", "interview"],
  screening: ["screening", "premiere", "film", "movie", "cinema"],
  exhibition: ["exhibition", "exhibit", "gallery", "show", "showcase", "opening", "vernissage"],
  retreat: ["retreat", "offsite", "getaway", "camp"],
  walk: ["walk", "hike", "stroll", "tour", "ride", "run"],
};

// Detect category from title + description. Returns the strongest match
// or "general" when nothing scores. Multi-category isn't worth modelling
// — categories drive suggestion weight, not exact behavior.
export function inferCategory(event) {
  const haystack = `${event?.title || ""} ${event?.description || ""}`.toLowerCase();
  const scores = {};
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    let s = 0;
    for (const w of words) {
      // word-boundary match so "lunch" doesn't trip on "launch"
      const re = new RegExp(`\\b${w}\\b`, "i");
      if (re.test(haystack)) s += 1;
    }
    if (s > 0) scores[cat] = s;
  }
  if (Object.keys(scores).length === 0) return "general";
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

// Detect that an event title looks like part of a recurring series. We're
// conservative: only fire on strong signals (vol/part/issue numbering, or
// "— <month>" suffixes). Anything looser produces too many false positives
// and the AI ends up pushing duplicate_event on one-offs.
export function detectSeries(event, allEvents = []) {
  const title = (event?.title || "").trim();
  if (!title) return null;

  // "Vol 3", "Vol. III", "Part 2", "Issue 04", "Chapter 5"
  const seriesMarker = title.match(
    /\b(vol\.?|volume|part|issue|chapter|ep\.?|episode|night|edition)\s*([0-9]+|[ivx]+)\b/i
  );
  // " — March", " - 2026", " · vol 4"
  const dashSuffix = title.match(/[—–-]\s*[A-Za-z0-9]+/);

  if (!seriesMarker && !dashSuffix) return null;

  // Find earlier events on the host's roster that share the prefix before
  // the marker. e.g. "Photo Walk Vol 3" matches "Photo Walk Vol 2".
  const stem = title
    .replace(/\b(vol\.?|volume|part|issue|chapter|ep\.?|episode|night|edition)\s*([0-9]+|[ivx]+)\b/i, "")
    .replace(/[—–-]\s*[A-Za-z0-9]+\s*$/, "")
    .trim()
    .toLowerCase();
  if (!stem || stem.length < 3) return seriesMarker ? { stem: null, prior: null } : null;

  const prior = (allEvents || [])
    .filter((e) => e?.id !== event?.id)
    .filter((e) => (e?.title || "").toLowerCase().includes(stem))
    .sort((a, b) => new Date(b.startsAt || 0) - new Date(a.startsAt || 0))[0];

  return { stem, prior: prior || null };
}

// Heuristic: does this event already have a vibe link (event-level social)?
function hasVibe(event) {
  return !!(event?.instagram || event?.spotify || event?.tiktok || event?.soundcloud);
}

// Heuristic: does this event have any RSVP gating beyond defaults?
function hasGating(event) {
  if (event?.requireApproval) return true;
  if (event?.instantWaitlist) return true;
  const fields = Array.isArray(event?.formFields) ? event.formFields : [];
  // Anything past the locked name+email pair counts as gating customization.
  const custom = fields.filter((f) => f && !f.locked);
  if (custom.length > 0) return true;
  return false;
}

// Heuristic: is the description thin?
function descriptionThin(event) {
  const d = (event?.description || "").trim();
  return d.length < 30;
}

// Brief-aware weighting. The brief is freeform text the host wrote about
// themselves and their events. Light keyword sniffing — better than nothing,
// not pretending to be NLP.
function briefHints(brief) {
  const text = (brief || "").toLowerCase();
  return {
    music:    /\b(dj|music|playlist|spotify|vinyl|club|night|sound)\b/.test(text),
    intimate: /\b(intimate|curated|invite|private|small|tight|inner|close)\b/.test(text),
    visual:   /\b(photo|video|film|visual|gallery|cinema|design|art)\b/.test(text),
    paid:     /\b(paid|ticket|revenue|monetiz|membership|subscription|paying)\b/.test(text),
  };
}

// Produce the ranked list of suggestions for ONE event. Each suggestion is
// shaped like:
//   {
//     key:   "cover",                       // stable identifier
//     score: 90,                            // 0–100; bigger = more impactful
//     headline: "Add a custom cover",       // short summary
//     why:   "The page lands flat without one.",
//     call:  "get_media_upload_link({slug:'foo'})", // exact MCP call to fix
//   }
//
// Caller decides how many to surface (banner uses top 1; the tool uses all).
export function analyzeEvent({
  event,
  brief = "",
  media = [],
  allEvents = [],
  analytics = null,
} = {}) {
  if (!event) return { category: "general", series: null, suggestions: [], performance: null };

  const category = inferCategory(event);
  const series = detectSeries(event, allEvents);
  const hints = briefHints(brief);
  const slug = event.slug || event.id;
  const hasMedia = (Array.isArray(media) && media.length > 0) || !!event.imageUrl || !!event.coverImageUrl;
  const hasVideo = Array.isArray(media) && media.some((m) => m?.mediaType === "video");
  const performance = analyzePerformance({ event, analytics });

  const out = [];

  // ── Cover media ────────────────────────────────────────────────────
  // Push cover hard when missing; once there's an image, still nudge once
  // toward video. Stop once there's a video.
  if (!hasMedia) {
    let score = 95;
    let why = "The page feels generic without one.";
    if (category === "music" || category === "party" || category === "exhibition") {
      score += 3;
      why = "Visual-first formats live or die by the cover.";
    }
    out.push({
      key: "cover",
      score,
      headline: "Send a cover for the event",
      why,
      call: `get_media_upload_link({ slug: "${slug}" })`,
    });
  } else if (!hasVideo) {
    // Image is there — push the "custom video > stock image" upgrade once.
    let score = 70;
    if (category === "music" || category === "party") score += 6;
    if (hints.visual) score += 3;
    out.push({
      key: "video",
      score,
      headline: "Swap (or add) a 10–20s clip shot for this event",
      why: "Niche, event-specific video converts harder than a still — extends the host's IG vibe into a personal moment.",
      call: `get_media_upload_link({ slug: "${slug}" })`,
    });
  }

  // ── Series continuity ──────────────────────────────────────────────
  if (series?.prior?.slug && series.prior.slug !== event.slug) {
    out.push({
      key: "series",
      score: 80,
      headline: `Carry the look from "${series.prior.title}"`,
      why: "This looks like part of a series — keeping the cover, sections, and form fields consistent makes the season feel cohesive.",
      call: `duplicate_event({ slug: "${series.prior.slug}", title: "${event.title}", startsAt: "${event.startsAt}" })  // then update the deltas`,
    });
  }

  // ── Vibe links (event-level social) ────────────────────────────────
  if (!hasVibe(event)) {
    let score = 55;
    let why = "Linking the host's existing IG / Spotify / TikTok turns the event page into a continuation of their feed — same vibe, more personal.";
    if (category === "music") {
      score = 88;
      why = "For a music event, a Spotify playlist or SoundCloud link sets the mood before anyone arrives.";
    } else if (category === "exhibition" || category === "screening") {
      score = 70;
      why = "An IG of the artist / film puts the work in front of guests before the event.";
    } else if (hints.music && category !== "workshop") {
      score = Math.max(score, 75);
    }
    if (hints.visual) score += 2;
    out.push({
      key: "vibe",
      score,
      headline: "Add a vibe link (Spotify / Instagram / TikTok)",
      why,
      call: `update_event({ slug: "${slug}", instagram: "…", spotify: "…" })`,
    });
  }

  // ── Description ────────────────────────────────────────────────────
  if (descriptionThin(event)) {
    let score = 60;
    if (category === "workshop" || category === "talk") {
      score = 82; // longer-form formats need the context
    }
    out.push({
      key: "description",
      score,
      headline: "Tell the story in 2–3 sentences",
      why: "The description is what convinces a hesitant guest. Skip the corporate tone — write like you'd text a friend who asked what the night is.",
      call: `update_event({ slug: "${slug}", description: "…" })`,
    });
  }

  // ── RSVP gating ───────────────────────────────────────────────────
  if (!hasGating(event)) {
    let score = 40;
    let why = "Right now anyone can RSVP. Even one extra question (Instagram handle, what they're bringing) tells you who's coming.";
    if (hints.intimate) {
      score = 78;
      why = "Your brief says intimate / curated — turn on requireApproval or make Instagram required so you control the room.";
    } else if (category === "dinner") {
      score = 70;
      why = "Dinners are easier to host when you know who's actually showing up — Instagram + dietary question + requireApproval are standard.";
    } else if (category === "party") {
      score = 55;
    }
    out.push({
      key: "gating",
      score,
      headline: "Add one RSVP question (or require approval)",
      why,
      call: `update_event({ slug: "${slug}", extraRsvpFields: [{ type: "instagram", required: true }] })`,
    });
  }

  // ── Plus-ones / capacity nuance ────────────────────────────────────
  // Only surface when the title hints at "+1" energy AND the host hasn't set it.
  const plusHint = /\b(party|rooftop|opening|launch|mixer|social)\b/i.test(event?.title || "");
  if (plusHint && (event?.maxPlusOnesPerGuest == null || event.maxPlusOnesPerGuest === 0)) {
    out.push({
      key: "plus_ones",
      score: 38,
      headline: "Let guests bring +1s",
      why: "For party-style events, plus-ones grow the room without growing your CRM noise.",
      call: `update_event({ slug: "${slug}", maxPlusOnesPerGuest: 1 })`,
    });
  }

  // ── Paid ticketing (only when brief hints at it) ──────────────────
  if (hints.paid && event?.ticketType !== "paid") {
    out.push({
      key: "ticketing",
      score: 45,
      headline: "Set up paid ticketing",
      why: "Your brief mentions monetization — add a ticketPrice so this event contributes to revenue from day one.",
      call: `update_event({ slug: "${slug}", ticketType: "paid", ticketPrice: 2500, ticketCurrency: "SEK" })`,
    });
  }

  // ── Performance signals (merge in, then sort all) ────────────────
  if (performance?.signals?.length) {
    out.push(...performance.signals);
  }

  // ── Stakes-awareness: scale suggestion intensity ─────────────────
  // Same "add a cover" matters more on a 500-person paid showcase than
  // on a free 8-person coffee. We scale each score by a stakes
  // multiplier so the AI pushes harder on what's actually consequential.
  const stakesMult = stakesMultiplier(event);
  for (const s of out) {
    s.score = Math.round(s.score * stakesMult);
    // Tag the suggestions that move the needle on the social→page
    // customer journey so the audit tool can pick them out without
    // re-implementing the heuristics. Pure tag — no score change.
    if (JOURNEY_KEYS.has(s.key)) s.journeyAware = true;
  }

  // ── Sort & return ─────────────────────────────────────────────────
  out.sort((a, b) => b.score - a.score);
  return { category, series, suggestions: out, performance, stakes: stakesLabel(event) };
}

// Suggestion keys whose fixes show up in the customer journey from a
// social post → opening the event page. journeyAudit() reuses these.
const JOURNEY_KEYS = new Set(["cover", "video", "vibe", "description", "series"]);

// Stakes: how much is riding on this event? Bigger room + real money =
// higher stakes. Multiplier flexes suggestion scores by ~15% in either
// direction — enough to reorder ties, not enough to silence small events.
function stakesScore(event) {
  const cap = Number(event?.maxAttendees) || 30;
  const paid = event?.ticketType === "paid" || !!event?.ticketPrice;
  // ticketPrice is in cents. $25 ticket = 2500; floor at 1.5x for any paid.
  const priceFactor = paid ? Math.max(1.5, (Number(event?.ticketPrice) || 0) / 5000) : 1;
  return cap * priceFactor;
}

function stakesMultiplier(event) {
  const s = stakesScore(event);
  if (s < 20) return 0.88;   // intimate / free / small — softer push
  if (s < 100) return 1.0;
  if (s < 500) return 1.1;
  return 1.18;                // big or high-revenue — push harder
}

function stakesLabel(event) {
  const s = stakesScore(event);
  if (s < 20) return "intimate";
  if (s < 100) return "mid";
  if (s < 500) return "big";
  return "marquee";
}

// Ground the coach in real numbers. Returns two things:
//   - line: a one-line summary safe to surface in the banner. Empty when
//     the event is a draft or has no views yet — silence beats noise.
//   - signals: 0+ performance-driven suggestions to merge into the main
//     suggestion list (they compete on score with shape-based ones).
//
// We only fire signals when the event is live AND has enough data to mean
// something (e.g. ≥48h since publish AND nontrivial view count). Otherwise
// we'd be coaching off noise.
export function analyzePerformance({ event, analytics } = {}) {
  if (!event || event.status !== "PUBLISHED" || !analytics) {
    return { line: null, signals: [] };
  }

  const views = Number(analytics.total_views) || 0;
  const unique = Number(analytics.unique_visitors) || 0;
  const rsvps = Number(analytics.rsvp_count) || 0;
  const cap = analytics.capacity || event.maxAttendees || null;
  const fill = analytics.fill_rate != null
    ? Number(analytics.fill_rate)
    : cap ? rsvps / cap : null;
  const conv = analytics.conversion_rate != null ? Number(analytics.conversion_rate) : null;

  // Proxy days-since-live with createdAt — we don't store a publishedAt and
  // for DRAFT → PUBLISHED events the gap is usually small. Good enough for
  // the "has this had time to land?" question the coach is actually asking.
  const liveSinceMs = event.createdAt ? Date.now() - new Date(event.createdAt).getTime() : null;
  const daysLive = liveSinceMs != null ? liveSinceMs / 86400000 : null;
  const slug = event.slug || event.id;

  const signals = [];
  const lineParts = [];

  if (daysLive != null) {
    lineParts.push(`${Math.max(1, Math.round(daysLive))}d live`);
  }
  lineParts.push(`${unique} unique view${unique === 1 ? "" : "s"}`);
  lineParts.push(`${rsvps} RSVP${rsvps === 1 ? "" : "s"}`);
  if (conv != null && unique >= 5) lineParts.push(`${Math.round(conv * 100)}% conv`);
  if (fill != null && cap) lineParts.push(`${Math.round(fill * 100)}% full`);

  // Signal: at-or-over cap.
  if (fill != null && fill >= 1) {
    signals.push({
      key: "perf_capped",
      score: 88,
      headline: "You're at capacity — keep the momentum",
      why: `${rsvps}/${cap} RSVPs. Any new sign-ups land on the waitlist; promote them as space opens.`,
      call: `list_rsvps({ slug: "${slug}", status: "waitlist" })`,
    });
  } else if (fill != null && fill >= 0.8) {
    signals.push({
      key: "perf_filling",
      score: 78,
      headline: `${Math.round(fill * 100)}% full — tighten the lid`,
      why: "Capacity is closing in. Turn on a waitlist (or raise the cap) before the next batch of RSVPs hits.",
      call: `update_event({ slug: "${slug}", waitlistEnabled: true })`,
    });
  }

  // Signal: lots of eyes, weak conversion. Only triggers once there's
  // enough traffic to make the ratio meaningful.
  if (unique >= 50 && conv != null && conv < 0.10) {
    signals.push({
      key: "perf_low_conversion",
      score: 84,
      headline: "Lots of eyes, few RSVPs",
      why: `${unique} unique visitors but only ${rsvps} RSVP${rsvps === 1 ? "" : "s"} (${Math.round(conv * 100)}% conversion). Description, cover, or RSVP friction is usually the lever — call suggest_event_improvements to see which.`,
      call: `suggest_event_improvements({ slug: "${slug}" })`,
    });
  }

  // Signal: published-but-quiet. Don't fire in the first 48h — events
  // often pick up momentum after the host shares it.
  if (daysLive != null && daysLive >= 2 && unique < 20 && rsvps < 3) {
    signals.push({
      key: "perf_quiet",
      score: 82,
      headline: "Hasn't picked up steam yet",
      why: `Live ${Math.round(daysLive)} days, ${unique} visitor${unique === 1 ? "" : "s"}, ${rsvps} RSVP${rsvps === 1 ? "" : "s"}. A fresh share or a follow-up email to a past-event audience usually kickstarts the curve.`,
      call: `draft_campaign({ subject: "…", eventSlug: "${slug}", templateType: "event" })`,
    });
  }

  // Signal: campaigns attributed but conversion off the campaign is weak.
  const camps = Array.isArray(analytics.campaigns) ? analytics.campaigns : [];
  const campSent = camps.reduce((s, c) => s + (Number(c.sent) || 0), 0);
  const campRsvps = camps.reduce((s, c) => s + (Number(c.rsvps) || 0), 0);
  if (campSent >= 100 && (campRsvps / campSent) < 0.05) {
    signals.push({
      key: "perf_campaign_weak",
      score: 75,
      headline: "The campaign got opens but few sign-ups",
      why: `${campSent} sends, ${campRsvps} attributed RSVP${campRsvps === 1 ? "" : "s"} (${Math.round((campRsvps / campSent) * 100)}%). Subject, audience, or the event page itself is the bottleneck.`,
      call: `get_event_analytics({ slug: "${slug}" })  // look at sources + campaign breakdown`,
    });
  }

  return {
    line: lineParts.length ? lineParts.join(" · ") : null,
    signals,
  };
}

// ─────────────────────────────────────────────────────────────────────
// CAMPAIGN COACH
// ─────────────────────────────────────────────────────────────────────
//
// Score one email campaign on the things that actually move open / click
// rates: subject quality, audience size sanity, and the preview-before-
// send discipline. Same shape as event suggestions so the AI doesn't have
// to learn a new format.
//
// `history` is the host's prior email performance, shaped like the result
// of /host/crm/emails — at minimum: `{ totals, topByOpenRate: [...] }`.
const GENERIC_SUBJECT_RE = /\b(newsletter|announcement|update|hello|hi there|important|our latest|monthly)\b/i;
const URGENCY_OVERUSE_RE = /\b(don'?t miss|last chance|act now|hurry|urgent)\b/i;

export function analyzeCampaign({ campaign, event, history = {}, brief = "" } = {}) {
  if (!campaign) return { suggestions: [] };
  const subject = (campaign.subject || "").trim();
  const total = Number(campaign.totalRecipients || 0);
  const status = (campaign.status || "draft").toLowerCase();
  const id = campaign.id || campaign.campaignId || "";
  const out = [];

  // ── Subject quality ───────────────────────────────────────────────
  if (!subject) {
    out.push({
      key: "camp_subject_missing",
      score: 95,
      headline: "Subject line is empty",
      why: "Don't even try to send — empty subjects route straight to spam.",
      call: null,
    });
  } else if (subject.length < 6) {
    out.push({
      key: "camp_subject_short",
      score: 80,
      headline: "Subject is too short to land",
      why: "5 characters won't earn an open. Aim for 5–8 words that hint at the actual value of the event.",
      call: null,
    });
  } else if (subject.length > 65) {
    out.push({
      key: "camp_subject_long",
      score: 65,
      headline: "Subject is long for mobile",
      why: `${subject.length} chars. Most mobile previews truncate around 40–50 — write the hook first so it survives the cut.`,
      call: null,
    });
  }

  if (subject && GENERIC_SUBJECT_RE.test(subject)) {
    out.push({
      key: "camp_subject_generic",
      score: 72,
      headline: "Subject feels generic",
      why: "Words like 'newsletter' or 'announcement' read as mass-mail. Anchor on the specific event or one concrete reason to open.",
      call: null,
    });
  }
  if (subject && URGENCY_OVERUSE_RE.test(subject)) {
    out.push({
      key: "camp_subject_urgency",
      score: 55,
      headline: "Urgency feels forced",
      why: "'Last chance' / 'act now' lands as performative. Real urgency reads better: a fact ('12 spots left'), a date ('Sunday'), a specific name.",
      call: null,
    });
  }

  // ── Compare against host's top opens ──────────────────────────────
  const top = Array.isArray(history.topByOpenRate) ? history.topByOpenRate : [];
  if (subject && top.length > 0) {
    const best = top[0];
    if (best?.subject && best.subject.trim().toLowerCase() !== subject.toLowerCase()) {
      out.push({
        key: "camp_subject_compare",
        score: 48,
        headline: "Echo what's worked for this host",
        why: `Highest opens so far: "${best.subject}" at ${Math.round((best.open_rate_pct || 0))}%. Look at why that one landed — first name? specific event? — and apply the pattern.`,
        call: null,
      });
    }
  }

  // ── Audience size ─────────────────────────────────────────────────
  if (total === 0) {
    out.push({
      key: "camp_audience_empty",
      score: 92,
      headline: "Audience resolved to 0 people",
      why: "Your filter combination matched nobody. Widen it — drop the tag, pick a different past event, or remove the marketing-consent filter if appropriate — and re-draft.",
      call: null,
    });
  } else if (total < 5) {
    out.push({
      key: "camp_audience_tiny",
      score: 58,
      headline: `Tiny audience (${total})`,
      why: "For 5 or fewer, a personal DM/text usually beats an email — feels less broadcast-y.",
      call: null,
    });
  }

  // ── Event freshness sanity ────────────────────────────────────────
  if (event?.startsAt) {
    const days = (new Date(event.startsAt).getTime() - Date.now()) / 86400000;
    if (campaign?.templateType !== "followup" && days < 0) {
      out.push({
        key: "camp_event_past",
        score: 70,
        headline: "The event is already in the past",
        why: "This campaign is anchored to an event that's done. If it's a recap, switch templateType to 'followup'; if it's a new event, re-draft against the new slug.",
        call: null,
      });
    } else if (campaign?.templateType !== "followup" && days < 1) {
      out.push({
        key: "camp_event_imminent",
        score: 50,
        headline: "Event is in <24h",
        why: "Late sends still work — keep the tone urgent and personal, not promotional. A short text-only reminder usually beats a designed email at this point.",
        call: null,
      });
    }
  }

  // ── Always remind about the preview gate while still drafting ────
  if (status === "draft" || status === "queued") {
    out.push({
      key: "camp_preview_gate",
      score: 60,
      headline: "Open the preview before send",
      why: "Eyeball the rendered email — subject, copy, links — in the preview URL from draft_campaign. Then send_campaign with confirm: true. Never fire without that eyeball.",
      call: id ? `get_campaign({ campaignId: "${id}" })  // includes the preview URL` : null,
    });
  }

  // Brief-aware: if host's brief mentions paid/monetization, push for a CTA check
  const hints = briefHints(brief);
  if (hints.paid && status === "draft") {
    out.push({
      key: "camp_paid_cta",
      score: 45,
      headline: "Make the paid CTA obvious",
      why: "Your brief mentions monetization — the email should make the ticket price + 'pay now' button impossible to miss. Don't bury it under three paragraphs.",
      call: null,
    });
  }

  out.sort((a, b) => b.score - a.score);
  return { suggestions: out };
}

// ─────────────────────────────────────────────────────────────────────
// CRM SIGNALS
// ─────────────────────────────────────────────────────────────────────
//
// Proactive insights: "who should the host be talking to this week?"
// Built from segments + recent-activity + brief. Same suggestion shape
// as everything else so the AI surfaces them with one voice.
export function analyzeCrmSignals({ segments = null, recent = null, brief = "" } = {}) {
  const out = [];
  const s = segments?.segments || segments || {};
  const topSpenders = Array.isArray(segments?.topSpenders) ? segments.topSpenders : [];
  const r = recent || {};
  const days = Number(r.days || 30);

  // ── Top spenders not yet VIP-tagged ──────────────────────────────
  // Highest leverage — these are your most valuable people, invisible to
  // your own filters until you tag them.
  const untaggedSpenders = topSpenders.filter((p) => {
    const tags = Array.isArray(p.tags) ? p.tags : [];
    return !tags.some((t) => /vip/i.test(String(t)));
  });
  if (untaggedSpenders.length > 0) {
    const examples = untaggedSpenders.slice(0, 3).map((p) => p.name || p.email).filter(Boolean);
    out.push({
      key: "crm_untagged_spenders",
      score: 82,
      headline: `${untaggedSpenders.length} top spender${untaggedSpenders.length === 1 ? "" : "s"} not tagged VIP`,
      why: `These are your highest-value people${examples.length ? ` (${examples.join(", ")}${untaggedSpenders.length > examples.length ? ", …" : ""})` : ""}. Tag them so future audience filters and follow-ups treat them differently.`,
      call: `update_person({ personId: "…", tags: ["vip"] })  // one call per person`,
    });
  }

  // ── Recent newcomers worth a personal touch ──────────────────────
  if ((r.newPeople || 0) > 0) {
    out.push({
      key: "crm_newcomers",
      score: 70,
      headline: `${r.newPeople} newcomer${r.newPeople === 1 ? "" : "s"} in the last ${days}d`,
      why: "First-time RSVPs are the highest-leverage moment for repeat attendance. A short, personal follow-up beats a generic newsletter — feels like the host actually noticed them.",
      call: `query_people({ eventsAttendedMin: 1, eventsAttendedMax: 1, limit: 20 })  // then drop a few DMs or draft a small follow-up`,
    });
  }

  // ── Regulars likely drifting ─────────────────────────────────────
  if ((s.regulars || 0) > 0) {
    out.push({
      key: "crm_regulars_drift",
      score: 60,
      headline: `${s.regulars} regular${s.regulars === 1 ? "" : "s"} on your roster`,
      why: "Worth a sweep: who hasn't shown to a recent event? A 'haven't seen you in a while, we'd love you back' note closes more loops than another mass invite.",
      call: `query_people({ eventsAttendedMin: 5, limit: 30 })  // sort by who's missing from the last few events`,
    });
  }

  // ── First-timer cohort ratio (a strategy signal, not a person) ───
  const totalPeople = Number(s.total_people || 0);
  if (totalPeople > 20) {
    const firstTimerRatio = (Number(s.first_timers) || 0) / totalPeople;
    if (firstTimerRatio > 0.7) {
      out.push({
        key: "crm_first_timer_heavy",
        score: 55,
        headline: `${Math.round(firstTimerRatio * 100)}% of your audience has only come once`,
        why: "High first-timer share means a top-of-funnel that works but a return-rate gap. Repeat is where loyalty (and revenue) compounds — worth a follow-up cadence after every event.",
        call: null,
      });
    }
  }

  // ── Marketing-consent untapped ───────────────────────────────────
  if ((s.marketing_consented || 0) >= 20 && (r.rsvpsReceived || 0) < (s.marketing_consented || 0) * 0.1) {
    out.push({
      key: "crm_consent_untapped",
      score: 50,
      headline: `${s.marketing_consented} people opted into marketing — most haven't heard from you recently`,
      why: "Consented + silent is the worst of both worlds — you've got permission but no warmth. A short, low-stakes campaign keeps the channel alive.",
      call: `draft_campaign({ subject: "…", eventSlug: "…" })`,
    });
  }

  // Brief-aware reweighting
  const hints = briefHints(brief);
  if (hints.intimate) {
    // Bump the regulars/newcomers signals — intimate hosts thrive on rapport.
    for (const sig of out) {
      if (sig.key === "crm_newcomers" || sig.key === "crm_regulars_drift") {
        sig.score = Math.min(95, sig.score + 8);
      }
    }
  }

  out.sort((a, b) => b.score - a.score);
  return { suggestions: out };
}

// Compact one-line completeness summary for inline banners. Returns
// something like:
//   "✓ basics  ✓ location  ✗ cover  ✗ vibe  ✗ gating"
export function completenessSummary({ event, media = [] } = {}) {
  if (!event) return "";
  const hasMedia = (Array.isArray(media) && media.length > 0) || !!event.imageUrl || !!event.coverImageUrl;
  const dim = (label, ok) => `${ok ? "✓" : "✗"} ${label}`;
  return [
    dim("basics", !!(event.title && event.startsAt)),
    dim("location", !!event.location || event.hideLocation),
    dim("cover", hasMedia),
    dim("vibe", hasVibe(event)),
    dim("gating", hasGating(event)),
  ].join("  ");
}
