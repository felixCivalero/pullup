-- 159: the page's look, set in the editor's Innehåll step: background colour
-- and font ({ bg: "#ffffff", font: "grotesk" }). NULL = the original dark
-- page (every event made before this); new events start white.
ALTER TABLE events ADD COLUMN IF NOT EXISTS look JSONB;
