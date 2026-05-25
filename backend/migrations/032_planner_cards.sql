-- 032_planner_cards.sql
-- Durable storage for Content Planner cards. Replaces the dev-only
-- localStorage/IndexedDB: each card (its position, size, channel/type/event,
-- note, anchored dates, and uploaded media URL) is now a row, host-scoped.
--
-- `id` is client-generated (the canvas already mints UUIDs) so it's the PK with
-- no default — create/update/delete all key off it. Media files live in
-- Supabase Storage (event-images bucket, planner/<host>/… path); media_url is
-- the public URL and media_path is kept so deletes can clean up the object.
--
-- Additive (new table) — safe to apply ahead of the deploy. Idempotent.

CREATE TABLE IF NOT EXISTS planner_cards (
  id            UUID PRIMARY KEY,
  host_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  x             DOUBLE PRECISION NOT NULL DEFAULT 0,
  y             DOUBLE PRECISION NOT NULL DEFAULT 0,
  w             DOUBLE PRECISION NOT NULL DEFAULT 188,
  channel       TEXT,
  content_type  TEXT NOT NULL DEFAULT 'image',
  -- The event the content is FOR (separate from its post date). SET NULL so
  -- deleting an event never deletes the planned content.
  event_id      UUID REFERENCES events(id) ON DELETE SET NULL,
  note          TEXT,
  media_url     TEXT,
  media_path    TEXT,
  media_kind    TEXT NOT NULL DEFAULT 'placeholder',
  media_name    TEXT,
  media_mime    TEXT,
  -- Anchored post dates: [{ id, date: 'YYYY-MM-DD' }, …]
  links         JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_cards_host ON planner_cards(host_id, created_at);

ALTER TABLE planner_cards ENABLE ROW LEVEL SECURITY;

-- Read-your-own. All writes go through the service-role backend (which also
-- re-asserts host_id), mirroring person_notes / host_actions.
DROP POLICY IF EXISTS "planner_cards_select_own" ON planner_cards;
CREATE POLICY "planner_cards_select_own" ON planner_cards
  FOR SELECT USING (auth.uid() = host_id);
