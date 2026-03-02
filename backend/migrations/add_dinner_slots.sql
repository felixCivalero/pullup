-- Migration: Add explicit dinner slots configuration
-- Description: Stores per-slot dinner times and capacities as JSON on events

ALTER TABLE events
ADD COLUMN IF NOT EXISTS dinner_slots JSONB;

-- Optional index for querying by slot time if needed in the future
-- CREATE INDEX IF NOT EXISTS idx_events_dinner_slots ON events USING GIN (dinner_slots);

