-- 150: a send belongs to the brand it went out in (lib/brands.js), so each
-- brand's "earlier sends" are its own. Older sends have none: they count as
-- the account's first brand (repos/hostEvents.js listSends).
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_email_outbox_host_brand ON email_outbox(host_id, brand_id) WHERE category = 'event_broadcast';
