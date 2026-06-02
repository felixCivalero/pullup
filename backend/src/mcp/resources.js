// MCP resources for PullUp — browsable URIs that mirror the host's
// dashboard structure. Clients like Claude Desktop render these in a
// sidebar; the host can pin one and reference it in chat.
//
// Resources are READ-ONLY — anything mutating should be a tool, not a
// resource. The point is "I want Claude to see X" without forcing a
// tool call.
//
// URIs:
//   pullup://events/upcoming         → list of upcoming events
//   pullup://events/past             → list of past events
//   pullup://event/{slug}            → one event's details (templated)
//   pullup://crm/summary             → overall CRM summary
//   pullup://crm/recent              → last 30 days of activity
//
// Static resources (no parameters) get a fixed URI and a fetcher. The
// per-event template uses a URI template (RFC 6570 lite) so clients can
// expand `{slug}` themselves; the SDK exposes this as a "resource
// template" the client can list and complete.

import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

function jsonContent(uri, payload) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

// Static (no-arg) resources. Each entry registers as `registerResource`.
export function buildStaticResources(api) {
  return [
    {
      name: "events_upcoming",
      uri: "pullup://events/upcoming",
      title: "Upcoming events",
      description: "JSON list of your published events with a future start date.",
      mimeType: "application/json",
      read: async () => {
        const events = (await api("GET", "/events")) || [];
        const now = Date.now();
        const upcoming = events
          .filter((e) => e.startsAt && new Date(e.startsAt).getTime() > now)
          .map((e) => ({
            slug: e.slug,
            title: e.title,
            startsAt: e.startsAt,
            status: e.status,
            location: e.hideLocation ? null : e.location,
            maxAttendees: e.maxAttendees,
          }));
        return jsonContent("pullup://events/upcoming", upcoming);
      },
    },
    {
      name: "events_past",
      uri: "pullup://events/past",
      title: "Past events",
      description: "JSON list of your events whose start date has passed. Newest first.",
      mimeType: "application/json",
      read: async () => {
        const events = (await api("GET", "/events")) || [];
        const now = Date.now();
        const past = events
          .filter((e) => e.startsAt && new Date(e.startsAt).getTime() <= now)
          .sort((a, b) => new Date(b.startsAt) - new Date(a.startsAt))
          .map((e) => ({
            slug: e.slug,
            title: e.title,
            startsAt: e.startsAt,
            status: e.status,
            location: e.hideLocation ? null : e.location,
          }));
        return jsonContent("pullup://events/past", past);
      },
    },
    {
      name: "crm_summary",
      uri: "pullup://crm/summary",
      title: "CRM summary",
      description: "Aggregate stats across all your events: events, RSVPs, unique guests, top attendees, top events.",
      mimeType: "application/json",
      read: async () => {
        const summary = await api("GET", "/host/crm/summary", { query: { topN: 5 } });
        return jsonContent("pullup://crm/summary", summary);
      },
    },
    {
      name: "crm_recent",
      uri: "pullup://crm/recent",
      title: "Recent activity (30 days)",
      description: "RSVPs, new people, revenue, page views, and trending events for the last 30 days.",
      mimeType: "application/json",
      read: async () => {
        const data = await api("GET", "/host/crm/recent", { query: { days: 30 } });
        return jsonContent("pullup://crm/recent", data);
      },
    },
  ];
}

// Per-event resource template — clients can resolve `pullup://event/{slug}`
// to a specific event by expanding the slug. The handler resolves the
// slug → event id and returns the full event payload, the same shape the
// website's editor reads.
export function buildEventResourceTemplate(api) {
  return {
    name: "event_by_slug",
    template: new ResourceTemplate("pullup://event/{slug}", {
      list: undefined, // listing is covered by events_upcoming/events_past
    }),
    metadata: {
      title: "Event by slug",
      description: "Full event details for one event. Expand {slug} to one of your event slugs.",
      mimeType: "application/json",
    },
    read: async (uri, vars) => {
      const slug = vars?.slug;
      if (!slug) throw new Error("slug is required in pullup://event/{slug}");
      const events = (await api("GET", "/events")) || [];
      const match = events.find((e) => e.slug === slug);
      if (!match) {
        throw new Error(`No event found with slug "${slug}".`);
      }
      const full = await api("GET", `/host/events/${match.id}`);
      return jsonContent(uri.href || `pullup://event/${slug}`, full);
    },
  };
}
