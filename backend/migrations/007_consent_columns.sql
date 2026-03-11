-- 007_consent_columns.sql
-- Add consent and compliance tracking columns

-- newsletter_subscriptions: track explicit consent
ALTER TABLE newsletter_subscriptions
  ADD COLUMN IF NOT EXISTS consent_given boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS consent_at timestamptz;

-- people: marketing consent + do-not-contact flag
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS marketing_consent boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS do_not_contact boolean DEFAULT false;

-- rsvps: marketing opt-in at RSVP time
ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS marketing_opt_in boolean DEFAULT false;

-- email_outbox: legal basis for sending
ALTER TABLE email_outbox
  ADD COLUMN IF NOT EXISTS legal_basis text;
