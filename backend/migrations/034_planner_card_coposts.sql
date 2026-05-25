-- 034_planner_card_coposts.sql
-- Co-posting: a content card can live on multiple timelines at once (shared
-- content — one row, so edits and analytics are shared). `timeline_ids` is the
-- full set of lanes the card belongs to; the older single `timeline_id` is kept
-- and backfilled into the array for compatibility.
-- Additive + idempotent.

ALTER TABLE planner_cards ADD COLUMN IF NOT EXISTS timeline_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE planner_cards
  SET timeline_ids = to_jsonb(ARRAY[timeline_id::text])
  WHERE timeline_id IS NOT NULL AND (timeline_ids = '[]'::jsonb OR timeline_ids IS NULL);
