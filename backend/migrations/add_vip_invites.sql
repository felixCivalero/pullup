-- Migration: Add VIP invites table
-- Date: 2026-03-02
-- Description: Adds vip_invites table to support per-guest VIP links with
--              custom guest list limits and optional free entry for paid events.

CREATE TABLE IF NOT EXISTS vip_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email TEXT NOT NULL,

  -- Maximum total guests this VIP invite can cover (including the VIP themselves).
  max_guests INTEGER NOT NULL DEFAULT 1,

  -- If true and the event is paid, this invite allows the holder to RSVP without payment.
  free_entry BOOLEAN NOT NULL DEFAULT FALSE,

  -- Optional percentage discount (0–100) for paid events.
  discount_percent NUMERIC,

  -- Single-use tracking
  used_at TIMESTAMPTZ,
  used_rsvp_id UUID REFERENCES rsvps(id) ON DELETE SET NULL,

  -- Token + lifecycle tracking
  token TEXT,
  expires_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Basic indexes for common queries
CREATE INDEX IF NOT EXISTS idx_vip_invites_event_id
  ON vip_invites(event_id);

CREATE INDEX IF NOT EXISTS idx_vip_invites_email
  ON vip_invites(email);

CREATE INDEX IF NOT EXISTS idx_vip_invites_event_email
  ON vip_invites(event_id, email);

CREATE INDEX IF NOT EXISTS idx_vip_invites_unused
  ON vip_invites(event_id, used_at)
  WHERE used_at IS NULL;

