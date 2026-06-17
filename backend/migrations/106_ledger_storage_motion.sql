-- 106_ledger_storage_motion.sql
--
-- Phase A of the storage-markup revenue model. The recurring 30% markup on a
-- BYO creator's own Supabase tier is metered into transaction_ledger as a new
-- 'storage_service' motion (one row per host per month, deduped by
-- dedupe_key = 'storage:<host>:<YYYY-MM>'). Widen the motion CHECK to allow it.
-- Additive + safe: only broadens an allowed-value set.
alter table public.transaction_ledger drop constraint if exists transaction_ledger_motion_check;
alter table public.transaction_ledger add constraint transaction_ledger_motion_check
  check (motion in ('pullup', 'rsvp', 'ticket_sale', 'storage_service'));
