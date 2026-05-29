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

export const TEMPLATES = {
  // Magic-link phone verification at signup or RSVP.
  // Submitted to Meta under the UTILITY category (not Authentication — Meta's
  // Authentication category is hard-wired to OTP-code patterns and refuses
  // URL bodies). Meta also forbids the body from ending with a variable, so
  // we tail with a short expiry line that doubles as a security cue.
  auth_magic_link: {
    name: "auth_magic_link",
    category: "utility",
    locale: "en",
    status: "draft",
    body: "Tap to finish on PullUp: {{1}}\nLink expires in 15 minutes.",
    variables: ["link"],
    render: ({ link }) =>
      `Tap to finish on PullUp: ${link}\nLink expires in 15 minutes.`,
  },

  // First-touch hello after RSVP. Opens the 24h conversation window.
  rsvp_confirm: {
    name: "rsvp_confirm",
    category: "utility",
    locale: "en",
    status: "draft",
    body:
      "Hey {{1}} — {{2}} confirmed you for {{3}} on {{4}}. Tap for details: {{5}}",
    variables: ["guest_first_name", "host_name", "event_title", "event_when", "event_link"],
    render: ({
      guest_first_name,
      host_name,
      event_title,
      event_when,
      event_link,
    }) =>
      `Hey ${guest_first_name} — ${host_name} confirmed you for ${event_title} on ${event_when}. Tap for details: ${event_link}`,
  },

  // T-24h / T-2h reminders. Same template, fired twice with different vars.
  event_reminder: {
    name: "event_reminder",
    category: "utility",
    locale: "en",
    status: "draft",
    body:
      "{{1}} reminder: {{2}} is {{3}}. Address {{4}}. See you there 👋",
    variables: ["host_name", "event_title", "event_when_phrase", "event_address"],
    render: ({ host_name, event_title, event_when_phrase, event_address }) =>
      `${host_name} reminder: ${event_title} is ${event_when_phrase}. Address ${event_address}. See you there 👋`,
  },

  // The campaign workhorse. Host-signature is variable #1 so guests see
  // who's actually talking; the rest of the body is hand-written per send.
  host_broadcast: {
    name: "host_broadcast",
    category: "marketing",
    locale: "en",
    status: "draft",
    body: "{{1}}\n\n{{2}}",
    variables: ["host_signature", "body"],
    render: ({ host_signature, body }) => `${host_signature}\n\n${body}`,
  },

  // VIP invite carries a JWT-link variant.
  vip_invite: {
    name: "vip_invite",
    category: "utility",
    locale: "en",
    status: "draft",
    body:
      "{{1}} invited you to {{2}}. Tap to claim your spot: {{3}}",
    variables: ["host_name", "event_title", "invite_link"],
    render: ({ host_name, event_title, invite_link }) =>
      `${host_name} invited you to ${event_title}. Tap to claim your spot: ${invite_link}`,
  },
};

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
