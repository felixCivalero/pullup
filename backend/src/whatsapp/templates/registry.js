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
    body: "Hey {{1}} — you're confirmed for {{2}} on {{3}}.\n\n{{4}} 👋",
    variables: ["guest_first_name", "event_title", "event_when", "host_signature"],
    render: ({ guest_first_name, event_title, event_when, host_signature }) =>
      `Hey ${guest_first_name} — you're confirmed for ${event_title} on ${event_when}.\n\n${host_signature} 👋`,
    components: [
      {
        type: "BODY",
        text: "Hey {{1}} — you're confirmed for {{2}} on {{3}}.\n\n{{4}} 👋",
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
    body: "{{1}} — tomorrow {{2}} 🙌\n\n{{3}}",
    variables: ["event_title", "time_phrase", "host_signature"],
    render: ({ event_title, time_phrase, host_signature }) =>
      `${event_title} — tomorrow ${time_phrase} 🙌\n\n${host_signature}`,
    components: [
      {
        type: "BODY",
        text: "{{1}} — tomorrow {{2}} 🙌\n\n{{3}}",
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
    body: "{{1}} starts in 2 hours at {{2}} 🚶\n\n{{3}}",
    variables: ["event_title", "venue", "host_signature"],
    render: ({ event_title, venue, host_signature }) =>
      `${event_title} starts in 2 hours at ${venue} 🚶\n\n${host_signature}`,
    components: [
      {
        type: "BODY",
        text: "{{1}} starts in 2 hours at {{2}} 🚶\n\n{{3}}",
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
    body: "{{1}}\n\n{{2}}",
    variables: ["host_signature", "body"],
    render: ({ host_signature, body }) => `${host_signature}\n\n${body}`,
    components: [
      {
        type: "HEADER",
        format: "IMAGE",
        example: {
          header_handle: ["https://pullup.se/share/og-image/sample/image.jpg"],
        },
      },
      {
        type: "BODY",
        text: "{{1}}\n\n{{2}}",
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
    body: "{{1}}\n\n{{2}} invited you to {{3}}. Tap to claim 👇",
    variables: ["host_signature", "host_name", "event_title"],
    render: ({ host_signature, host_name, event_title }) =>
      `${host_signature}\n\n${host_name} invited you to ${event_title}. Tap to claim 👇`,
    components: [
      {
        type: "HEADER",
        format: "IMAGE",
        example: {
          header_handle: ["https://pullup.se/share/og-image/sample/image.jpg"],
        },
      },
      {
        type: "BODY",
        text: "{{1}}\n\n{{2}} invited you to {{3}}. Tap to claim 👇",
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
    body: "Quick heads up — {{1}} is now {{2}} (was {{3}}).\n\n{{4}}",
    variables: ["event_title", "new_when", "old_when", "host_signature"],
    render: ({ event_title, new_when, old_when, host_signature }) =>
      `Quick heads up — ${event_title} is now ${new_when} (was ${old_when}).\n\n${host_signature}`,
    components: [
      {
        type: "BODY",
        text: "Quick heads up — {{1}} is now {{2}} (was {{3}}).\n\n{{4}}",
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
    body: "Hope you enjoyed {{1}}! Photos + what's next 👇\n\n{{2}}",
    variables: ["event_title", "host_signature"],
    render: ({ event_title, host_signature }) =>
      `Hope you enjoyed ${event_title}! Photos + what's next 👇\n\n${host_signature}`,
    components: [
      {
        type: "BODY",
        text: "Hope you enjoyed {{1}}! Photos + what's next 👇\n\n{{2}}",
        example: { body_text: [["Photowalk Stockholm", "It's me, Maya"]] },
      },
      {
        type: "BUTTONS",
        buttons: [
          { type: "URL", text: "Photos + next event", url: "https://pullup.se/e/{{1}}/after", example: ["photowalk-stockholm"] },
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
    body: "{{1}} — a spot just opened up for {{2}} 🎟️\n\nTap to claim before someone else grabs it.",
    variables: ["guest_first_name", "event_title"],
    render: ({ guest_first_name, event_title }) =>
      `${guest_first_name} — a spot just opened up for ${event_title} 🎟️\n\nTap to claim before someone else grabs it.`,
    components: [
      {
        type: "BODY",
        text: "{{1}} — a spot just opened up for {{2}} 🎟️\n\nTap to claim before someone else grabs it.",
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
