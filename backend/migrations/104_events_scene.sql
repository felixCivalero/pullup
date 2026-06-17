-- 104_events_scene.sql
--
-- Decouple the AI generative hero ("scene") from the brand-design system.
-- It used to live at events.brand.design; brand design is being removed, so the
-- scene gets its own first-class home. ADDITIVE + backfill only — safe while
-- live prod still reads events.brand. The events.brand / profiles.brand_*
-- column DROPS happen in migration 105 AFTER the brand-removal code deploys.
alter table public.events add column if not exists scene jsonb;

update public.events
   set scene = brand->'design'
 where scene is null
   and brand ? 'design'
   and (brand->'design') is not null
   and (brand->'design') <> 'null'::jsonb;

comment on column public.events.scene is
  'AI-authored generative hero { archetype, html, poster, params }. Moved out of events.brand when brand design was removed.';
