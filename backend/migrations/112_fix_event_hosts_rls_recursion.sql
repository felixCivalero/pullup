-- 112_fix_event_hosts_rls_recursion.sql
-- 2026-06-19 Fix infinite recursion (42P17) in event_hosts RLS.
--
-- The event_hosts policies referenced event_hosts inside their own subqueries;
-- evaluating a policy re-queried the table and re-triggered the policy. Anon
-- SELECT on `events` 500'd because the "events they host" policy nests a
-- subquery into event_hosts. Fix: SECURITY DEFINER helpers read event_hosts
-- WITHOUT RLS, breaking the self-reference. Helpers reveal only the CURRENT
-- caller's own membership (auth.uid()) -> no data exposure.
--
-- ALREADY APPLIED TO PROD via Supabase MCP (migration
-- "fix_event_hosts_rls_recursion"). Idempotent: safe to re-run.

create or replace function public.is_event_host(p_event_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.event_hosts
    where event_id = p_event_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_event_owner(p_event_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.event_hosts
    where event_id = p_event_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- event_hosts: replace self-referencing policies with helper-based ones
drop policy if exists "Users can view own event host records" on public.event_hosts;
create policy "Users can view own event host records" on public.event_hosts
  for select using (user_id = (select auth.uid()) or public.is_event_host(event_id));

drop policy if exists "Owners can add event hosts" on public.event_hosts;
create policy "Owners can add event hosts" on public.event_hosts
  for insert with check (public.is_event_owner(event_id));

drop policy if exists "Owners can update event hosts" on public.event_hosts;
create policy "Owners can update event hosts" on public.event_hosts
  for update using (public.is_event_owner(event_id)) with check (public.is_event_owner(event_id));

drop policy if exists "Owners can delete event hosts" on public.event_hosts;
create policy "Owners can delete event hosts" on public.event_hosts
  for delete using (public.is_event_owner(event_id));

-- events: same self-reference via subquery; route through the helper too
drop policy if exists "Users can view events they host (legacy or join)" on public.events;
create policy "Users can view events they host (legacy or join)" on public.events
  for select using (host_id = (select auth.uid()) or public.is_event_host(id));

drop policy if exists "Users can update events they host (legacy or join)" on public.events;
create policy "Users can update events they host (legacy or join)" on public.events
  for update using (host_id = (select auth.uid()) or public.is_event_host(id))
  with check (host_id = (select auth.uid()) or public.is_event_host(id));

drop policy if exists "Users can delete events they host (legacy or join)" on public.events;
create policy "Users can delete events they host (legacy or join)" on public.events
  for delete using (host_id = (select auth.uid()) or public.is_event_host(id));
