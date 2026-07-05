-- 118_subscription_tier.sql
--
-- The Creator-tier subscription model (2026-07-05):
--   PullUp = 125 SEK/month flat while you host (Spotify-style, cancel anytime)
--          + 3% on paid tickets. NOTHING else — the 30% storage markup is dead:
--          a BYO creator's Supabase bill is between them and Supabase.
--
-- creator_billing_plans becomes the subscription/entitlement record:
--   plan                'early'   — founding hosts, free hosting for life
--                       'creator' — 125 SEK/mo (the default for everyone new)
--                       ('organisation' later: same column, new value + knobs)
--   subscription_status 'none' | 'active' | 'past_due' | 'canceled'
--                       (mirrors Stripe; 'early' plan ignores it entirely)
--
-- Everyone hosting anything TODAY (an event, a community page, a product) is
-- stamped 'early' below — the paywall only ever faces hosts who start after
-- this date. Additive + idempotent; live code is untouched by these columns.

alter table creator_billing_plans
  add column if not exists subscription_status text not null default 'none',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists current_period_end timestamptz,
  add column if not exists subscription_updated_at timestamptz;

-- New hosts are 'creator' (they subscribe); 'starter' vocabulary retires.
alter table creator_billing_plans alter column plan set default 'creator';

-- One ticket-fee number everywhere: 3% (what the live Stripe path already
-- charges — the dormant 2.5% default was the outlier).
alter table creator_billing_plans alter column ticket_fee_bps set default 300;

-- Storage markup is dead: zero the knob. Columns are dropped in a staged
-- follow-up (119) after the code that reads them is deployed.
alter table creator_billing_plans alter column markup_bps set default 0;
update creator_billing_plans set markup_bps = 0 where markup_bps <> 0;

-- Webhook lookups: subscription id -> host row.
create index if not exists idx_cbp_stripe_subscription
  on creator_billing_plans (stripe_subscription_id)
  where stripe_subscription_id is not null;
create index if not exists idx_cbp_stripe_customer
  on creator_billing_plans (stripe_customer_id)
  where stripe_customer_id is not null;

-- ── Founding-host stamping (idempotent — safe to re-run any time before the
-- paywall goes live, in case new hosts appear between apply and deploy) ──────
insert into creator_billing_plans (host_id, plan, ticket_fee_bps, subscription_status, notes)
select h.host_id, 'early', 300, 'none',
       'Founding host — hosting free for life (grandfathered 2026-07-05)'
from (
  select host_id from events where host_id is not null
  union
  select host_id from communities where host_id is not null
  union
  select host_id from room_products where host_id is not null
) h
on conflict (host_id) do update
  set plan = 'early',
      updated_at = now()
  where creator_billing_plans.plan is distinct from 'early';
