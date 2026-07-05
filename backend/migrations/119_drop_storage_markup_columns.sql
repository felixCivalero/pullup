-- 119_drop_storage_markup_columns.sql
--
-- ⚠️ STAGED — run ONLY AFTER the subscription-tier code is deployed (the code
-- that stops reading/writing these columns). Same pattern as 105 (brand drop).
--
-- The 30% storage markup is gone from the business model: a BYO creator pays
-- Supabase directly, PullUp adds nothing. These columns are the last trace.

alter table creator_billing_plans drop column if exists markup_bps;
alter table creator_billing_plans drop column if exists storage_tier_cents;
