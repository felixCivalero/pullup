-- 117: Per-host UI preferences on the profile row.
--
-- First tenant: `profileSetupDismissed` — the host closed the profile-setup
-- banner in their main room and never wants it back, on any device. A jsonb
-- bag (not a dedicated column) so future one-off dismissals/toggles land
-- here without another migration.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
