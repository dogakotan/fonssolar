CREATE SCHEMA IF NOT EXISTS archive;

ALTER TABLE public._backup_20260709_purchase_requests SET SCHEMA archive;
ALTER TABLE public._backup_20260709_purchase_request_items SET SCHEMA archive;
ALTER TABLE public._backup_20260709_procurement_items SET SCHEMA archive;

REVOKE ALL ON ALL TABLES IN SCHEMA archive FROM anon, authenticated, PUBLIC;
REVOKE ALL ON SCHEMA archive FROM anon, authenticated, PUBLIC;

