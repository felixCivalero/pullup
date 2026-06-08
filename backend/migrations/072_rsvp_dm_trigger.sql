-- 072_rsvp_dm_trigger.sql
--
-- Extend the per-event Instagram automation (event_comment_triggers, mig 068)
-- from a single trigger type (comment→DM) to a typed model:
--
--   trigger_type = 'comment'       — comment a keyword on a post → DM the link (existing)
--   trigger_type = 'rsvp_success'  — guest RSVPs → DM them (NEW)
--
-- The RSVP trigger fires only for guests who entered through Instagram (we hold
-- their IGSID, bound at RSVP) AND have an open 24h IG messaging window — Meta
-- forbids an automated DM otherwise. It carries no keyword.
--
-- ADDITIVE: existing rows default to 'comment', so nothing changes for them.

BEGIN;

-- Type discriminator. Existing rows (all comment triggers) default correctly.
ALTER TABLE event_comment_triggers
  ADD COLUMN IF NOT EXISTS trigger_type TEXT NOT NULL DEFAULT 'comment'
  CHECK (trigger_type IN ('comment', 'rsvp_success'));

-- RSVP triggers have no keyword; only comment triggers require one.
ALTER TABLE event_comment_triggers ALTER COLUMN keyword DROP NOT NULL;

-- At most ONE rsvp_success trigger per event (a comment event can still have
-- many keyword triggers — this constraint scopes to the RSVP type only).
CREATE UNIQUE INDEX IF NOT EXISTS uq_ect_one_rsvp_per_event
  ON event_comment_triggers (event_id)
  WHERE trigger_type = 'rsvp_success';

-- Fire-time lookup path: "does this event have an enabled RSVP trigger?"
CREATE INDEX IF NOT EXISTS idx_ect_event_type
  ON event_comment_triggers (event_id, trigger_type);

COMMIT;
