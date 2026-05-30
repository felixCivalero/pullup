-- 047_events_brand_snapshot.sql
--
-- Per-event brand snapshot. The host's brand (font/color/background tokens)
-- stops cascading LIVE from profiles.brand_* to every event page. Instead,
-- the theme chosen at event-creation time is snapshotted onto the event row
-- here. Consequences (the whole point of this change):
--
--   * EXISTING events have brand = NULL  -> fall back to the PullUp standard
--     theme (dark #0a0617 / pink #ec178f / Inter). They never re-theme when
--     the host later sets a brand.
--   * NEW events store whatever the creator picked -> "from this moment on".
--   * profiles.brand_* now serves only as the host's DEFAULT pre-fill for the
--     next event ("Save as my brand design"), not as the live theme.
--
-- Shape (mirrors frontend resolveBrand input; all keys optional):
--   { "primaryColor": "#hex", "background": "#hex", "textColor": "#hex",
--     "fontFamily": "Inter", "logoUrl": "https://…" }
-- NULL column = use PullUp standard.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS brand jsonb;

COMMENT ON COLUMN events.brand IS
  'Per-event brand/theme snapshot taken at creation (font/color/background tokens). NULL = PullUp standard theme. Replaces the old live cascade from profiles.brand_*.';
