-- 156: the sign-up form is back (lib/eventForm.js): phone, Instagram, guests
-- brought along and the organiser's own questions, in the old app's columns.
-- The old app collected phone and Instagram by default; events made on the
-- slim platform (since 2026-10-19) never showed them, so they stay off until
-- the organiser turns them on, and new events start with only name and email.
ALTER TABLE events ALTER COLUMN collect_phone SET DEFAULT false;
ALTER TABLE events ALTER COLUMN collect_instagram SET DEFAULT false;
UPDATE events SET collect_phone = false, collect_instagram = false, require_phone = false, require_instagram = false
  WHERE created_at >= '2026-10-19' AND (collect_phone OR collect_instagram OR require_phone OR require_instagram);
