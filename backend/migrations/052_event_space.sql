-- 052_event_space.sql
-- The event's SPACE — the room's conversation. Per the comms model: before a
-- pull-up it's a star (host hub, spokes can't reach each other); after a
-- pull-up it's a mesh (co-present people wire sideways, scoped to THIS event).
-- This table is that shared space. There is no DM primitive — messages live in
-- a space, gated by a pull-up to the event (or by being the host).
--
-- An author is either a guest (author_person_id) or the host (author_profile_id);
-- author_name is a display snapshot so the room reads cleanly without joins.
--
-- Additive + idempotent.

CREATE TABLE IF NOT EXISTS event_space_messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  author_person_id   UUID REFERENCES people (id) ON DELETE SET NULL,
  author_profile_id  UUID REFERENCES profiles (id) ON DELETE SET NULL,
  is_host            BOOLEAN NOT NULL DEFAULT false,
  author_name        TEXT,
  body               TEXT NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_event_space_event ON event_space_messages (event_id, created_at);
