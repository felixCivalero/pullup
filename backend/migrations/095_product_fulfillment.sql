-- 095_product_fulfillment.sql
-- Digital-product page kind: delivery config + a PRIVATE bucket for paid files.
--
-- `events.fulfillment` holds the four delivery forms authored in the price part:
--   { download:{enabled,path,filename,mime,sizeBytes},
--     secret:{enabled,kind:'link'|'code',value},
--     unlock:{enabled,title,body},
--     external:{enabled,url} }
-- SECRETS (download.path, secret.value, unlock.body) NEVER reach the public page
-- payload — the public /events/:slug route strips them for non-hosts and the
-- gated delivery endpoint serves them only after payment settles.

ALTER TABLE events ADD COLUMN IF NOT EXISTS fulfillment jsonb;

COMMENT ON COLUMN events.fulfillment IS
  'Digital-product delivery config (download/secret/unlock/external). Host-only; secrets stripped from public payloads, served only post-purchase by the gated delivery endpoint.';

-- Private bucket for paid downloads: NOT public, so the only way to read a file
-- is a time-boxed signed URL minted after the gate confirms paymentStatus=paid.
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-downloads', 'product-downloads', false)
ON CONFLICT (id) DO NOTHING;
