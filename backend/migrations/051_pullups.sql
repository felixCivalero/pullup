-- 051_pullups.sql
-- The PullUp core edge: verified physical presence. This is THE load-bearing
-- record of the relational model — every room membership, event interior, and
-- lateral (co-presence) connection keys off a row here. An RSVP is intent; a
-- PullUp is proof. Nothing grants access or an edge without one.
--
-- Verification (see pullupService.js): the host displays a live, ROTATING QR
-- (authenticator-style, ~15s window) derived from a server-held per-event
-- secret. A guest scans the host's live screen in person; a stale screenshot
-- can't register because the window has already turned over. Static QR is
-- forbidden by construction — there is no static code to screenshot.
--
-- Additive + idempotent. Nothing existing changes behaviour.

-- 1. Per-event rotating secret — seed for the live check-in code. Minted
--    lazily on first check-in screen open; never exposed to any client.
ALTER TABLE events ADD COLUMN IF NOT EXISTS qr_rotating_secret TEXT;

-- 2. The PullUp edge (person ↔ event, verified attendance).
CREATE TABLE IF NOT EXISTS pullups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    UUID NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  event_id     UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,

  verified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- How presence was proven:
  --   scan   → guest scanned the host's live rotating QR (self-serve, the norm)
  --   manual → host marked them present (no phone / dead battery). The host is
  --            the trust-root for their own room; faking only pollutes it.
  method       TEXT NOT NULL DEFAULT 'scan'
                 CHECK (method IN ('scan', 'manual')),

  -- For manual check-ins: the host (profile id) who vouched. Null for scans.
  created_by   UUID REFERENCES profiles (id) ON DELETE SET NULL,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One human pulls up to one event at most once. Re-scans are no-ops.
  UNIQUE (person_id, event_id)
);

-- Roster reads ("who pulled up to event E") + membership/co-presence joins.
CREATE INDEX IF NOT EXISTS idx_pullups_event  ON pullups (event_id);
-- A person's own pull-ups ("their pullup_count", "rooms they're in").
CREATE INDEX IF NOT EXISTS idx_pullups_person ON pullups (person_id);
