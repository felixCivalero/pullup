-- Migration: add_email_events_unique_constraint.sql
-- Purpose: Ensure email_events is idempotent on SES event replays by
-- enforcing uniqueness on (provider, provider_message_id, event_type).

BEGIN;

ALTER TABLE IF EXISTS email_events
  ADD CONSTRAINT IF NOT EXISTS email_events_provider_message_event_unique
  UNIQUE (provider, provider_message_id, event_type);

COMMIT;

