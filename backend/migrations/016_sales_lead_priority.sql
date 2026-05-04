-- 016_sales_lead_priority.sql
-- Internal priority flag on each sales_lead so admin can mark VIP / high
-- accounts. Constrained to a small set so the UI never has to guess what
-- to render.
ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','vip'));

CREATE INDEX IF NOT EXISTS sales_leads_priority_idx
  ON sales_leads (priority);
