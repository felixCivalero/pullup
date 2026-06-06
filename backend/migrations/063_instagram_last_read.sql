-- 063_instagram_last_read.sql
-- Read-receipt watermark: when the guest reads our outbound DMs, IG sends a
-- `read` event. We stamp it here (a mutable thread header, like the window
-- fields) rather than mutating the append-only person_events timeline. Each
-- outbound bubble's status is then DERIVED: read if it predates last_read_at,
-- else sent. Foundation for WhatsApp-style sent → read ticks (and a future
-- realtime/socket push).
ALTER TABLE instagram_threads ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;
