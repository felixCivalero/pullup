-- Stream host_actions inserts to connected browsers via Supabase Realtime.
-- RLS (host_actions_select_own) already restricts SELECT to the row's own
-- host_id, so realtime only delivers a row to the browser whose session
-- belongs to that host.
--
-- Idempotent — ALTER PUBLICATION ADD TABLE is a no-op once added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'host_actions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE host_actions;
  END IF;
END $$;
