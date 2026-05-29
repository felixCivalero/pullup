-- 039_magic_link_tokens.sql
-- Short-lived, single-use tokens that double as phone-ownership proof.
-- A magic link is sent to the user's WhatsApp ("tap to finish signing up");
-- when they tap, we redeem the token, mark phone_verified_at, and resume
-- whatever flow they were in (signup, RSVP, VIP, etc.).
--
-- We store SHA-256 hashes only — the plaintext token lives in the
-- magic link URL and is never persisted server-side. Rotation on use:
-- redeemed_at is one-way.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS magic_link_tokens (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash      TEXT        NOT NULL UNIQUE,
  phone_e164      TEXT        NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  intent          TEXT        NOT NULL,
  person_id       UUID        REFERENCES people(id)   ON DELETE SET NULL,
  profile_id      UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  payload         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  expires_at      TIMESTAMPTZ NOT NULL,
  redeemed_at     TIMESTAMPTZ,
  redeemed_ip     TEXT,
  redeemed_user_agent TEXT,
  send_channel    TEXT        NOT NULL DEFAULT 'whatsapp'
                              CHECK (send_channel IN ('whatsapp','sms','email')),
  send_attempts   INT         NOT NULL DEFAULT 0,
  last_sent_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_ip      TEXT,
  created_user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_phone
  ON magic_link_tokens (phone_e164);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_intent
  ON magic_link_tokens (intent);
CREATE INDEX IF NOT EXISTS idx_magic_link_tokens_unredeemed
  ON magic_link_tokens (expires_at)
  WHERE redeemed_at IS NULL;

ALTER TABLE magic_link_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE magic_link_tokens IS
  'Short-lived tokens for phone verification + flow resumption. SHA-256 hashes only; raw token lives in the URL we WhatsApp to the user.';
COMMENT ON COLUMN magic_link_tokens.intent IS
  'verify_phone / host_signup / rsvp_verify / vip_invite / login. Drives the post-redeem handler.';
COMMENT ON COLUMN magic_link_tokens.payload IS
  'Flow-state carried across the round-trip: redirect_url, signup fields, event_id, etc.';
