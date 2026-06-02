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
    status: "submitted",
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
    status: "submitted",
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

  // ── 2. rsvp_confirm ─────────────────────────────────────────────
  // First-touch hello after RSVP. Opens the 24h conversation window
  // so the host can reply freeform until it closes.
  rsvp_confirm: {
    name: "rsvp_confirm",
    category: "utility",
    meta_category: "UTILITY",
    locale: "en",
    status: "draft",
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
    status: "draft",
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
    status: "draft",
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
    status: "draft",
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
    status: "draft",
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
    status: "draft",
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
    status: "draft",
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
    status: "draft",
    body: "Good news {{1}} — a spot just opened up for {{2}} 🎟️\n\nTap below to claim it before someone else does.",
    variables: ["guest_first_name", "event_title"],
    render: ({ guest_first_name, event_title }) =>
      `Good news ${guest_first_name} — a spot just opened up for ${event_title} 🎟️\n\nTap below to claim it before someone else does.`,
    components: [
      {
        type: "BODY",
        text: "Good news {{1}} — a spot just opened up for {{2}} 🎟️\n\nTap below to claim it before someone else does.",
        example: { body_text: [["Adam", "Sundowner Session #4"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Claim spot", url: "https://pullup.se/waitlist/{{1}}", example: ["jwt-token"] },
        ],
      },
    ],
  },
};

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
