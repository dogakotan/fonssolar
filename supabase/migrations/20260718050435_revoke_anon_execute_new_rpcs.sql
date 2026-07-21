REVOKE EXECUTE ON FUNCTION public.get_purchase_requests_list(text, date, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_purchase_request_detail(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_invoices_list(text, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_invoice_approval_queue(text) FROM PUBLIC, anon;

