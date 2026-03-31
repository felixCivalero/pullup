-- Custom content sections for event pages
-- Stored as JSON array: [{ "title": "About", "text": "..." }, ...]
ALTER TABLE events ADD COLUMN IF NOT EXISTS sections JSONB DEFAULT '[]'::jsonb;
