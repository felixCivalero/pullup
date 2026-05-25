-- 031_content_planner.sql
-- Phase 1 data model for the Content Planner.
--
-- Mostly designed-for-later: only events.brand_id is conceptually used in
-- phase 1 (a single brand swim lane). The brands + channels tables are created
-- and seeded now so phases 2–4 can attach content slots without another
-- migration.
--
-- Ownership mirrors events: a brand belongs to a host via host_id — the same
-- user that owns events through events.host_id / event_hosts. All writes go
-- through the service-role backend; RLS is select-your-own.
--
-- Purely additive (new tables + one nullable column), so safe to apply to a
-- running backend. Idempotent: safe to re-run.

-- ── brands ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS brands (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,                        -- hex tint for the swim lane / event bands
  sort_order  INTEGER NOT NULL DEFAULT 0,  -- lane ordering when multi-brand lands (phase 3)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_brands_host ON brands(host_id, sort_order);
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brands_select_own" ON brands;
CREATE POLICY "brands_select_own" ON brands FOR SELECT USING (auth.uid() = host_id);

-- ── events.brand_id ─────────────────────────────────────────────────
-- Nullable + SET NULL: deleting a brand must never delete a host's events.
ALTER TABLE events ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_events_brand ON events(brand_id);

-- ── channels ────────────────────────────────────────────────────────
-- Per-brand content channels. Seeded with the phase-1 defaults but NOT read by
-- the UI in phase 1 (the 6 rows are a frontend constant). Here so later phases
-- can hang content slots off a channel row.
CREATE TABLE IF NOT EXISTS channels (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,               -- 'instagram_feed', 'email', …
  label       TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand_id, key)
);
CREATE INDEX IF NOT EXISTS idx_channels_brand ON channels(brand_id, sort_order);
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "channels_select_own" ON channels;
CREATE POLICY "channels_select_own" ON channels FOR SELECT
  USING (EXISTS (SELECT 1 FROM brands b WHERE b.id = channels.brand_id AND b.host_id = auth.uid()));

-- ── Backfill: one brand per host ────────────────────────────────────
INSERT INTO brands (host_id, name)
SELECT p.id, COALESCE(NULLIF(BTRIM(p.brand), ''), 'Default')
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM brands b WHERE b.host_id = p.id);

-- Assign every event to its owner's brand. Owner = events.host_id, else the
-- earliest event_hosts row (mirrors getUserEventIds ownership resolution).
UPDATE events e
SET brand_id = b.id
FROM brands b
WHERE e.brand_id IS NULL
  AND b.host_id = COALESCE(
        e.host_id,
        (SELECT eh.user_id FROM event_hosts eh
          WHERE eh.event_id = e.id ORDER BY eh.created_at ASC LIMIT 1)
      );

-- ── Seed the 6 default channels per brand ───────────────────────────
INSERT INTO channels (brand_id, key, label, sort_order)
SELECT b.id, c.key, c.label, c.sort_order
FROM brands b
CROSS JOIN (VALUES
  ('instagram_feed',    'Instagram Feed',    1),
  ('instagram_stories', 'Instagram Stories', 2),
  ('instagram_reels',   'Instagram Reels',   3),
  ('tiktok',            'TikTok',            4),
  ('whatsapp_status',   'WhatsApp Status',   5),
  ('email',             'Email',             6)
) AS c(key, label, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM channels ch WHERE ch.brand_id = b.id AND ch.key = c.key
);
