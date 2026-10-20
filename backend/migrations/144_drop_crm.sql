-- 144_drop_crm.sql
-- The crm_* tables (142) never held a row: the sales pipeline lives in the
-- Google Sheet (PullUp_prospects), clients in `clients` (143), and the mail
-- tool syncs mail into the sheet (tools/mail-mcp, sales_sync_mail).
DROP TABLE IF EXISTS crm_tasks;
DROP TABLE IF EXISTS crm_interactions;
DROP TABLE IF EXISTS crm_deals;
DROP TABLE IF EXISTS crm_contacts;
DROP TABLE IF EXISTS crm_companies;
