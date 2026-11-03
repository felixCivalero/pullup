// Statistics for an organiser or their assistant (lib/eventStats.js): the
// brand's overview — a main brand compares the brands under it — and one
// event's. Sources: instagram, facebook, tiktok, linkedin, google, ai (AI
// answers), mail, direct (no referrer: a shared link, typed, an app), or the
// site's host; "unknown" for a sign-up made before visits were counted.
import { z } from "zod";
import { defineAction } from "./registry.js";
import { statsForEvent, statsOverview } from "../repos/hostEvents.js";
import { brandInput, inBrand } from "./events.js";

const note = "conversion = share of visitors who signed up, counted only over the time the event's visits were counted (from 2026-11-03). came = marked as came on the guest list.";

export const getStats = defineAction({
  name: "get_stats",
  title: "Statistics for a brand",
  description: `How the brand is doing: visits to its event pages, visitors, sign-ups, conversion, who came, yes to invitations; the last 60 days day by day; where visits come from; every event with its numbers. For a main brand over other brands: everything under it, plus one row per brand to compare. ${note}`,
  access: "user",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ brand: brandInput }),
  run: async ({ brand }, { caller }) => {
    const s = await statsOverview(inBrand(caller, brand));
    return { ...s, daily: s.daily.filter((d) => d.visits || d.signups) };
  },
});

export const getEventStats = defineAction({
  name: "get_event_stats",
  title: "Statistics for one event",
  description: `One event's page: visits and visitors, sign-ups, conversion, who came, returning guests (signed up to one of the brand's earlier events) vs new, devices, where visits came from and where sign-ups came from, day by day. ${note}`,
  access: "user",
  effect: "read",
  untrustedOutput: true,
  input: z.object({ eventId: z.guid().describe("The event's id (list_my_events).") }),
  run: async ({ eventId }, { caller }) => {
    const s = await statsForEvent(caller, eventId);
    return { ...s, daily: s.daily.filter((d) => d.visits || d.signups) };
  },
});

export default [getStats, getEventStats];
