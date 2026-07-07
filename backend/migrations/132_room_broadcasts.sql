-- 132_room_broadcasts.sql
--
-- Scalable host broadcasts — the "send this event to your community" step (and
-- the Room's bulk send). The old path fanned out N recipients INSIDE one HTTP
-- request: each person meant an inline WhatsApp Meta-API call + several DB
-- writes, run sequentially. Fine for tens; a guaranteed timeout for hundreds.
--
-- Now the request only ENQUEUES and returns immediately: one durable,
-- idempotent row per recipient. A background drainer in the API process (the
-- same pattern event reminders already use) claims batches with FOR UPDATE
-- SKIP LOCKED and delivers each via sendRoomMessage — off the request thread,
-- resumable across restarts, deduped by a stable clientId so a crash mid-send
-- never double-sends.

create extension if not exists pgcrypto;

-- The job header: what to send, to how many.
-- (RLS is enabled at the bottom — these are internal, service-role-only tables.)
create table if not exists room_broadcasts (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null,
  event_id    uuid,
  text        text,
  subject     text,
  attachments jsonb not null default '[]'::jsonb,
  total       int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_room_broadcasts_host
  on room_broadcasts (host_id, created_at desc);

-- One row per recipient — the durable unit of work + the progress ledger.
create table if not exists room_broadcast_recipients (
  id           uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references room_broadcasts(id) on delete cascade,
  host_id      uuid not null,
  person_id    uuid not null,
  status       text not null default 'queued', -- queued | sending | sent | failed | no_email
  channel      text,                            -- resolved rail once sent (whatsapp|email|instagram)
  attempts     int  not null default 0,
  send_after   timestamptz not null default now(),
  locked_at    timestamptz,
  locked_by    text,
  last_error   text,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  unique (broadcast_id, person_id)              -- idempotent enqueue; a re-POST is a no-op
);
create index if not exists idx_rbr_claim
  on room_broadcast_recipients (send_after)
  where status in ('queued', 'retrying');
create index if not exists idx_rbr_broadcast
  on room_broadcast_recipients (broadcast_id);

-- Batch claim, mirroring claim_email_outbox_batch: first recover rows stuck in
-- 'sending' > 5 min (a crashed drainer), then flip a batch queued|retrying ->
-- sending, oldest first, honoring send_after, skipping already-locked rows so
-- concurrent drainers never collide.
create or replace function claim_broadcast_recipients(p_worker text, p_batch int)
returns setof room_broadcast_recipients
language plpgsql
as $$
begin
  update room_broadcast_recipients
     set status = 'queued', updated_at = now()
   where status = 'sending'
     and locked_at < now() - interval '5 minutes';

  return query
  with claimed as (
    select id
      from room_broadcast_recipients
     where status in ('queued', 'retrying')
       and send_after <= now()
     order by created_at
     limit p_batch
     for update skip locked
  )
  update room_broadcast_recipients r
     set status = 'sending', locked_at = now(), locked_by = p_worker,
         attempts = r.attempts + 1, updated_at = now()
    from claimed
   where r.id = claimed.id
  returning r.*;
end;
$$;

-- Progress tally in ONE round trip — a grouped aggregate, so it never trips the
-- 1000-row fetch cap the way selecting every recipient row would for a large
-- broadcast. Ownership is checked in the caller before this runs.
create or replace function broadcast_progress(p_id uuid)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total',   coalesce((select total from room_broadcasts where id = p_id), 0),
    'sent',    count(*) filter (where status = 'sent'),
    'failed',  count(*) filter (where status = 'failed'),
    'noEmail', count(*) filter (where status = 'no_email'),
    'pending', count(*) filter (where status in ('queued', 'sending', 'retrying')),
    'wa',      count(*) filter (where status = 'sent' and channel = 'whatsapp'),
    'em',      count(*) filter (where status = 'sent' and channel = 'email'),
    'ig',      count(*) filter (where status = 'sent' and channel = 'instagram')
  )
  from room_broadcast_recipients
  where broadcast_id = p_id;
$$;

-- Internal queue tables: only the service-role backend touches them. RLS on with
-- NO policies = deny-all to the anon/authenticated key (service role bypasses
-- RLS), so host_id / person_id can never leak through the public API.
alter table room_broadcasts enable row level security;
alter table room_broadcast_recipients enable row level security;
