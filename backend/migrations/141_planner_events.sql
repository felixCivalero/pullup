-- 141_planner_events.sql
-- The content timeline (admin → Tidslinje) outlives the PullUp event platform.
-- Its event marks used to come from `events`; now they are entries Felix adds
-- himself on the timeline. planner_cards.event_id re-points here.
--
-- Data moves (one-off, idempotent):
--   1. events that existing cards are tagged to are copied in (same id), so
--      those cards keep their event.
--   2. Felix's planner rows move from his old Google account
--      (felix.civalero@gmail.com) to the site owner account (felix@pullup.se).

CREATE TABLE IF NOT EXISTS planner_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Event',
  starts_at   DATE NOT NULL,
  image_url   TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_planner_events_host ON planner_events(host_id, starts_at);

ALTER TABLE planner_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "planner_events_select_own" ON planner_events;
CREATE POLICY "planner_events_select_own" ON planner_events
  FOR SELECT USING (auth.uid() = host_id);

-- 1. carry over the events cards are tagged to
INSERT INTO planner_events (id, host_id, title, starts_at, image_url)
SELECT DISTINCT e.id, c.host_id, COALESCE(NULLIF(trim(e.title), ''), 'Event'), (e.starts_at AT TIME ZONE 'Europe/Stockholm')::date, e.image_url
FROM planner_cards c
JOIN events e ON e.id = c.event_id
WHERE e.starts_at IS NOT NULL
ON CONFLICT (id) DO NOTHING;

UPDATE planner_cards c SET event_id = NULL
WHERE event_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM planner_events pe WHERE pe.id = c.event_id);

ALTER TABLE planner_cards DROP CONSTRAINT IF EXISTS planner_cards_event_id_fkey;
ALTER TABLE planner_cards
  ADD CONSTRAINT planner_cards_event_id_fkey FOREIGN KEY (event_id) REFERENCES planner_events(id) ON DELETE SET NULL;

-- 2. Felix's old account → the owner account
DO $$
DECLARE
  old_id UUID := (SELECT id FROM auth.users WHERE email = 'felix.civalero@gmail.com');
  new_id UUID := (SELECT id FROM auth.users WHERE email = 'felix@pullup.se');
BEGIN
  IF old_id IS NOT NULL AND new_id IS NOT NULL THEN
    UPDATE planner_cards     SET host_id = new_id WHERE host_id = old_id;
    UPDATE planner_timelines SET host_id = new_id WHERE host_id = old_id;
    UPDATE planner_events    SET host_id = new_id WHERE host_id = old_id;
  END IF;
END $$;

-- events.image_url held a storage path; planner_events wants a URL.
UPDATE planner_events
SET image_url = 'https://pydmumupoppgnopcegxq.supabase.co/storage/v1/object/public/event-images/' || image_url
WHERE image_url IS NOT NULL AND image_url NOT LIKE 'http%';
