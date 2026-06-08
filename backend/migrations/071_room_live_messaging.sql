-- 071_room_live_messaging.sql
--
-- Makes the Room chat feel INSTANT across every channel.
--
-- Two halves:
--   1. Realtime — the host's open browser can subscribe to their own
--      person_events over Supabase Realtime (same mechanism as host_actions),
--      so inbound replies AND outbound delivery-status upgrades land in the
--      thread the instant the webhook writes them. No more polling lag.
--   2. Status write-back — outbound messages carry a delivery `status` in
--      metadata (sent → delivered → read, or failed). The channel webhooks
--      (WhatsApp message-status, IG read receipt, email delivery + open pixel)
--      bump that status THROUGH the spine via the functions below, which makes
--      Realtime fire an UPDATE the frontend animates into a tick.
--
-- Nothing here mutates message history destructively — only the per-row
-- delivery `status`/`status_at` on OUR outbound bubbles is upgraded, monotonic.

-- ── 1. Realtime ─────────────────────────────────────────────────────────────

-- The backend talks to Postgres with the service-role key, which bypasses RLS,
-- so enabling RLS here changes nothing for the app's own reads/writes. It only
-- gates what an authenticated *browser* client may SELECT — and Realtime
-- authorizes row delivery against exactly that SELECT policy. A host may see
-- only their own timeline.
alter table person_events enable row level security;

drop policy if exists person_events_host_select on person_events;
create policy person_events_host_select
  on person_events for select to authenticated
  using (host_id = auth.uid());

-- Realtime filters UPDATE/DELETE events by the columns in the replica identity.
-- We filter by host_id (not the PK), and we care about UPDATEs (status ticks),
-- so the whole row must be in the replica identity.
alter table person_events replica identity full;

-- Add to the realtime publication (idempotent — safe to re-run).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'person_events'
  ) then
    execute 'alter publication supabase_realtime add table public.person_events';
  end if;
end $$;

-- ── 2. Status write-back ────────────────────────────────────────────────────

-- Expression indexes so a webhook's "find the bubble for this provider message"
-- lookup stays a point-read instead of a timeline scan.
create index if not exists person_events_provider_mid_idx
  on person_events ((metadata->>'provider_mid')) where direction = 'out';
create index if not exists person_events_tracking_id_idx
  on person_events ((metadata->>'tracking_id')) where direction = 'out';

-- sent → delivered → read is monotonic; a late/duplicate webhook never
-- downgrades a tick. `failed` applies only while the message hasn't already
-- been delivered or read (a failure after delivery is noise).
create or replace function bump_room_message_status(
  p_key text, p_val text, p_status text, p_at timestamptz default now()
) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  new_rank int := case p_status
    when 'sending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
begin
  if p_val is null or p_status is null then return; end if;
  for r in
    select id, coalesce(metadata->>'status', 'sent') as st
    from person_events
    where direction = 'out' and metadata->>p_key = p_val
  loop
    if p_status = 'failed' then
      if r.st not in ('delivered', 'read') then
        update person_events set metadata =
          jsonb_set(jsonb_set(coalesce(metadata, '{}'::jsonb), '{status}', to_jsonb('failed'::text)),
                    '{status_at}', to_jsonb(p_at))
        where id = r.id;
      end if;
    elsif new_rank > (case r.st
        when 'sending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end) then
      update person_events set metadata =
        jsonb_set(jsonb_set(coalesce(metadata, '{}'::jsonb), '{status}', to_jsonb(p_status)),
                  '{status_at}', to_jsonb(p_at))
      where id = r.id;
    end if;
  end loop;
end; $$;

-- Instagram delivers read as a per-thread watermark, not per-message, so the
-- IG webhook bumps every still-unread outbound IG bubble for that person/host.
create or replace function bump_room_message_status_person(
  p_person uuid, p_host uuid, p_channel text, p_status text, p_at timestamptz default now()
) returns void
language plpgsql security definer set search_path = public as $$
declare
  new_rank int := case p_status
    when 'sending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end;
begin
  update person_events set metadata =
    jsonb_set(jsonb_set(coalesce(metadata, '{}'::jsonb), '{status}', to_jsonb(p_status)),
              '{status_at}', to_jsonb(p_at))
  where direction = 'out' and person_id = p_person
    and (p_host is null or host_id = p_host)
    and channel = p_channel
    and (case coalesce(metadata->>'status', 'sent')
      when 'sending' then 0 when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 else 0 end) < new_rank;
end; $$;

grant execute on function bump_room_message_status(text, text, text, timestamptz) to service_role;
grant execute on function bump_room_message_status_person(uuid, uuid, text, text, timestamptz) to service_role;
