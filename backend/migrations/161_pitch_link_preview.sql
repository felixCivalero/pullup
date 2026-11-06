-- 161: what a shared pitch link shows in WhatsApp, Messages and other link
-- previews (they don't run JavaScript, so the server writes the card). Set
-- from the pitch's own share text when the link is made (pitch/index.js).
ALTER TABLE pitch_links ADD COLUMN IF NOT EXISTS og_title TEXT;
ALTER TABLE pitch_links ADD COLUMN IF NOT EXISTS og_description TEXT;
ALTER TABLE pitch_links ADD COLUMN IF NOT EXISTS og_image TEXT;
