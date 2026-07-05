-- 122_founding_flag.sql
--
-- An Early member may CHOOSE to pay (upgrade to Creator/Agency — support, or
-- agency features later). Buying a tier flips `plan` to what they bought, so
-- 'early' alone can no longer carry the founding gift. `founding` is the
-- permanent marker: set once at grandfathering, never cleared. Entitlements
-- treat founding as hosting-forever, whatever the subscription does — cancel
-- and `plan` snaps back to 'early', nothing lost.

alter table creator_billing_plans
  add column if not exists founding boolean not null default false;

update creator_billing_plans set founding = true where plan = 'early';
