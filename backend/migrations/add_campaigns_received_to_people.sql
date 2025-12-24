-- Add campaigns_received column to people table
-- Migration: add_campaigns_received_to_people.sql
-- Date: January 2025

-- Add campaigns_received JSONB array to track which campaigns each person received
ALTER TABLE people 
ADD COLUMN IF NOT EXISTS campaigns_received JSONB DEFAULT '[]'::jsonb;

-- Create GIN index for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_people_campaigns_received ON people USING GIN (campaigns_received);

-- Add comment for documentation
COMMENT ON COLUMN people.campaigns_received IS 'Array of campaign IDs this person has received. Format: ["campaign-uuid-1", "campaign-uuid-2"]';

