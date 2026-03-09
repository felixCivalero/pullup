-- Migration: Fix stale sending recovery in claim_email_outbox_batch
-- Problem: If the outbox worker crashes mid-batch, rows stuck in 'sending'
-- status are never retried because the claim function only picks up
-- 'queued' and 'retrying' rows.
-- Fix: Recover rows stuck in 'sending' for more than 5 minutes before claiming.

CREATE OR REPLACE FUNCTION claim_email_outbox_batch(p_worker_id text, p_batch_size int)
RETURNS SETOF email_outbox
LANGUAGE plpgsql
AS $$
BEGIN
  -- First, recover rows stuck in 'sending' for more than 5 minutes (worker crashed)
  UPDATE email_outbox
  SET status = 'queued',
      locked_at = NULL,
      locked_by = NULL,
      updated_at = NOW()
  WHERE status = 'sending'
    AND locked_at < NOW() - INTERVAL '5 minutes';

  -- Then claim queued/retrying rows as before
  RETURN QUERY
  WITH cte AS (
    SELECT id
    FROM email_outbox
    WHERE status IN ('queued', 'retrying')
      AND (send_after IS NULL OR send_after <= NOW())
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_batch_size
  )
  UPDATE email_outbox AS eo
  SET
    status = 'sending',
    locked_at = NOW(),
    locked_by = p_worker_id,
    updated_at = NOW()
  FROM cte
  WHERE eo.id = cte.id
  RETURNING eo.*;
END;
$$;
