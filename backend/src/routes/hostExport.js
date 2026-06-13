// Stage 1 of data ownership: the full take-it-with-you export.
//
// GET /host/export streams the host's ENTIRE slice as one JSON download —
// profile, events, RSVPs (with answers), their people, the per-person
// timeline (person_events.host_id = "whose world it happened in"), notes,
// room feed messages and door scans. This is the "creator owns the data"
// thesis made tangible: policy becomes a file in their hands.
//
// Redacted on purpose: platform-operational secrets that aren't the host's
// relational data (unsubscribe tokens, Stripe customer ids). Listed in the
// manifest so the export never silently omits anything.

import { requireAuth } from "../middleware/auth.js";
import { gatherHostSlice, PEOPLE_REDACT } from "../services/byo/hostSlice.js";

export function registerHostExportRoutes(app) {
  app.get("/host/export", requireAuth, async (req, res) => {
    try {
      const hostId = req.user.id;

      // Same slice the live mirror uses — one definition, two delivery paths.
      const slice = await gatherHostSlice(hostId);
      const { profile } = slice;
      const {
        events, rsvps, people, person_events: timeline,
        person_notes: notes, event_space_messages: roomMessages,
        pullups: doorScans, event_channels: roomChannels,
      } = slice.tables;

      const payload = {
        manifest: {
          format: "pullup-export",
          version: 1,
          exportedAt: new Date().toISOString(),
          host: { id: hostId, email: req.user.email || null },
          counts: {
            events: events.length,
            rsvps: rsvps.length,
            people: people.length,
            timelineEntries: timeline.length,
            notes: notes.length,
            roomMessages: roomMessages.length,
            roomChannels: roomChannels.length,
            doorScans: doorScans.length,
          },
          redactedFields: { people: PEOPLE_REDACT },
        },
        profile,
        events,
        rsvps,
        people,
        timeline,
        notes,
        roomMessages,
        roomChannels,
        doorScans,
      };

      const stamp = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", `attachment; filename="pullup-export-${stamp}.json"`);
      return res.send(JSON.stringify(payload, null, 2));
    } catch (err) {
      console.error("[host/export] error:", err.message);
      return res.status(500).json({ error: "Failed to build export" });
    }
  });
}
