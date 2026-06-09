-- 076_room_message_edit_delete.sql
--
-- Let people manage their OWN posts in the room: edit the text, or remove it.
--
--   edited_at  — set when a post's text is changed, so the room can show a quiet
--                "· edited" next to the timestamp.
--   deleted_at — a tombstone. We HARD-delete a leaf post (clean, no ghost), but
--                a post that has replies is SOFT-deleted instead: parent_id is
--                ON DELETE CASCADE (mig 070), so a hard delete would take every
--                reply with it. Soft-delete keeps the row (body/media cleared)
--                so the thread underneath survives, rendered as "message deleted".
--
-- Additive + idempotent.

ALTER TABLE event_space_messages
  ADD COLUMN IF NOT EXISTS edited_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
