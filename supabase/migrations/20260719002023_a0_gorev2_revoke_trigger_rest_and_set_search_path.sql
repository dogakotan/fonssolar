-- 1) REST'e kapat
REVOKE EXECUTE ON FUNCTION public.fn_auto_advance_pr_to_satin_alindi() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_create_ticket_from_daily_report_issue() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_guard_invoice_requires_procurement_done() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_sync_ticket_status_from_daily_report_issue() FROM anon, authenticated;

-- 2) search_path sabitleme
ALTER FUNCTION public.fn_guard_purchase_request_invoice_id() SET search_path = public;
ALTER FUNCTION public.fn_purchase_request_procurement_fields_only(uuid, text, uuid, uuid, timestamp with time zone, text, text, text, numeric, text) SET search_path = public;
ALTER FUNCTION public.update_procurement_status(integer, text, text, date, date, text, text) SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.create_invoice_approval_chain() SET search_path = public;
ALTER FUNCTION public.get_my_role() SET search_path = public;
ALTER FUNCTION public.handle_purchase_request_approval() SET search_path = public;
ALTER FUNCTION public.fn_validate_invoice_status_transition() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
ALTER FUNCTION public.fn_invoice_approval_cascade() SET search_path = public;
ALTER FUNCTION public.fn_ticket_history() SET search_path = public;
ALTER FUNCTION public.get_daily_report_detail(uuid) SET search_path = public;
ALTER FUNCTION public.sync_task_progress_from_daily() SET search_path = public;
ALTER FUNCTION public.save_daily_report(text, date, uuid, text, integer, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) SET search_path = public;
ALTER FUNCTION public.fn_sync_project_progress() SET search_path = public;
ALTER FUNCTION public.create_purchase_request_with_items(text, text, text, text, uuid, jsonb, text) SET search_path = public;

