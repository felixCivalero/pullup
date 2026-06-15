-- Auto-DM flows now target any page kind, not just events. A conversational
-- comment→DM flow snapshots its anchor at opener-time into ig_flow_sessions;
-- when the guest replies, we build the signup link from that snapshot. To route
-- the link to the right public prefix (/e, /c, /p) we remember the kind here, so
-- a reply links to a community join or a product buy — not always an event RSVP.
-- Defaults 'event' → existing in-flight sessions resolve to /e/:slug unchanged.
ALTER TABLE ig_flow_sessions ADD COLUMN IF NOT EXISTS event_kind text DEFAULT 'event';
