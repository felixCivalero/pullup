-- Migration: add_event_host_invitations.sql
-- Description: Pending co-host invitations by email (user may not have account yet).
--              When they sign up, we create event_hosts from these rows.

CREATE TABLE IF NOT EXISTS event_host_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  invited_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  UNIQUE(event_id, email)
);

CREATE INDEX IF NOT EXISTS idx_event_host_invitations_event_id ON event_host_invitations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_host_invitations_email ON event_host_invitations(email);
CREATE INDEX IF NOT EXISTS idx_event_host_invitations_status ON event_host_invitations(status);

ALTER TABLE event_host_invitations ENABLE ROW LEVEL SECURITY;

-- Hosts of the event can view invitations for that event
CREATE POLICY "Hosts can view event invitations"
  ON event_host_invitations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_host_invitations.event_id AND e.host_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM event_hosts eh
      WHERE eh.event_id = event_host_invitations.event_id AND eh.user_id = auth.uid()
    )
  );

-- Only owner/admin can insert (enforced in app; RLS allows event owner)
CREATE POLICY "Event owners can insert invitations"
  ON event_host_invitations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM event_hosts eh
      WHERE eh.event_id = event_host_invitations.event_id
        AND eh.user_id = auth.uid()
        AND eh.role IN ('owner', 'admin')
    )
    OR
    EXISTS (
      SELECT 1 FROM events e
      WHERE e.id = event_host_invitations.event_id AND e.host_id = auth.uid()
    )
  );

-- Service role / backend will update status when claiming (accepted)
CREATE POLICY "Event owners can update invitations"
  ON event_host_invitations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM event_hosts eh
      WHERE eh.event_id = event_host_invitations.event_id AND eh.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM events e WHERE e.id = event_host_invitations.event_id AND e.host_id = auth.uid())
  );

-- Owner/admin can delete (revoke) pending invitations
CREATE POLICY "Event owners can delete invitations"
  ON event_host_invitations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM event_hosts eh
      WHERE eh.event_id = event_host_invitations.event_id
        AND eh.user_id = auth.uid()
        AND eh.role IN ('owner', 'admin')
    )
    OR EXISTS (SELECT 1 FROM events e WHERE e.id = event_host_invitations.event_id AND e.host_id = auth.uid())
  );
