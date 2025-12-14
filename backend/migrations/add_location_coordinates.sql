-- Add location coordinate columns to events table
-- These columns are optional and allow storing precise location coordinates
-- for better location services integration

ALTER TABLE events ADD COLUMN IF NOT EXISTS location_lat NUMERIC(10, 8);
ALTER TABLE events ADD COLUMN IF NOT EXISTS location_lng NUMERIC(11, 8);

-- Add indexes for location-based queries (optional, but useful for geospatial queries)
CREATE INDEX IF NOT EXISTS idx_events_location_coords ON events(location_lat, location_lng) WHERE location_lat IS NOT NULL AND location_lng IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN events.location_lat IS 'Latitude coordinate for event location (optional)';
COMMENT ON COLUMN events.location_lng IS 'Longitude coordinate for event location (optional)';
