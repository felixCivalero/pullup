-- 053_event_channels.sql
-- Conversations INSIDE the event room, organised into TOPICS (channels) —
-- Slack-simple: every event has a always-on "Main" channel, and the host can
-- spin up topics ("Group shot", "The grade", "Where next"). This is the
-- COLLECTIVE room talk (everyone who pulled up), NOT 1:1 single-line comms —
-- those live in the host's main Room inbox.
--
-- Also adds a `folder` dimension to event_media so the darkroom can be shown
-- as storage folders (the 4-grid), not one flat pile.
--
-- Additive + idempotent.

-- Topics within an event room.
CREATE TABLE IF NOT EXISTS event_channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_main     BOOLEAN NOT NULL DEFAULT false,   -- the always-on default topic
  sort        INT NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES profiles (id) ON DELETE SET NULL,  -- host who opened it
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_event_channels_event ON event_channels (event_id, sort);
-- One "Main" per event.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_channels_main ON event_channels (event_id) WHERE is_main;

-- Messages now belong to a topic (null = legacy/main).
ALTER TABLE event_space_messages ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES event_channels (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_event_space_channel ON event_space_messages (channel_id, created_at);

-- Storage folders for the darkroom 4-grid.
ALTER TABLE event_media ADD COLUMN IF NOT EXISTS folder TEXT;
