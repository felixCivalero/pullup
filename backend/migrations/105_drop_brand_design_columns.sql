-- 105_drop_brand_design_columns.sql
--
-- ⚠️ POST-DEPLOY ONLY. Do NOT apply until the brand-design-removal code is
-- live on prod. Live prod must already be on code that no longer reads
-- events.brand / profiles.brand_*; running this before that deploy breaks the
-- running site. (The AI generative hero was moved to events.scene in mig 104.)
--
-- Drops the now-dormant brand-DESIGN columns:
alter table public.events   drop column if exists brand;
alter table public.profiles drop column if exists brand_primary_color;
alter table public.profiles drop column if exists brand_background;
alter table public.profiles drop column if exists brand_text_color;
alter table public.profiles drop column if exists brand_font_family;

-- NOTE: profiles.brand_logo_url is intentionally LEFT for now — it still backs
-- a separate host logo-upload subsystem (profileMedia route, mapped as
-- `brandLogo`). Drop it only if that subsystem is also retired.
-- KEPT (not brand design): profiles.brand (name), brand_website, branding_links.
