-- 044_profiles_whatsapp_prefs.sql
-- Host-level WhatsApp preferences. `whatsapp_signature` is the line
-- prepended to every host broadcast so guests can tell which host is
-- talking (the sender on their phone shows the shared PullUp number).
-- `whatsapp_enabled` is the per-host master switch — flips OFF means
-- the channel router falls through to email regardless of per-guest
-- opt-in.
--
-- Idempotent: safe to re-run.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS whatsapp_signature TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_enabled   BOOLEAN NOT NULL DEFAULT TRUE;

-- Soft length cap so a signature stays one chat-bubble line. WhatsApp
-- bodies have a 1024-char limit; the signature gets prepended so we
-- reserve generous room for the actual message.
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_whatsapp_signature_length;
ALTER TABLE profiles
  ADD  CONSTRAINT profiles_whatsapp_signature_length
  CHECK (whatsapp_signature IS NULL OR char_length(whatsapp_signature) <= 120);

COMMENT ON COLUMN profiles.whatsapp_signature IS
  'One-line signature prepended to host broadcasts so guests see which host is talking.';
COMMENT ON COLUMN profiles.whatsapp_enabled IS
  'Master per-host switch. OFF = channel router falls through to email regardless of per-guest opt-in.';
