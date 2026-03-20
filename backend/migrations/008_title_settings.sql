-- Add title_settings JSONB column to events table
-- Stores: { visible, align, font, size, color }
ALTER TABLE events ADD COLUMN IF NOT EXISTS title_settings jsonb DEFAULT NULL;
