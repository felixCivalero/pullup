-- Per-event "show exact coordinates" mode. When true, every surface that
-- displays the location (event page, RSVP/reminder emails, OG share) surfaces
-- the lat/lng pair alongside the address label — for spots where the street
-- address isn't precise enough (big venues, a specific gate, an unmarked place).
-- The lat/lng columns already exist (location_lat / location_lng); this flag
-- only controls whether they're shown. Defaults false → existing events unchanged.
ALTER TABLE events ADD COLUMN IF NOT EXISTS show_coordinates BOOLEAN DEFAULT false;
