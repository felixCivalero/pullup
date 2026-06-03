-- 057_events_room_permissions.sql
-- The host-configurable capability layer for the event room. STATE (rsvp /
-- pulled-up / locked) is system-determined and load-bearing (intent vs proof) —
-- this only sets what each state is ALLOWED to DO. Empty = code defaults
-- (services/roomPermissions.js). Applied to prod via MCP 2026-06-03.
ALTER TABLE events ADD COLUMN IF NOT EXISTS room_permissions JSONB NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN events.room_permissions IS
  'Per-event room capabilities keyed by state: { rsvp:{read,post,seeWho,upload,download}, pulledup:{...} }. Empty = code defaults. The state itself (rsvp/pulledup) is never host-set — only what each state can do.';
