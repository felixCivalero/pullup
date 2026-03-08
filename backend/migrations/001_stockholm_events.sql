-- Migration: Create stockholm_events table
-- Purpose: Store scraped Stockholm cultural events for newsletter curation

CREATE TABLE IF NOT EXISTS stockholm_events (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title                text NOT NULL,
  description          text,
  image_url            text,
  starts_at            timestamptz,
  ends_at              timestamptz,
  location             text,
  url                  text UNIQUE,
  source               text,           -- 'eventbrite', 'stockholm_stad', 'visitstockholm', etc.
  category             text,           -- 'music', 'exhibition', 'culture', 'club', etc.
  status               text NOT NULL DEFAULT 'pending',      -- 'pending' | 'approved' | 'rejected'
  include_in_newsletter boolean NOT NULL DEFAULT false,
  newsletter_sent_at   timestamptz,
  scraped_at           timestamptz DEFAULT now(),
  created_at           timestamptz DEFAULT now()
);

-- Index for common admin queries
CREATE INDEX IF NOT EXISTS idx_stockholm_events_status ON stockholm_events(status);
CREATE INDEX IF NOT EXISTS idx_stockholm_events_starts_at ON stockholm_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_stockholm_events_newsletter ON stockholm_events(include_in_newsletter) WHERE include_in_newsletter = true;
