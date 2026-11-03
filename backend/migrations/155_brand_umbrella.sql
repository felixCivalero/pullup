-- 155: brands under a brand. An account's organisation is drawn as an
-- umbrella: a main brand on top, the brands it owns underneath (Nigab →
-- Aperol, Hendrick's). One level only: a brand under another can't have
-- brands under it, and both belong to the same account. Events, guests, CRM
-- and mail stay per brand exactly as before; the tree is how the account is
-- organised and who a team invite to the main brand reaches (lib/brands.js).

ALTER TABLE brands ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_brands_parent ON brands(parent_id) WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION brands_umbrella_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  p RECORD;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'a brand cannot be under itself';
  END IF;
  SELECT host_id, parent_id INTO p FROM brands WHERE id = NEW.parent_id;
  IF NOT FOUND OR p.host_id IS DISTINCT FROM NEW.host_id THEN
    RAISE EXCEPTION 'the main brand must belong to the same account';
  END IF;
  IF p.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'brands go one level deep: the main brand is itself under another';
  END IF;
  IF EXISTS (SELECT 1 FROM brands WHERE parent_id = NEW.id) THEN
    RAISE EXCEPTION 'brands go one level deep: this brand has brands under it';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS brands_umbrella_guard ON brands;
CREATE TRIGGER brands_umbrella_guard BEFORE INSERT OR UPDATE OF parent_id, host_id ON brands
  FOR EACH ROW EXECUTE FUNCTION brands_umbrella_guard();

REVOKE ALL ON FUNCTION brands_umbrella_guard() FROM PUBLIC, anon, authenticated;
