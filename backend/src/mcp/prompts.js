// Pre-built MCP prompts surfaced to the host as one-click conversation
// starters. Clients like Claude Desktop render these in a prompts/
// commands menu — the host picks one and Claude expands it into the
// usual chat, then proceeds with tool calls.
//
// Each prompt is opinionated about which tools to lean on and how to
// frame the response. That's the whole point: it teaches non-power-users
// what the MCP can do without them having to know the tool names.
//
// Keep prompts tightly scoped to a single recognizable host job. If you
// find yourself writing "and also…" — split it into two prompts.
//
// All prompts use the simple form: zero or one required argument, plus
// instructions baked into the user message we return to the client.
//
// To add a prompt:
//   1. Append a new entry to `prompts` below.
//   2. Optionally declare argsSchema to require parameters.
//   3. Write the user message; reference tool names plainly so the model
//      knows what to call.

import { z } from "zod";

export const prompts = [
  // ─── Weekly check-in ─────────────────────────────────────────────
  {
    name: "weekly_check_in",
    title: "Weekly check-in",
    description:
      "Pull a sharp one-screen summary of the last 7 days: RSVPs received, revenue, page views, and trending events. Good Monday-morning ritual.",
    argsSchema: {},
    handler: () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Give me my PullUp check-in for the last 7 days.\n\n" +
              "Use these tools in order, then summarise:\n" +
              "1. get_recent_activity with days=7\n" +
              "2. get_revenue_summary (note the gross/net line items)\n\n" +
              "Present as a short, scannable list. Flag anything notable: a trending event, a drop vs prior week. No fluff — what's worth my attention.",
          },
        },
      ],
    }),
  },

  // ─── Plan next event from a template ─────────────────────────────
  {
    name: "plan_next_event",
    title: "Plan next event (from a template)",
    description:
      "Clone a past event into a new DRAFT for next month and walk me through the details. Provide the slug of the event to use as a template.",
    argsSchema: {
      templateSlug: z.string().describe(
        "Slug of the past event to use as a template. Use list_events first if you don't know it."
      ),
    },
    handler: ({ templateSlug }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `I want to plan my next event using ${templateSlug} as a template.\n\n` +
              "Do this:\n" +
              `1. Call get_event with slug='${templateSlug}' so you see how it was set up.\n` +
              "2. Suggest a date that fits my cadence (look at list_events with upcomingOnly=false to see the rhythm).\n" +
              "3. Ask me one clarifying question: any details that should change (title, location, capacity, theme)?\n" +
              "4. Once I confirm, call duplicate_event and update_event as needed to apply changes.\n" +
              "5. End by sharing the preview URL so I can take a look.\n\n" +
              "Keep the conversation tight. Don't publish — leave it as DRAFT.",
          },
        },
      ],
    }),
  },

  // ─── Audience deep-dive ───────────────────────────────────────────
  {
    name: "audience_deep_dive",
    title: "Who are my regulars",
    description:
      "Get a clear read on my audience: who comes the most, who spent the most, who I haven't seen lately. Useful before crafting a VIP touch or follow-up.",
    argsSchema: {},
    handler: () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "Tell me about my PullUp audience.\n\n" +
              "Pull data via:\n" +
              "1. get_crm_summary (overall picture + top repeat attendees)\n" +
              "2. get_audience_segments (first-timers / occasional / regulars split + top spenders)\n" +
              "3. query_people with eventsAttendedMin=3, limit=10 to see my actual loyal core\n\n" +
              "Synthesise: who are my regulars (name, count, last seen)? Who's a high-spender I should know about? Any pattern in who's drifting? End with one concrete suggestion for an action.",
          },
        },
      ],
    }),
  },

  // ─── Pre-publish checklist ────────────────────────────────────────
  {
    name: "pre_publish_check",
    title: "Pre-publish checklist for a DRAFT event",
    description:
      "Audit a DRAFT event before publishing: image, copy, date, location, ticketing, RSVP form. Catches the small misses that hurt conversion.",
    argsSchema: {
      slug: z.string().describe("Slug of the DRAFT event to audit."),
    },
    handler: ({ slug }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              `Audit ${slug} before I publish it.\n\n` +
              `1. Call get_event with slug='${slug}'.\n` +
              `2. Check for the small things that hurt conversion: cover image present? Title clear? Date in the right timezone? Location set (or hideLocation with a good revealHint)? Description tells the story? Capacity reasonable for the venue?\n` +
              `3. If ticketed, verify ticketPrice + currency look right.\n` +
              `4. Return a short, ranked list: 'Ship it' / 'Fix before publishing' / 'Nice to have'. Use update_event to suggest fixes inline if I tell you to.\n` +
              `5. Do NOT call publish_event automatically.`,
          },
        },
      ],
    }),
  },
];
