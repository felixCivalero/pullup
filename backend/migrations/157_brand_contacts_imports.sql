-- 157: a brand's own contacts, brought in from outside (an old newsletter
-- list, a customer register), with the yes to mail recorded per brand — the
-- same rule as sign-ups: consent belongs to the brand it was given to.
--
-- brand_contacts: one row per person per brand. consent = they said yes to
--   mail from this brand; consent_source says where and how (as given at the
--   import: "Mailchimp-lista, opt-in 2023"), consent_at when.
-- data_imports: one row per import, with the data processing agreement the
--   brand's team accepted (version + when + who) — PullUp processes this data
--   on the brand's behalf (GDPR art. 28).
-- Service role only, like the rest (mig 149).

CREATE TABLE IF NOT EXISTS data_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  host_id UUID NOT NULL,
  imported_by UUID NOT NULL,
  file_name TEXT,
  source TEXT NOT NULL,
  rows_total INT NOT NULL DEFAULT 0,
  rows_added INT NOT NULL DEFAULT 0,
  rows_matched INT NOT NULL DEFAULT 0,
  rows_consented INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  dpa_version TEXT NOT NULL,
  dpa_accepted_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_imports_brand ON data_imports(brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS brand_contacts (
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  consent BOOLEAN NOT NULL DEFAULT false,
  consent_source TEXT,
  consent_at TIMESTAMPTZ,
  import_id UUID REFERENCES data_imports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (brand_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_brand_contacts_person ON brand_contacts(person_id);

ALTER TABLE data_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON data_imports, brand_contacts FROM anon, authenticated, PUBLIC;
