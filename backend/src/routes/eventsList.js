// GET /events — the authenticated host's event list with stats
// (per-event confirmed counts, page views, host role, upcoming/past filter).

import {
  mapEventFromDb,
  getUserEventIds,
  getEventHostRole,
  claimPendingInvitationsForUser,
} from "../data.js";

import { requireAuth } from "../middleware/auth.js";

export function registerEventsListRoutes(app) {
  // ---------------------------
  // PROTECTED: List user's events (requires auth)
  // ---------------------------
  app.get("/events", requireAuth, async (req, res) => {
    try {
      // Claim any pending co-host invitations for this user (by email)
      try {
        await claimPendingInvitationsForUser(req.user.id, req.user.email);
      } catch (claimErr) {
        console.error("Error claiming pending invitations:", claimErr.message);
      }

      // Fetch events where the authenticated user is a host (owner or co-host)
      const eventIds = await getUserEventIds(req.user.id);

      if (!eventIds || eventIds.length === 0) {
        return res.json([]);
      }

      const { supabase } = await import("../supabase.js");
      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .in("id", eventIds)
        .order("starts_at", { ascending: false });

      if (error) {
        console.error("Error fetching events:", error);
        return res.status(500).json({ error: "Failed to fetch events" });
      }

      // Map to application format using the existing helper
      const mappedEvents = await Promise.all(
        (events || []).map((dbEvent) => mapEventFromDb(dbEvent))
      );

      // Add stats and role to each event
      const { getEventCounts } = await import("../data.js");

      // Batch-fetch page view counts for all events in one query
      let viewCountMap = {};
      try {
        const allIds = mappedEvents.map((e) => e.id);
        if (allIds.length > 0) {
          const { data: viewRows } = await supabase
            .from("event_page_views")
            .select("event_id")
            .in("event_id", allIds);
          if (viewRows) {
            for (const row of viewRows) {
              viewCountMap[row.event_id] = (viewCountMap[row.event_id] || 0) + 1;
            }
          }
        }
      } catch (err) {
        console.error("Failed to batch-fetch view counts:", err.message);
      }

      const eventsWithStats = await Promise.all(
        mappedEvents.map(async (event) => {
          const [{ confirmed }, myRole] = await Promise.all([
            getEventCounts(event.id),
            getEventHostRole(req.user.id, event.id),
          ]);
          return {
            ...event,
            myRole,
            _stats: {
              confirmed,
              totalCapacity: event.totalCapacity ?? null,
              views: viewCountMap[event.id] || 0,
            },
          };
        })
      );

      // Optional filtering: ?filter=upcoming|past|all
      const filter = (req.query.filter || "all").toString().toLowerCase();
      let filteredEvents = eventsWithStats;

      const DEFAULT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 hours
      if (filter === "upcoming") {
        const now = new Date();
        filteredEvents = eventsWithStats.filter((event) => {
          if (!event.startsAt) return true;
          const start = new Date(event.startsAt);
          const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
          if (now > end) return false; // past
          return true; // upcoming or ongoing
        });
      } else if (filter === "past") {
        const now = new Date();
        filteredEvents = eventsWithStats.filter((event) => {
          if (!event.startsAt) return false;
          const start = new Date(event.startsAt);
          const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + DEFAULT_DURATION_MS);
          return now > end;
        });
      }

      res.json(filteredEvents);
    } catch (error) {
      console.error("Error fetching events:", error);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  });
}
