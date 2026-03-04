-- Migration: rename_email_tables_to_campaign.sql
-- Purpose: Move product-level email_* tables into the PullUp campaign domain as campaign_*.

BEGIN;

-- Rename core product tables
ALTER TABLE IF EXISTS email_campaigns RENAME TO campaign_campaigns;
ALTER TABLE IF EXISTS email_templates RENAME TO campaign_templates;
ALTER TABLE IF EXISTS email_sends RENAME TO campaign_sends;

-- Rename indexes for templates
ALTER INDEX IF EXISTS idx_email_templates_user_id
  RENAME TO idx_campaign_templates_user_id;

ALTER INDEX IF EXISTS idx_email_templates_is_default
  RENAME TO idx_campaign_templates_is_default;

-- Rename indexes for campaigns
ALTER INDEX IF EXISTS idx_email_campaigns_user_id
  RENAME TO idx_campaign_campaigns_user_id;

ALTER INDEX IF EXISTS idx_email_campaigns_status
  RENAME TO idx_campaign_campaigns_status;

ALTER INDEX IF EXISTS idx_email_campaigns_template_id
  RENAME TO idx_campaign_campaigns_template_id;

-- Rename indexes for sends
ALTER INDEX IF EXISTS idx_email_sends_campaign_id
  RENAME TO idx_campaign_sends_campaign_id;

ALTER INDEX IF EXISTS idx_email_sends_person_id
  RENAME TO idx_campaign_sends_person_id;

ALTER INDEX IF EXISTS idx_email_sends_status
  RENAME TO idx_campaign_sends_status;

ALTER INDEX IF EXISTS idx_email_sends_resend_email_id
  RENAME TO idx_campaign_sends_resend_email_id;

ALTER INDEX IF EXISTS idx_email_sends_email
  RENAME TO idx_campaign_sends_email;

-- Optional: rename status constraint on campaigns for clarity.
-- Note: Postgres does not support "RENAME CONSTRAINT IF EXISTS", so we
-- assume the original constraint name is "valid_status" from the
-- previous migration.
ALTER TABLE campaign_campaigns
  RENAME CONSTRAINT valid_status TO campaign_campaigns_valid_status;

-- Delivery status mirror on campaign_sends, for infra-driven outcomes
ALTER TABLE IF EXISTS campaign_sends
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS delivery_status_updated_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS campaign_sends
  ADD CONSTRAINT IF NOT EXISTS valid_delivery_status
  CHECK (
    delivery_status IN (
      'queued',
      'sent',
      'delivered',
      'bounced',
      'complaint',
      'failed',
      'suppressed'
    )
  );

COMMIT;

