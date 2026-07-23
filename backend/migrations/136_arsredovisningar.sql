-- 136_arsredovisningar.sql
-- Årsredovisning generator (admin-only now, creator-tier perk later): PullUp
-- generates Bolagsverket-valid iXBRL annual reports for AB:s from a small set
-- of atomic K2 inputs. This table is the audit trail and the seed for the
-- creator-facing phase: one row per (company, fiscal year) attempt, holding
-- the raw inputs (jsonb, exactly what the form submitted), the generated
-- xhtml (canonical — regenerated server-side only, never client-edited), and
-- a status that will later carry the Bolagsverket submission lifecycle once
-- the avtal + klientcertifikat exist (BOLAGSVERKET_API_ENABLED).
CREATE TABLE IF NOT EXISTS arsredovisningar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orgnr TEXT NOT NULL,
  company_name TEXT NOT NULL,
  fiscal_year_start DATE NOT NULL,
  fiscal_year_end DATE NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  ixbrl_xhtml TEXT,
  derived JSONB,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'generated', 'submitted', 'registered')),
  created_by_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arsredovisningar_orgnr_idx
  ON arsredovisningar (orgnr, fiscal_year_end DESC);

ALTER TABLE arsredovisningar ENABLE ROW LEVEL SECURITY;
-- No policies: service-role access only (admin routes); anon/authenticated
-- clients cannot touch financial data directly.
