-- 059_events_location_place_id.sql
-- Google Places place_id for the event's location. The visible `location` is a
-- clean human label ("Francesco, Stockholm"); `location_lat`/`location_lng` give
-- the exact pin for Maps links; this is Google's permanent key to the spot, so
-- we can later re-expand the full address / hours / static map / "what's nearby"
-- without the host re-typing anything. Nullable — free-text locations have none.
-- Applied to prod via MCP 2026-06-06.
ALTER TABLE events ADD COLUMN IF NOT EXISTS location_place_id TEXT;
COMMENT ON COLUMN events.location_place_id IS
  'Google Places place_id for the picked location (opaque token, e.g. ChIJ...). Null for free-text locations. Seed for re-expanding richer place data later.';
