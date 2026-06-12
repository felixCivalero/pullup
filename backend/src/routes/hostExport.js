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

const PEOPLE_REDACT = ["marketing_unsubscribe_token", "stripe_customer_id"];

// PostgREST caps a select at 1000 rows — page until drained so the export
// is complete at any size.
async function fetchAll(query) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
}

export function registerHostExportRoutes(app) {
  app.get("/host/export", requireAuth, async (req, res) => {
    try {
      const hostId = req.user.id;
      const { supabase } = await import("../supabase.js");

      const { data: profile, error: profErr } = await supabase
        .from("profiles").select("*").eq("id", hostId).maybeSingle();
      if (profErr) throw profErr;

      const events = await fetchAll(() =>
        supabase.from("events").select("*").eq("host_id", hostId).order("created_at"));
      const eventIds = events.map((e) => e.id);

      const chunk = (arr, n = 100) => {
        const out = [];
        for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
        return out;
      };

      // Per-event tables, fetched in id-chunks so the IN-list stays sane.
      const rsvps = [], roomMessages = [], doorScans = [];
      for (const ids of chunk(eventIds)) {
        rsvps.push(...await fetchAll(() =>
          supabase.from("rsvps").select("*").in("event_id", ids).order("created_at")));
        roomMessages.push(...await fetchAll(() =>
          supabase.from("event_space_messages").select("*").in("event_id", ids).order("created_at")));
        doorScans.push(...await fetchAll(() =>
          supabase.from("pullups").select("*").in("event_id", ids).order("created_at")));
      }

      const timeline = await fetchAll(() =>
        supabase.from("person_events").select("*").eq("host_id", hostId).order("occurred_at"));
      const notes = await fetchAll(() =>
        supabase.from("person_notes").select("*").eq("host_id", hostId).order("created_at"));

      // Their people = everyone their events or world has touched.
      const personIds = [...new Set([
        ...rsvps.map((r) => r.person_id),
        ...timeline.map((t) => t.person_id),
        ...notes.map((n) => n.person_id),
        ...doorScans.map((p) => p.person_id),
      ].filter(Boolean))];

      const people = [];
      for (const ids of chunk(personIds)) {
        people.push(...await fetchAll(() =>
          supabase.from("people").select("*").in("id", ids).order("created_at")));
      }
      for (const p of people) for (const k of PEOPLE_REDACT) delete p[k];

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
