-- 135_room_content_display_variant.sql
-- Wall photos are stored at FULL original quality so downloads are pristine
-- (a 4700px, 15MB shot comes back untouched). Rendering those originals in the
-- masonry is slow, and Supabase's on-the-fly image transform can't shrink them
-- (their resolution exceeds its transform input limit). So each new upload now
-- also produces a lightweight display copy (long edge ≤ ~2048px, jpeg) that the
-- wall shows on screen; the original stays the download source.
--
-- Nullable + no backfill: existing rows keep display_url NULL and simply render
-- their original (unchanged behaviour). Only uploads from here on get the copy.

ALTER TABLE room_content
  ADD COLUMN IF NOT EXISTS display_url TEXT,
  ADD COLUMN IF NOT EXISTS display_storage_path TEXT;
