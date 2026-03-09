-- Migration: Add host_id to stockholm_events
-- Purpose: Allow assigning a Pullup user as host/arranger for a curated event

ALTER TABLE stockholm_events
  ADD COLUMN IF NOT EXISTS host_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Additional FK to profiles for PostgREST join support
ALTER TABLE stockholm_events
  ADD CONSTRAINT stockholm_events_host_id_profiles_fkey
  FOREIGN KEY (host_id) REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stockholm_events_host_id ON stockholm_events(host_id) WHERE host_id IS NOT NULL;
