-- 114_room_pages.sql
-- Which "pages" (tabs) the event Room shows. The Wall is the hero and is always
-- on; Chat and Shop are host toggles, set in the room's "Pages" fold-down next
-- to Room access + Team. A guest never sees a tab the host turned off (and the
-- Shop tab self-hides for guests when there's nothing in it — that's frontend).
--
-- Lives alongside room_permissions (capabilities) as a sibling jsonb on events,
-- kept separate so the capability resolver never has to reason about layout.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS room_pages jsonb NOT NULL DEFAULT '{"chat": true, "shop": true}'::jsonb;
