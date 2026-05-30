-- 045_instagram_connections.sql
-- Instagram-native channel foundation (Phase 0 + Phase 1).
--
-- Two additive pieces, both safe on a live DB (new table + nullable
-- columns; nothing existing changes behaviour):
--
--   1. instagram_connections — per-HOST link to a connected IG account.
--      This is the multi-tenant seam: unlike the single shared WhatsApp
--      WABA, each host connects THEIR OWN Instagram, so inbound webhook
--      events route to the owning host by ig_user_id (IGSID).
--
--   2. people.ig_* + acquisition_* — promote the existing free-text
--      `instagram` handle into a real IG identity (IGSID) and record HOW
--      a person entered. The acquisition channel is the entire input to
--      the messaging router's IG tier:
--        ig_comment  → IG conversation is/was open → reach via IG (24h)
--        ig_story_link / direct → no IG window → WhatsApp / email
--
-- Inert until a Meta token is provisioned + a host runs the connect
-- flow. Idempotent: safe to re-run.

-- 1. instagram_connections (per-host) ----------------------------------
CREATE TABLE IF NOT EXISTS instagram_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_profile_id      UUID NOT NULL REFERENCES profiles (id) ON DELETE CASCADE,

  -- Instagram-scoped identity (from "Instagram API with Instagram Login").
  ig_user_id           TEXT NOT NULL,            -- IGSID of the connected business/creator account
  ig_username          TEXT,                     -- @handle, for display
  page_id              TEXT,                     -- nullable: only set on the legacy FB-Login path

  -- OAuth material. access_token is sensitive — encrypted at rest at the
  -- app layer before insert (see instagram/repos). Never select into logs.
  access_token         TEXT,
  token_expires_at     TIMESTAMPTZ,
  scopes               TEXT[],                   -- granted permission scopes

  status               TEXT NOT NULL DEFAULT 'connected'
                         CHECK (status IN ('connected', 'expired', 'revoked', 'error')),
  connected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One live connection per IG account; one host typically connects one IG.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_instagram_connections_ig_user
  ON instagram_connections (ig_user_id);
CREATE INDEX IF NOT EXISTS idx_instagram_connections_host
  ON instagram_connections (host_profile_id);

COMMENT ON TABLE instagram_connections IS
  'Per-host link to a connected Instagram account. The multi-tenant seam: inbound IG webhook events route to the owning host by ig_user_id.';
COMMENT ON COLUMN instagram_connections.access_token IS
  'Long-lived IG access token, encrypted at rest at the app layer. Refreshed before token_expires_at. Never log.';

-- 2. people: IG identity + acquisition provenance ----------------------
ALTER TABLE people ADD COLUMN IF NOT EXISTS ig_user_id          TEXT;  -- IGSID; the existing `instagram` stays as display handle
ALTER TABLE people ADD COLUMN IF NOT EXISTS acquisition_channel TEXT;
ALTER TABLE people ADD COLUMN IF NOT EXISTS acquisition_ref     TEXT;  -- post/comment/story id that drove them in

-- Constrain acquisition_channel to the known entry paths. NULL allowed
-- (legacy rows + anyone we didn't stamp).
ALTER TABLE people
  DROP CONSTRAINT IF EXISTS people_acquisition_channel_enum;
ALTER TABLE people
  ADD  CONSTRAINT people_acquisition_channel_enum
  CHECK (acquisition_channel IS NULL OR acquisition_channel IN
    ('ig_comment', 'ig_dm', 'ig_story_link', 'direct', 'whatsapp', 'email'));

CREATE INDEX IF NOT EXISTS idx_people_ig_user_id
  ON people (ig_user_id)
  WHERE ig_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_acquisition_channel
  ON people (acquisition_channel)
  WHERE acquisition_channel IS NOT NULL;

COMMENT ON COLUMN people.ig_user_id IS
  'Instagram-scoped user id (IGSID). Real identity for IG messaging; the freeform `instagram` column is display-only.';
COMMENT ON COLUMN people.acquisition_channel IS
  'How this person entered. Drives the messaging router IG tier: ig_comment opens an IG window; story/direct route to WhatsApp/email.';
COMMENT ON COLUMN people.acquisition_ref IS
  'The IG object (post/comment/story id) that drove the signup — for attribution + automation context.';
