-- Persist each cover media item's intrinsic pixel dimensions so the marketing
-- page can reserve the exact hero shape BEFORE the image loads (see the frontend
-- mediaFormat.js "one model" comment). Without stored dimensions the frontend
-- has to measure the image after paint, which causes the frame to snap/reflow.
-- Captured at upload from the client's natural width/height; nullable so legacy
-- rows (measured client-side as a fallback) keep working until backfilled.

ALTER TABLE event_media ADD COLUMN IF NOT EXISTS width INTEGER;
ALTER TABLE event_media ADD COLUMN IF NOT EXISTS height INTEGER;
