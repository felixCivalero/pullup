-- 121_cancel_at_period_end.sql
--
-- A Portal cancel keeps the Stripe subscription 'active' until the paid
-- period ends — without this bit the Billing pane says "renews 4 Aug" to a
-- host who just cancelled. Webhooks write it; the pane renders "ends 4 Aug".

alter table creator_billing_plans
  add column if not exists cancel_at_period_end boolean not null default false;
