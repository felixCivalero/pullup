-- 083_transaction_layer.sql
--
-- THE TRANSACTION LAYER — the substrate for "PullUp charges on motion, never
-- on storage." Three ideas land together, all additive, all dormant until the
-- backend flags flip (PAYMENTS_V2_ENABLED / BILLING_METERING_ENABLED):
--
--   payments (extended)    — the one payment row goes rail-agnostic. provider
--                            says which rail moved the money (stripe | swish |
--                            mpesa | mock), provider_ref is that rail's id for
--                            the charge. Existing rows keep provider='stripe'
--                            and their stripe_* columns; nothing moves.
--   transaction_ledger     — append-only metered motions. Every pull-up, RSVP
--                            and ticket sale lands here exactly once
--                            (dedupe_key), with the fee PullUp earned on that
--                            motion. This IS the business model as a table:
--                            fee = f(motion), never f(stored data).
--   creator_billing_plans  — per-host fee knobs (ticket bps, per-pull-up cents,
--                            monthly free tier). No row = the starter defaults;
--                            a row is only written when a host upgrades or a
--                            concierge deal is cut.
--   payment_events         — webhook audit: every callback a rail sends us,
--                            verbatim, deduped. Settlement reads payments;
--                            this table is the black box recorder.
--   payout_accounts        — where the host's money lands per rail (Swish
--                            number / M-Pesa till / Stripe acct). One row per
--                            (host, rail).
--
-- ADDITIVE + non-destructive: no existing row is touched, no live read path
-- changes. Live prod behaves identically until the env flags flip.

begin;

-- ---------------------------------------------------------------------------
-- 1. payments → rail-agnostic
-- ---------------------------------------------------------------------------

alter table payments add column if not exists provider text not null default 'stripe';
alter table payments add column if not exists provider_ref text;

-- One charge per (rail, rail-id). Partial: legacy rows carry NULL provider_ref.
create unique index if not exists payments_provider_ref_idx
  on payments (provider, provider_ref)
  where provider_ref is not null;

-- ---------------------------------------------------------------------------
-- 2. The metered-motion ledger
-- ---------------------------------------------------------------------------

create table if not exists transaction_ledger (
  id           uuid primary key default gen_random_uuid(),
  host_id      uuid,
  event_id     uuid,
  person_id    uuid,
  rsvp_id      uuid,
  payment_id   uuid,
  motion       text not null check (motion in ('pullup', 'rsvp', 'ticket_sale')),
  quantity     integer not null default 1,
  -- gross money moved by this motion (0 for free motions like a pull-up)
  amount_cents integer not null default 0,
  -- PullUp's fee on this motion — the company's revenue line, row by row
  fee_cents    integer not null default 0,
  currency     text not null default 'usd',
  -- writer-supplied idempotency key: 'pullup:<eventId>:<personId>',
  -- 'rsvp:<rsvpId>', 'ticket:<paymentId>' — a replay is a true no-op
  dedupe_key   text not null unique,
  metadata     jsonb default '{}'::jsonb,
  occurred_at  timestamptz not null default now()
);

create index if not exists transaction_ledger_host_time_idx
  on transaction_ledger (host_id, occurred_at);
create index if not exists transaction_ledger_motion_time_idx
  on transaction_ledger (motion, occurred_at);

-- ---------------------------------------------------------------------------
-- 3. Per-host fee knobs (no row = starter defaults in code)
-- ---------------------------------------------------------------------------

create table if not exists creator_billing_plans (
  host_id             uuid primary key,
  plan                text not null default 'starter',  -- starter | working | promoter | concierge
  ticket_fee_bps      integer not null default 250,     -- 2.5% of ticket motion
  pullup_fee_cents    integer not null default 5,       -- $0.05 per pull-up past the free tier
  pullup_free_monthly integer not null default 500,     -- free tier: motions/month before metering bills
  fee_currency        text not null default 'usd',
  care_plan           text,                             -- null | 'care49' | 'care99'
  byo_supabase        boolean not null default false,   -- stage-2 ownership graduation
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. Webhook audit (the black box recorder)
-- ---------------------------------------------------------------------------

create table if not exists payment_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  provider_ref text,
  event_type   text,
  -- '<provider>:<provider_ref>:<event_type>' — a retried callback lands once
  dedupe_key   text unique,
  payload      jsonb,
  created_at   timestamptz not null default now()
);

create index if not exists payment_events_provider_ref_idx
  on payment_events (provider, provider_ref);

-- ---------------------------------------------------------------------------
-- 5. Where the host's money lands, per rail
-- ---------------------------------------------------------------------------

create table if not exists payout_accounts (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null,
  rail       text not null check (rail in ('swish', 'mpesa', 'stripe')),
  -- Swish number / M-Pesa till or paybill / Stripe connected acct id
  identifier text not null,
  status     text not null default 'active',  -- active | pending | disabled
  metadata   jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (host_id, rail)
);

commit;
