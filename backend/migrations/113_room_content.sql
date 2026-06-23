-- 113_room_content.sql
-- The Pinterest-style content wall for an event Room. People who pulled up
-- upload photos/videos shot AT the event; the wall is the hero of the room.
--
-- Distinct from event_media (host covers + chat attachments, folder='darkroom')
-- on purpose: this carries content-wall semantics those rows never had —
-- a REQUIRED commercial-use consent flag, a creator-attribution snapshot so
-- people can tag the shooter on social, and a live download counter.
--
-- Reads/writes go through the API (service role); the browser only ever touches
-- this table indirectly. So RLS is ENABLED with NO policy — default-deny for the
-- anon/authenticated keys, service_role bypasses — matching the security
-- hardening pass (migs 109-112). Do not add a public policy.

CREATE TABLE IF NOT EXISTS room_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Who shot it. person/profile ids link the record; the *_name / *_instagram
  -- snapshot is what the tile shows for tagging, frozen at upload time so it
  -- survives a later handle change (same grammar as event_space_messages).
  uploader_person_id uuid REFERENCES people(id) ON DELETE SET NULL,
  uploader_profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  uploader_name text,
  uploader_instagram text,

  -- The media. url is the resolved public URL (storage_path is the bucket key,
  -- used to mint the forced-download URL). media_type ∈ image | video | gif.
  storage_path text,
  url text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  mime_type text,

  -- Optional caption + natural dimensions (so the masonry can reserve the right
  -- aspect ratio and not jump as images load).
  caption text,
  width int,
  height int,

  -- The gate: you cannot upload without ticking commercial-use consent, so a
  -- false row should never exist — but it's recorded for the audit trail.
  consent_commercial boolean NOT NULL DEFAULT false,

  download_count int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_content_event ON room_content (event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_room_content_uploader ON room_content (uploader_person_id);

ALTER TABLE room_content ENABLE ROW LEVEL SECURITY;

-- Atomic download tally — read-modify-write would race two simultaneous
-- downloads into one increment. SECURITY INVOKER (default) is fine: only the
-- service role calls it. search_path pinned per the advisor-hardening pass.
CREATE OR REPLACE FUNCTION increment_room_content_download(p_id uuid)
RETURNS int
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE room_content
     SET download_count = download_count + 1
   WHERE id = p_id
  RETURNING download_count;
$$;
