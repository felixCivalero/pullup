-- Custom RSVP form fields for event pages
-- Stored as JSON array of { id, type, label, required, placeholder, key }
ALTER TABLE events ADD COLUMN IF NOT EXISTS form_fields JSONB DEFAULT '[]'::jsonb;

-- Custom answers captured per booking (keyed by form field id)
ALTER TABLE rsvps ADD COLUMN IF NOT EXISTS custom_answers JSONB DEFAULT '{}'::jsonb;
