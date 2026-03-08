-- Migration: Add spotify_url column to stockholm_events
-- Purpose: Allow admins to attach a Spotify link to cultural events

ALTER TABLE stockholm_events ADD COLUMN IF NOT EXISTS spotify_url text;
