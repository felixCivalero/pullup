-- 084_storage_markup_billing.sql
--
-- REVENUE MODEL CORRECTION. The overnight build (mig 083) priced recurring
-- revenue as a per-pull-up fee. That was a misread. PullUp earns on EXACTLY
-- two things: (1) a per-PAID-ticket transaction fee (ticket_fee_bps, kept),
-- and (2) a % MARKUP on top of the creator's OWN Supabase storage tier — the
-- recurring "service on top of the plug" line. Pull-ups and RSVPs are NEVER
-- billed (counted for the host's dashboard only).
--
-- creator_billing_plans is a brand-new, EMPTY table introduced on this same
-- unmerged branch (mig 083, nothing references it in prod), so swapping the
-- dead per-pull-up columns for the storage-markup columns is zero-risk and
-- keeps the schema telling the truth.

begin;

-- Drop the per-pull-up pricing — that revenue mechanism does not exist.
alter table creator_billing_plans drop column if exists pullup_fee_cents;
alter table creator_billing_plans drop column if exists pullup_free_monthly;

-- The recurring line: markup_bps of the creator's monthly Supabase bill.
-- storage_tier_cents = what the creator pays Supabase that month (their own
-- billable project — 0 until the BYO graduation, so the line is dormant now
-- and lights up in BYO stage 2/3). markup_bps default 3000 = 30%.
alter table creator_billing_plans add column if not exists storage_tier_cents integer not null default 0;
alter table creator_billing_plans add column if not exists markup_bps integer not null default 3000;

commit;
