-- Migration: add_recipient_to_email_events.sql
-- Purpose: Ensure email_events has a recipient column for storing the resolved recipient.

BEGIN;

ALTER TABLE IF EXISTS email_events
  ADD COLUMN IF NOT EXISTS recipient TEXT;

COMMIT;

