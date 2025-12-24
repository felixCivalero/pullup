-- Update email_campaigns table for template-based campaigns
-- Migration: update_email_campaigns_for_templates.sql
-- Date: January 2025

-- CRITICAL: Update status constraint to include 'queued' and 'failed'
ALTER TABLE email_campaigns 
DROP CONSTRAINT IF EXISTS valid_status;

ALTER TABLE email_campaigns
ADD CONSTRAINT valid_status CHECK (status IN ('draft', 'queued', 'scheduled', 'sending', 'sent', 'paused', 'failed'));

-- Add new columns for template-based campaigns
ALTER TABLE email_campaigns
ADD COLUMN IF NOT EXISTS template_type TEXT NOT NULL DEFAULT 'event',
ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES events(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS template_content JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS filter_criteria JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS total_recipients INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_sent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_failed INTEGER DEFAULT 0;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_email_campaigns_event_id ON email_campaigns(event_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_template_type ON email_campaigns(template_type);

-- Add comments for documentation
COMMENT ON COLUMN email_campaigns.template_type IS 'Type of template (e.g., "event")';
COMMENT ON COLUMN email_campaigns.event_id IS 'Event ID if this is an event-based campaign';
COMMENT ON COLUMN email_campaigns.template_content IS 'Template content (headline, introQuote, introBody, etc.)';
COMMENT ON COLUMN email_campaigns.filter_criteria IS 'Filter criteria used to select recipients';
COMMENT ON COLUMN email_campaigns.total_recipients IS 'Total number of recipients for this campaign';
COMMENT ON COLUMN email_campaigns.total_sent IS 'Number of emails successfully sent';
COMMENT ON COLUMN email_campaigns.total_failed IS 'Number of emails that failed to send';

