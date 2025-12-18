-- Migration: add_events_rls_from_event_hosts.sql
-- Date: 2025
-- Description:
--   Extends Row Level Security (RLS) on the events table so that access
--   is granted to:
--     - the legacy owner (events.host_id = auth.uid()), and
--     - any user listed in event_hosts (owner or co-host).
--
--   Policies are additive in Postgres / Supabase, so this migration only
--   adds new policies and does not depend on existing ones. It is safe
--   to run even if other policies already exist on events.

-- Ensure RLS is enabled on events
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view events they host (legacy or join)" ON events;
DROP POLICY IF EXISTS "Users can update events they host (legacy or join)" ON events;
DROP POLICY IF EXISTS "Users can delete events they host (legacy or join)" ON events;

-- Allow users to SELECT events where they are host (owner or co-host)
CREATE POLICY "Users can view events they host (legacy or join)"
  ON events
  FOR SELECT
  USING (
    -- Legacy: direct owner via events.host_id
    host_id = auth.uid()
    OR
    -- New model: any host/co-host via event_hosts
    EXISTS (
      SELECT 1
      FROM event_hosts
      WHERE event_hosts.event_id = events.id
        AND event_hosts.user_id = auth.uid()
    )
  );

-- Allow users to UPDATE events where they are host (owner or co-host)
CREATE POLICY "Users can update events they host (legacy or join)"
  ON events
  FOR UPDATE
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM event_hosts
      WHERE event_hosts.event_id = events.id
        AND event_hosts.user_id = auth.uid()
    )
  )
  WITH CHECK (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM event_hosts
      WHERE event_hosts.event_id = events.id
        AND event_hosts.user_id = auth.uid()
    )
  );

-- Allow users to DELETE events where they are host (owner or co-host)
CREATE POLICY "Users can delete events they host (legacy or join)"
  ON events
  FOR DELETE
  USING (
    host_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM event_hosts
      WHERE event_hosts.event_id = events.id
        AND event_hosts.user_id = auth.uid()
    )
  );

