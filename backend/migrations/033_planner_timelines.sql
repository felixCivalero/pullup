-- 033_planner_timelines.sql
-- Multiple named timeline "lanes" for the Content Planner. Each lane is
-- host-scoped, carries a heading name + accent colour + a vertical world
-- position (y), and an event_filter describing which of the host's events it
-- shows ({ mode: 'all' | 'selected', eventIds: [...] }). Content cards gain a
-- timeline_id so each card belongs to a lane (NULL = the host's default lane).
--
-- All dates share ONE axis across lanes; lanes differ only in what they hold
-- and where they sit vertically. Additive + idempotent. Writes go through the
-- service-role backend (which re-asserts host_id); RLS select-own is belt-and-braces.

CREATE TABLE IF NOT EXISTS planner_timelines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'New timeline',
  color         TEXT NOT NULL DEFAULT '#60a5fa',
  y             DOUBLE PRECISION NOT NULL DEFAULT 0,
  sort          INTEGER NOT NULL DEFAULT 0,
  event_filter  JSONB NOT NULL DEFAULT '{"mode":"all","eventIds":[]}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planner_timelines_host ON planner_timelines(host_id, sort);

ALTER TABLE planner_timelines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planner_timelines_select_own" ON planner_timelines;
CREATE POLICY "planner_timelines_select_own" ON planner_timelines
  FOR SELECT USING (auth.uid() = host_id);

ALTER TABLE planner_cards
  ADD COLUMN IF NOT EXISTS timeline_id UUID REFERENCES planner_timelines(id) ON DELETE SET NULL;
