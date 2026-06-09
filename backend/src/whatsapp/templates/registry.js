// backend/src/whatsapp/templates/registry.js
//
// Canonical list of WhatsApp templates PullUp ships. The names + variable
// positions here MUST match the templates submitted to Meta for approval —
// Meta validates body-text variable counts at send time.
//
// Status field:
//   'approved'  — submitted and approved in Meta Business Manager
//   'submitted' — awaiting review
//   'draft'     — defined here but not yet submitted (sandbox-only)
//
// Variables use Meta's `{{1}}`, `{{2}}` … positional placeholders.
// `render()` returns the body text we persist for our own record, even
// though Meta substitutes server-side from the variables payload.

// ─── PullUp template catalog ────────────────────────────────────────
//
// Design principle: WhatsApp templates are NOT email translations.
// They sound like a person, one paragraph, single CTA, host signature
// carries the voice. Meta also rejects bodies that end with a variable
// — every template here keeps a trailing line so submission passes.
//
// Two status fields:
//   * `status`            — local intent ('draft' / 'submitted' / 'approved')
//   * `provider_template_id` — the Meta template id once submitted
//
// Status is reconciled against Meta by calling submitter.refreshStatuses().
//
// Each template includes:
//   * variables[]   — ordered placeholder names for {{1}}…{{n}}
//   * render({})    — produces the body text we persist on outbox rows
//   * components[]  — Meta API submission shape (BODY, HEADER, BUTTONS)
//   * meta_category — the Meta-approved category ('UTILITY' / 'MARKETING' / 'AUTHENTICATION')

export const TEMPLATES = {
  // ── 1. auth_magic_link ──────────────────────────────────────────
  // Magic-link phone verification at signup / RSVP. UTILITY (not
  // Authentication — that category locks to OTP codes only).
  auth_magic_link: {
    name: "auth_magic_link",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "Tap to finish on PullUp: {{1}}\nLink expires in 15 minutes.",
    variables: ["link"],
    render: ({ link }) =>
      `Tap to finish on PullUp: ${link}\nLink expires in 15 minutes.`,
    components: [
      {
        type: "BODY",
        text: "Tap to finish on PullUp: {{1}}\nLink expires in 15 minutes.",
        example: { body_text: [["https://pullup.se/v/abc123xyz9defg"]] },
      },
    ],
  },

  // ── 1b. pullup_continue ─────────────────────────────────────────
  // Backup of (1) with extra-neutral wording. Meta's classifier
  // auto-rejected the "verify your number" variant as INCORRECT_CATEGORY
  // (it wanted Authentication, which doesn't accept URL bodies); this
  // phrasing slipped through into the same UTILITY queue. We run both
  // and use whichever Meta approves first.
  pullup_continue: {
    name: "pullup_continue",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "Your PullUp link: {{1}}\nValid for 15 minutes.",
    variables: ["link"],
    render: ({ link }) =>
      `Your PullUp link: ${link}\nValid for 15 minutes.`,
    components: [
      {
        type: "BODY",
        text: "Your PullUp link: {{1}}\nValid for 15 minutes.",
        example: { body_text: [["https://pullup.se/v/abc123xyz9defg"]] },
      },
    ],
  },

  // ── 1c. auth_whatsapp_otp ───────────────────────────────────────
  // The WhatsApp login code. AUTHENTICATION category (the one category that
  // CARRIES a code) — delivered by the Supabase "Send SMS Hook" so the code +
  // session are native Supabase; WhatsApp is only the rail. Meta manages the
  // body wording for auth templates; the code rides {{1}} into the body + the
  // copy-code button. NOTE: authentication templates are often created/approved
  // directly in WhatsApp Manager — submit script is best-effort here.
  auth_whatsapp_otp: {
    name: "auth_whatsapp_otp",
    category: "authentication",
    meta_category: "AUTHENTICATION",
    locale: "en",
    status: "approved",
    body: "{{1}} is your PullUp code. For your security, don't share it.",
    variables: ["code"],
    render: ({ code }) =>
      `${code} is your PullUp code. For your security, don't share it.`,
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      {
        type: "BUTTONS",
        buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "Copy code" }],
      },
    ],
  },

  // ── booking_cancelled ───────────────────────────────────────────
  // Host cancelled a guest's booking. Plain + kind; the host can follow up
  // personally from the Room. UTILITY (transactional, not marketing).
  booking_cancelled: {
    name: "booking_cancelled",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "submitted",
    body: "Hi {{1}}, sorry — your booking for {{2}} was cancelled by the host. {{3}} — reach out if you have any questions.",
    variables: ["guest_first_name", "event_title", "host_signature"],
    render: ({ guest_first_name, event_title, host_signature }) =>
      `Hi ${guest_first_name}, sorry — your booking for ${event_title} was cancelled by the host. ${host_signature} — reach out if you have any questions.`,
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, sorry — your booking for {{2}} was cancelled by the host. {{3}} — reach out if you have any questions.",
        example: { body_text: [["Adam", "Rooftop Sessions Vol. 4", "It's me, Maya"]] },
      },
    ],
  },

  // ── 2. rsvp_confirm ─────────────────────────────────────────────
  // First-touch hello after RSVP. Opens the 24h conversation window
  // so the host can reply freeform until it closes.
  rsvp_confirm: {
    name: "rsvp_confirm",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "Hi {{1}}, great news — your spot for {{2}} is confirmed. It's happening on {{3}}. {{4}} — can't wait to see you there!",
    variables: ["guest_first_name", "event_title", "event_when", "host_signature"],
    render: ({ guest_first_name, event_title, event_when, host_signature }) =>
      `Hi ${guest_first_name}, great news — your spot for ${event_title} is confirmed. It's happening on ${event_when}. ${host_signature} — can't wait to see you there!`,
    components: [
      {
        type: "BODY",
        text: "Hi {{1}}, great news — your spot for {{2}} is confirmed. It's happening on {{3}}. {{4}} — can't wait to see you there!",
        example: {
          body_text: [["Adam", "Photowalk Stockholm", "Saturday 10:00", "It's me, Maya"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Open event", url: "https://pullup.se/e/{{1}}", example: ["photowalk-stockholm"] },
        ],
      },
    ],
  },

  // ── 3. event_reminder_24h ───────────────────────────────────────
  // T-24h. Short, anticipatory. Directions button so guests can map
  // the venue without leaving the thread.
  event_reminder_24h: {
    name: "event_reminder_24h",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "Reminder: {{1}} is happening tomorrow {{2}}. {{3}} — hope you can still make it, see you there!",
    variables: ["event_title", "time_phrase", "host_signature"],
    render: ({ event_title, time_phrase, host_signature }) =>
      `Reminder: ${event_title} is happening tomorrow ${time_phrase}. ${host_signature} — hope you can still make it, see you there!`,
    components: [
      {
        type: "BODY",
        text: "Reminder: {{1}} is happening tomorrow {{2}}. {{3}} — hope you can still make it, see you there!",
        example: { body_text: [["Photowalk Stockholm", "at 10:00", "It's me, Maya"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Directions", url: "https://maps.google.com/?q={{1}}", example: ["Skansenbron+Stockholm"] },
        ],
      },
    ],
  },

  // ── 4. event_reminder_2h ────────────────────────────────────────
  // T-2h. Final nudge. Same shape as 24h but more immediate.
  event_reminder_2h: {
    name: "event_reminder_2h",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "Almost time! {{1}} starts in about 2 hours over at {{2}}. {{3}} — head down whenever you're ready, see you soon!",
    variables: ["event_title", "venue", "host_signature"],
    render: ({ event_title, venue, host_signature }) =>
      `Almost time! ${event_title} starts in about 2 hours over at ${venue}. ${host_signature} — head down whenever you're ready, see you soon!`,
    components: [
      {
        type: "BODY",
        text: "Almost time! {{1}} starts in about 2 hours over at {{2}}. {{3}} — head down whenever you're ready, see you soon!",
        example: { body_text: [["Photowalk Stockholm", "Skansenbron", "It's me, Maya"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Open event", url: "https://pullup.se/e/{{1}}", example: ["photowalk-stockholm"] },
        ],
      },
    ],
  },

  // ── 5. host_broadcast ───────────────────────────────────────────
  // The campaign workhorse. Host-signature is variable #1; body is
  // hand-written per send (host's own words). Marketing-category;
  // image header for visual continuity with their event poster.
  host_broadcast: {
    name: "host_broadcast",
    category: "marketing",
    meta_category: "MARKETING",
    locale: "en",
    status: "approved",
    body: "Hi 👋\n\n{{2}}\n\n— {{1}}\n\nReply here anytime.",
    variables: ["host_signature", "body"],
    render: ({ host_signature, body }) => `Hi 👋\n\n${body}\n\n— ${host_signature}\n\nReply here anytime.`,
    components: [
      {
        type: "BODY",
        text: "Hi 👋\n\n{{2}}\n\n— {{1}}\n\nReply here anytime.",
        example: {
          body_text: [
            ["It's me, Maya — Sundowner Sessions", "Final tickets for next Friday — link in profile or below."],
          ],
        },
      },
    ],
  },

  // ── 6. vip_invite ───────────────────────────────────────────────
  // Personal invite with JWT-link. Marketing-category despite being
  // 1:1 because Meta classes "promoting an event" as marketing.
  vip_invite: {
    name: "vip_invite",
    category: "marketing",
    meta_category: "MARKETING",
    locale: "en",
    status: "approved",
    body: "You're invited 🎉\n\n{{2}} invited you to {{3}}.\n\n{{1}}\n\nTap below to claim your spot.",
    variables: ["host_signature", "host_name", "event_title"],
    render: ({ host_signature, host_name, event_title }) =>
      `You're invited 🎉\n\n${host_name} invited you to ${event_title}.\n\n${host_signature}\n\nTap below to claim your spot.`,
    components: [
      {
        type: "BODY",
        text: "You're invited 🎉\n\n{{2}} invited you to {{3}}.\n\n{{1}}\n\nTap below to claim your spot.",
        example: {
          body_text: [["It's me, Maya", "Maya", "Sundowner Session #4"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Claim VIP spot", url: "https://pullup.se/vip/{{1}}", example: ["jwt-token-xyz"] },
        ],
      },
    ],
  },

  // ── 7. event_change (Tier 2) ────────────────────────────────────
  event_change: {
    name: "event_change",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "Quick heads up about {{1}} — the timing changed. It's now {{2}}, instead of the original {{3}}. {{4}} — sorry for any shuffle!",
    variables: ["event_title", "new_when", "old_when", "host_signature"],
    render: ({ event_title, new_when, old_when, host_signature }) =>
      `Quick heads up about ${event_title} — the timing changed. It's now ${new_when}, instead of the original ${old_when}. ${host_signature} — sorry for any shuffle!`,
    components: [
      {
        type: "BODY",
        text: "Quick heads up about {{1}} — the timing changed. It's now {{2}}, instead of the original {{3}}. {{4}} — sorry for any shuffle!",
        example: {
          body_text: [["Photowalk Stockholm", "Sun 11:00", "Sat 10:00", "It's me, Maya"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "See update", url: "https://pullup.se/e/{{1}}", example: ["photowalk-stockholm"] },
        ],
      },
    ],
  },

  // ── 8. post_event_thanks (Tier 2) ───────────────────────────────
  post_event_thanks: {
    name: "post_event_thanks",
    category: "marketing",
    meta_category: "MARKETING",
    locale: "en",
    status: "approved",
    body: "Hope you enjoyed {{1}}! The photos and what's coming next are ready for you. {{2}} — thanks so much for coming 🙏",
    variables: ["event_title", "host_signature"],
    render: ({ event_title, host_signature }) =>
      `Hope you enjoyed ${event_title}! The photos and what's coming next are ready for you. ${host_signature} — thanks so much for coming 🙏`,
    components: [
      {
        type: "BODY",
        text: "Hope you enjoyed {{1}}! The photos and what's coming next are ready for you. {{2}} — thanks so much for coming 🙏",
        example: { body_text: [["Photowalk Stockholm", "It's me, Maya"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Photos + next event", url: "https://pullup.se/e/{{1}}", example: ["photowalk-stockholm"] },
        ],
      },
    ],
  },

  // ── 9. waitlist_promotion (Tier 2) ──────────────────────────────
  waitlist_promotion: {
    name: "waitlist_promotion",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "submitted",
    // Link rides in the body (like auth_magic_link) rather than a URL button —
    // our claim link is /e/:slug?wl=<token>, which a fixed button URL can't carry
    // cleanly. UTILITY templates with a link in the body are accepted (precedent:
    // auth_magic_link). Body must not END on a variable, so a fixed sign-off line
    // follows the link (Meta error_subcode 2388299 otherwise).
    body: "Good news {{1}} — a spot just opened up for {{2}} 🎟️\n\nClaim it here before it's gone: {{3}}\n\nHope you can make it!",
    variables: ["guest_first_name", "event_title", "link"],
    render: ({ guest_first_name, event_title, link }) =>
      `Good news ${guest_first_name} — a spot just opened up for ${event_title} 🎟️\n\nClaim it here before it's gone: ${link}\n\nHope you can make it!`,
    components: [
      {
        type: "BODY",
        text: "Good news {{1}} — a spot just opened up for {{2}} 🎟️\n\nClaim it here before it's gone: {{3}}\n\nHope you can make it!",
        example: { body_text: [["Adam", "Sundowner Session #4", "https://pullup.se/e/sundowner-4?wl=abc123"]] },
      },
    ],
  },

  // NOTE: the magic-link "confirm/verify your number" variants (auth_confirm_number,
  // pullup_verify_link) were retired — Meta repeatedly rejected them as
  // INCORRECT_CATEGORY (its classifier insists that wording belongs in
  // AUTHENTICATION, which bans URL bodies). The live verify path uses the
  // UTILITY-approved auth_magic_link (+ pullup_continue backup) instead.

  // ═══ Host-leads v2 ══════════════════════════════════════════════════
  //
  // Same messages, restructured so the HOST is the first thing the guest sees
  // in the WhatsApp notification preview — the signature LEADS (after a single
  // 👋), the message follows — instead of a generic "Hi {name}, …". Simpler,
  // warmer, scales the same across every send. `host_signature` moves to {{1}};
  // every other variable NAME is unchanged, so the send call-sites need ZERO
  // edits: the ACTIVE_TEMPLATE alias (below) maps a logical key to its _v2 once
  // Meta approves it. These start `status: "submitted"`; to put one live, FIRST
  // let Meta approve it, THEN in the same change flip its status to "approved"
  // and repoint ACTIVE_TEMPLATE. Don't repoint before approval — dispatch would
  // route the message to the email floor for the whole review window.
  //
  // Meta rule (learned the hard way, subcode 2388299): a body may NOT start OR
  // end on a variable. The leading "👋 " before {{1}} is what makes the
  // host-first layout legal — without it Meta rejects the template outright.
  // (host_broadcast has no v2: its body is mostly the host's free text, so a
  // leading-signature layout trips the words-ratio limit, subcode 2388293.)

  rsvp_confirm_v2: {
    name: "rsvp_confirm_v2",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "👋 {{1}}\n\nGreat news {{2}} — your spot for {{3}} is confirmed. It's happening {{4}}. Can't wait to see you there!",
    variables: ["host_signature", "guest_first_name", "event_title", "event_when"],
    render: ({ host_signature, guest_first_name, event_title, event_when }) =>
      `👋 ${host_signature}\n\nGreat news ${guest_first_name} — your spot for ${event_title} is confirmed. It's happening ${event_when}. Can't wait to see you there!`,
    components: [
      {
        type: "BODY",
        text: "👋 {{1}}\n\nGreat news {{2}} — your spot for {{3}} is confirmed. It's happening {{4}}. Can't wait to see you there!",
        example: {
          body_text: [["It's me, Maya", "Adam", "Photowalk Stockholm", "Saturday 10:00"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Open event", url: "https://pullup.se/e/{{1}}", example: ["photowalk-stockholm"] },
        ],
      },
    ],
  },

  event_reminder_24h_v2: {
    name: "event_reminder_24h_v2",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "👋 {{1}}\n\nQuick reminder — {{2}} is happening tomorrow {{3}}. Hope you can still make it, see you there!",
    variables: ["host_signature", "event_title", "time_phrase"],
    render: ({ host_signature, event_title, time_phrase }) =>
      `👋 ${host_signature}\n\nQuick reminder — ${event_title} is happening tomorrow ${time_phrase}. Hope you can still make it, see you there!`,
    components: [
      {
        type: "BODY",
        text: "👋 {{1}}\n\nQuick reminder — {{2}} is happening tomorrow {{3}}. Hope you can still make it, see you there!",
        example: { body_text: [["It's me, Maya", "Photowalk Stockholm", "at 10:00"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Directions", url: "https://maps.google.com/?q={{1}}", example: ["Skansenbron+Stockholm"] },
        ],
      },
    ],
  },

  event_reminder_2h_v2: {
    name: "event_reminder_2h_v2",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "👋 {{1}}\n\nAlmost time! {{2}} starts in about 2 hours over at {{3}}. Head down whenever you're ready, see you soon!",
    variables: ["host_signature", "event_title", "venue"],
    render: ({ host_signature, event_title, venue }) =>
      `👋 ${host_signature}\n\nAlmost time! ${event_title} starts in about 2 hours over at ${venue}. Head down whenever you're ready, see you soon!`,
    components: [
      {
        type: "BODY",
        text: "👋 {{1}}\n\nAlmost time! {{2}} starts in about 2 hours over at {{3}}. Head down whenever you're ready, see you soon!",
        example: { body_text: [["It's me, Maya", "Photowalk Stockholm", "Skansenbron"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Open event", url: "https://pullup.se/e/{{1}}", example: ["photowalk-stockholm"] },
        ],
      },
    ],
  },

  booking_cancelled_v2: {
    name: "booking_cancelled_v2",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "👋 {{1}}\n\nSorry {{2}} — your booking for {{3}} was cancelled. Reach out if you have any questions.",
    variables: ["host_signature", "guest_first_name", "event_title"],
    render: ({ host_signature, guest_first_name, event_title }) =>
      `👋 ${host_signature}\n\nSorry ${guest_first_name} — your booking for ${event_title} was cancelled. Reach out if you have any questions.`,
    components: [
      {
        type: "BODY",
        text: "👋 {{1}}\n\nSorry {{2}} — your booking for {{3}} was cancelled. Reach out if you have any questions.",
        example: { body_text: [["It's me, Maya", "Adam", "Rooftop Sessions Vol. 4"]] },
      },
    ],
  },

  event_change_v2: {
    name: "event_change_v2",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "approved",
    body: "👋 {{1}}\n\nQuick heads up about {{2}} — the timing changed. It's now {{3}}, instead of {{4}}. Sorry for any shuffle!",
    variables: ["host_signature", "event_title", "new_when", "old_when"],
    render: ({ host_signature, event_title, new_when, old_when }) =>
      `👋 ${host_signature}\n\nQuick heads up about ${event_title} — the timing changed. It's now ${new_when}, instead of ${old_when}. Sorry for any shuffle!`,
    components: [
      {
        type: "BODY",
        text: "👋 {{1}}\n\nQuick heads up about {{2}} — the timing changed. It's now {{3}}, instead of {{4}}. Sorry for any shuffle!",
        example: {
          body_text: [["It's me, Maya", "Photowalk Stockholm", "Sun 11:00", "Sat 10:00"]],
        },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "See update", url: "https://pullup.se/e/{{1}}", example: ["photowalk-stockholm"] },
        ],
      },
    ],
  },

  post_event_thanks_v2: {
    name: "post_event_thanks_v2",
    category: "marketing",
    meta_category: "MARKETING",
    locale: "en",
    status: "approved",
    body: "👋 {{1}}\n\nHope you enjoyed {{2}}! The photos and what's coming next are ready for you. Thanks so much for coming 🙏",
    variables: ["host_signature", "event_title"],
    render: ({ host_signature, event_title }) =>
      `👋 ${host_signature}\n\nHope you enjoyed ${event_title}! The photos and what's coming next are ready for you. Thanks so much for coming 🙏`,
    components: [
      {
        type: "BODY",
        text: "👋 {{1}}\n\nHope you enjoyed {{2}}! The photos and what's coming next are ready for you. Thanks so much for coming 🙏",
        example: { body_text: [["It's me, Maya", "Photowalk Stockholm"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Photos + next event", url: "https://pullup.se/e/{{1}}", example: ["photowalk-stockholm"] },
        ],
      },
    ],
  },
};

/**
 * Logical → physical template key. Send call-sites pass the LOGICAL key
 * (e.g. "rsvp_confirm"); `sendTemplate` resolves it through here before it
 * touches Meta, so the swap is invisible to callers. To put a host-leads v2
 * variant live, flip its value to the `_v2` key — but ONLY in the same change
 * that sets that v2 template's `status: "approved"`, and ONLY once Meta has
 * actually approved it. Repointing earlier routes the message to the email
 * floor for the entire review window. Keys absent here resolve to themselves.
 */
export const ACTIVE_TEMPLATE = {
  rsvp_confirm: "rsvp_confirm_v2", // host-leads layout; Meta-approved 2026-06-09
  event_reminder_24h: "event_reminder_24h_v2", // host-leads; approved 2026-06-09
  event_reminder_2h: "event_reminder_2h_v2", // host-leads; approved 2026-06-09
  booking_cancelled: "booking_cancelled_v2", // host-leads; approved 2026-06-09
  event_change: "event_change_v2", // host-leads; approved 2026-06-09
  post_event_thanks: "post_event_thanks_v2", // host-leads; approved 2026-06-09
};

/** Resolve a logical template key to the physical one currently live. */
export function activeKey(logicalKey) {
  return ACTIVE_TEMPLATE[logicalKey] || logicalKey;
}

/** Tier-1 templates we submit + approve first. */
export const TIER_1_TEMPLATES = [
  "auth_magic_link",
  "rsvp_confirm",
  "event_reminder_24h",
  "event_reminder_2h",
  "host_broadcast",
  "vip_invite",
];

export function getTemplate(key) {
  const t = TEMPLATES[key];
  if (!t) {
    throw new Error(`[whatsapp/templates] Unknown template '${key}'`);
  }
  return t;
}

export function renderTemplate(key, variables) {
  const t = getTemplate(key);
  for (const variable of t.variables) {
    if (variables?.[variable] === undefined) {
      throw new Error(
        `[whatsapp/templates] Template '${key}' missing variable '${variable}'`,
      );
    }
  }
  return t.render(variables);
}

/**
 * Meta wants variables as an ordered array under `components.body.parameters`.
 * Returns the array in template-declaration order.
 */
export function templateVariablesAsArray(key, variables) {
  const t = getTemplate(key);
  return t.variables.map((v) => ({ type: "text", text: String(variables[v]) }));
}
