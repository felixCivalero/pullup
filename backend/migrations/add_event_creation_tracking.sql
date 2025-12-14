-- Migration: Add event creation tracking fields
-- Date: 2024
-- Description: Adds created_via and status fields to events table for dual personality event creation

-- Add created_via field to track which flow created the event
ALTER TABLE events
ADD COLUMN IF NOT EXISTS created_via VARCHAR(20) DEFAULT 'legacy';

-- Add status field to support DRAFT/PUBLISHED states
ALTER TABLE events
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'PUBLISHED';

-- Add check constraint for created_via
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_created_via'
    ) THEN
        ALTER TABLE events
        ADD CONSTRAINT check_created_via
        CHECK (created_via IN ('post', 'create', 'legacy'));
    END IF;
END $$;

-- Add check constraint for status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_status'
    ) THEN
        ALTER TABLE events
        ADD CONSTRAINT check_status
        CHECK (status IN ('DRAFT', 'PUBLISHED'));
    END IF;
END $$;

-- Update existing events to have legacy created_via and PUBLISHED status
UPDATE events
SET created_via = 'legacy'
WHERE created_via IS NULL;

UPDATE events
SET status = 'PUBLISHED'
WHERE status IS NULL;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_created_via ON events(created_via);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_status_host ON events(status, host_id);
