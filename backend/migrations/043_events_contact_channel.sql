-- 043_events_contact_channel.sql
-- Per-event choice of RSVP contact channel: email / whatsapp / both.
-- Drives both (a) which fields are mandatory on the RSVP form and
-- (b) which channel transactional + reminder messages go out on.
-- Default is 'email' to preserve existing behaviour for the 55 events
-- already in the table.
--
-- Idempotent: safe to re-run.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS contact_channel TEXT NOT NULL DEFAULT 'email';

ALTER TABLE events
  DROP CONSTRAINT IF EXISTS events_contact_channel_check;
ALTER TABLE events
  ADD  CONSTRAINT events_contact_channel_check
  CHECK (contact_channel IN ('email','whatsapp','both'));

CREATE INDEX IF NOT EXISTS idx_events_contact_channel
  ON events (contact_channel)
  WHERE contact_channel <> 'email';

COMMENT ON COLUMN events.contact_channel IS
  'email | whatsapp | both — drives RSVP-form mandatory fields and the channel reminders go out on.';
