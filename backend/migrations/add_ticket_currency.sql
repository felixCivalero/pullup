-- Add ticket_currency column to events table
-- This stores the currency for paid events (e.g., "usd", "sek", "eur")

ALTER TABLE events ADD COLUMN IF NOT EXISTS ticket_currency TEXT DEFAULT 'usd';

-- Add comment for documentation
COMMENT ON COLUMN events.ticket_currency IS 'Currency code for paid events (lowercase, e.g., usd, sek, eur). Defaults to usd.';
