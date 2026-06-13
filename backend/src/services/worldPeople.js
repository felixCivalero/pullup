// Pure: who counts as a host's "world".
//
// The masthead people count (and the people list under it) must include EVERYONE
// the host has a relationship with — not just the RSVP/pull-up graph. People a
// host brought in from another system (via "Bring your people" → /host/import)
// land in person_events (type 'import') and never appear in rsvps, so a
// count built from rsvps alone silently drops them. This unions the id sources
// and dedupes, so the count matches the host's real database — and agrees with
// getRoomForHost's peopleCount + the "new people" moment, which already read the
// full person_events timeline.
//
// Kept pure (no IO) so the route stays the single place that fetches, and so the
// "imports are counted" guarantee is unit-testable.

// Accepts any number of row arrays. Each row may be an object with a `person_id`
// field (rsvp / pull-up / person_events rows) or a bare id string. Falsy ids are
// dropped; the result is the deduped union, order-stable by first appearance.
export function unionWorldPersonIds(...sources) {
  const ids = new Set();
  for (const rows of sources) {
    for (const row of rows || []) {
      const id = row && typeof row === "object" ? row.person_id : row;
      if (id) ids.add(id);
    }
  }
  return [...ids];
}
