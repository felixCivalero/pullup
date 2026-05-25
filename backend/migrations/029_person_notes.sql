-- 029_person_notes.sql
-- Per-host timeline notes about a person.
--
-- People are SHARED across hosts — someone "belongs" to a host only because
-- they RSVP'd to one of that host's events (see personBelongsToHost). So a
-- note about a guest is PRIVATE to the host who wrote it: scoped by host_id,
-- never exposed to another host who happens to share the same contact.
--
-- The human flow is deliberately simple: date + free-text content, optionally
-- tagged to the event it happened at ("which walk"). `topic` is reserved for
-- AI enrichment — only set via the MCP add_person_note tool — and is hidden in
-- the UI for now. The column exists from day one so we never have to migrate
-- to start filtering on it later.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS person_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people(id)     ON DELETE CASCADE,
  host_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which event the note is about. SET NULL (not CASCADE): deleting an event
  -- should never delete the host's observation about a person.
  event_id    UUID          REFERENCES events(id)     ON DELETE SET NULL,
  content     TEXT NOT NULL,
  -- The displayed date. Defaults to today; the host can backdate, and picking
  -- an event snaps it to the event's date client-side.
  note_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  -- AI-only enrichment label. Hidden in the UI. NULL for host-typed notes.
  topic       TEXT,
  -- Where the note came from: typed in the web UI vs added through the AI/MCP.
  source      TEXT NOT NULL DEFAULT 'ui' CHECK (source IN ('ui', 'mcp')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Timeline read: one host's notes for one person, newest first.
CREATE INDEX IF NOT EXISTS idx_person_notes_host_person
  ON person_notes(host_id, person_id, note_date DESC, created_at DESC);

ALTER TABLE person_notes ENABLE ROW LEVEL SECURITY;

-- Read-your-own-notes. All writes flow through the service-role backend
-- (which bypasses RLS), so no insert/update/delete policies are needed for
-- authenticated users — mirrors the host_actions posture.
DROP POLICY IF EXISTS "person_notes_select_own" ON person_notes;
CREATE POLICY "person_notes_select_own" ON person_notes
  FOR SELECT
  USING (auth.uid() = host_id);
