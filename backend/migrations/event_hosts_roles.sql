-- Migration: event_hosts_roles.sql
-- Description: Allow specific arranger roles (admin, editor, reception, viewer).
--              Backfill existing co_host to editor.

-- Backfill: co_host -> editor (so existing co-hosts get editor permissions)
UPDATE event_hosts
SET role = 'editor'
WHERE role = 'co_host';
