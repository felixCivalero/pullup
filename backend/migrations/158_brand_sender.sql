-- 158: a brand's own sender. Mail from a brand goes from no-reply@pullup.se
-- under the brand's name, unless the brand has its own address on a domain
-- it has verified with our mail provider (Resend, lib/senders.js): then it
-- goes from that address. reply_to: where guests' replies land (else the
-- person who sent it).
ALTER TABLE brands ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS sender_domain_id TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS sender_verified_at TIMESTAMPTZ;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS reply_to TEXT;
