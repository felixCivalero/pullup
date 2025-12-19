-- Migration: Add waitlist payment link tracking columns
-- Date: 2025-12-19
-- Description: Adds columns to track waitlist payment link lifecycle for analytics and status tracking

-- Add columns to rsvps table for waitlist link tracking
ALTER TABLE rsvps 
  ADD COLUMN IF NOT EXISTS waitlist_link_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waitlist_link_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waitlist_link_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS waitlist_link_token TEXT;

-- Add comment for documentation
COMMENT ON COLUMN rsvps.waitlist_link_generated_at IS 'Timestamp when payment link was generated for this waitlist RSVP';
COMMENT ON COLUMN rsvps.waitlist_link_expires_at IS 'Timestamp when the payment link expires (typically 48 hours after generation)';
COMMENT ON COLUMN rsvps.waitlist_link_used_at IS 'Timestamp when the payment link was used (payment completed)';
COMMENT ON COLUMN rsvps.waitlist_link_token IS 'Last generated token for this RSVP (for tracking/debugging)';

-- Create index for analytics queries (filtered index for performance)
CREATE INDEX IF NOT EXISTS idx_rsvps_waitlist_link_generated_at 
  ON rsvps(waitlist_link_generated_at) 
  WHERE booking_status = 'WAITLIST' AND waitlist_link_generated_at IS NOT NULL;

-- Create index for finding expired links
CREATE INDEX IF NOT EXISTS idx_rsvps_waitlist_link_expires_at 
  ON rsvps(waitlist_link_expires_at) 
  WHERE booking_status = 'WAITLIST' AND waitlist_link_expires_at IS NOT NULL;
