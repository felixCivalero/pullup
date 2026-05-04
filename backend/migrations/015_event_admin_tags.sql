-- 015_event_admin_tags.sql
-- Internal-only tags admins can attach per event so we can build a picture
-- of each host's recurring formats over time (dinner, networking, art, etc.).
-- GIN index supports tag-based filtering once the admin CRM aggregates them.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS admin_tags text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS events_admin_tags_gin_idx
  ON events USING gin (admin_tags);
