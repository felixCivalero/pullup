-- 070_room_feed_threads_media.sql
--
-- The event room becomes ONE flowing feed: every post is repliable, photos and
-- video are first-class posts, and any post can be "attached to the top" (pin).
--
--   parent_id  — an inline reply thread: a post that answers another post.
--   media      — attached photos/video, [{ url, type }] (type = "image"|"video").
--   pinned     — featured at the top of the room (the "attach to top" gesture).
--
-- Channels stay in the schema but the reader now merges everything into a single
-- stream (see listSpaceMessages), so old per-topic messages surface in the feed.

ALTER TABLE event_space_messages
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES event_space_messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS media     jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pinned    boolean NOT NULL DEFAULT false;

-- Fast "replies under this post" lookups.
CREATE INDEX IF NOT EXISTS idx_space_messages_parent
  ON event_space_messages (parent_id);

-- Fast "what's pinned in this room" lookups (partial — only pinned rows).
CREATE INDEX IF NOT EXISTS idx_space_messages_event_pinned
  ON event_space_messages (event_id)
  WHERE pinned;
