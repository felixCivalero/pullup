-- Migration: add_event_hosts_table.sql
-- Date: 2025
-- Description: Adds event_hosts join table to support multiple arrangers per event
--              and updates RLS to work with both events.host_id and event_hosts.

-- Create event_hosts join table for many-to-many user ↔ event ownership
CREATE TABLE IF NOT EXISTS event_hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'co_host', -- 'owner' | 'co_host' | 'editor' | 'viewer'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_event_hosts_event_id ON event_hosts(event_id);
CREATE INDEX IF NOT EXISTS idx_event_hosts_user_id ON event_hosts(user_id);
CREATE INDEX IF NOT EXISTS idx_event_hosts_user_event ON event_hosts(user_id, event_id);

-- Backfill existing host relationships into event_hosts as 'owner'
INSERT INTO event_hosts (event_id, user_id, role)
SELECT id AS event_id, host_id AS user_id, 'owner' AS role
FROM events
WHERE host_id IS NOT NULL
ON CONFLICT (event_id, user_id) DO NOTHING;

-- Enable RLS on event_hosts
ALTER TABLE event_hosts ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view host records for events they are part of
CREATE POLICY "Users can view own event host records"
  ON event_hosts FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM event_hosts eh2
      WHERE eh2.event_id = event_hosts.event_id
      AND eh2.user_id = auth.uid()
    )
  );

-- RLS: Users can add co-hosts to events they own
CREATE POLICY "Owners can add event hosts"
  ON event_hosts FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_hosts eh2
      WHERE eh2.event_id = event_hosts.event_id
      AND eh2.user_id = auth.uid()
      AND eh2.role = 'owner'
    )
  );

-- RLS: Owners can update roles for their events
CREATE POLICY "Owners can update event hosts"
  ON event_hosts FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM event_hosts eh2
      WHERE eh2.event_id = event_hosts.event_id
      AND eh2.user_id = auth.uid()
      AND eh2.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_hosts eh2
      WHERE eh2.event_id = event_hosts.event_id
      AND eh2.user_id = auth.uid()
      AND eh2.role = 'owner'
    )
  );

-- RLS: Owners can remove event hosts
CREATE POLICY "Owners can delete event hosts"
  ON event_hosts FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM event_hosts eh2
      WHERE eh2.event_id = event_hosts.event_id
      AND eh2.user_id = auth.uid()
      AND eh2.role = 'owner'
    )
  );

-- NOTE: Existing RLS policies on events should be updated separately (if needed)
-- to also allow access via event_hosts in addition to events.host_id.

