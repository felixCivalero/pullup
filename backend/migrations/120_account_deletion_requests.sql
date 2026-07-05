-- 120_account_deletion_requests.sql
--
-- The Settings "Delete my account" button has promised "erased within 30 days"
-- since the account section shipped — but POST /me/deletion-request had no
-- backend. This is the durable half: one row per request, worked concierge
-- (the deletion machinery itself stays manual at today's scale). The route
-- also cancels any active Creator subscription immediately — nobody keeps
-- paying for an account they've asked us to erase.

create table if not exists account_deletion_requests (
  user_id      uuid primary key,
  requested_at timestamptz not null default now(),
  status       text not null default 'pending', -- pending | done | withdrawn
  notes        text
);

alter table account_deletion_requests enable row level security;
-- service-role only (no policies): requests are written and read by the
-- backend, never directly by clients.
