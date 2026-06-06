-- 061_instagram_last_inbound.sql
-- The IG "human agent" window (7 days) is measured from the guest's LAST
-- INBOUND message — distinct from the 24h standard window. last_message_at
-- moves on outbound too, and conversation_window_opens_at is cleared once the
-- 24h window expires, so neither survives long enough to gate a 7-day
-- human-agent reply. Track the last inbound timestamp explicitly: only an
-- inbound message updates it, and it is never cleared.
ALTER TABLE instagram_threads
  ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;

-- Best-effort backfill from whatever inbound timestamp we still have.
UPDATE instagram_threads
   SET last_inbound_at = COALESCE(
         conversation_window_opens_at,
         CASE WHEN last_message_direction = 'inbound' THEN last_message_at END)
 WHERE last_inbound_at IS NULL;
