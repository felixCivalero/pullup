-- 055_profiles_comms_overrides.sql
-- The comms studio's editable layer. Per-host overrides for the automatic
-- send-outs: an optional custom note injected into each message (email), keyed
-- by message id. Template wording stays consistent-by-design; the host controls
-- their note, signature, and brand. Additive + idempotent. (Applied to prod via
-- MCP 2026-06-03.)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS comms_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN profiles.comms_overrides IS
  'Per-message comms studio overrides, keyed by message id: { "<key>": { "note": "..." } }. Note is injected into the email body; WhatsApp templates are Meta-locked so the note applies to email only.';
