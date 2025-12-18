-- Add CRM fields to people table
-- Migration: add_crm_fields_to_people.sql
-- Date: December 17, 2025

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS total_spend INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_volume INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispute_losses INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subscription_type TEXT,
  ADD COLUMN IF NOT EXISTS interested_in TEXT,
  ADD COLUMN IF NOT EXISTS import_source TEXT,
  ADD COLUMN IF NOT EXISTS import_metadata JSONB;

-- Add indexes for search/filtering
CREATE INDEX IF NOT EXISTS idx_people_total_spend ON people(total_spend);
CREATE INDEX IF NOT EXISTS idx_people_payment_count ON people(payment_count);
CREATE INDEX IF NOT EXISTS idx_people_subscription_type ON people(subscription_type);
CREATE INDEX IF NOT EXISTS idx_people_stripe_customer_id ON people(stripe_customer_id);

-- Add comment for documentation
COMMENT ON COLUMN people.total_spend IS 'Total amount spent in cents';
COMMENT ON COLUMN people.payment_count IS 'Number of payments made';
COMMENT ON COLUMN people.refunded_volume IS 'Total refunded amount in cents';
COMMENT ON COLUMN people.dispute_losses IS 'Total dispute losses in cents';
COMMENT ON COLUMN people.subscription_type IS 'Subscription type (e.g., free, paid)';
COMMENT ON COLUMN people.interested_in IS 'Customer interests/preferences';
COMMENT ON COLUMN people.import_source IS 'Source of import (e.g., csv_stripe_export)';
COMMENT ON COLUMN people.import_metadata IS 'Additional metadata from import (JSONB)';
