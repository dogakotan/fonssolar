
CREATE INDEX IF NOT EXISTS idx_progress_daily_report_id ON public.progress_daily(report_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_created_by ON public.daily_reports(created_by);
CREATE INDEX IF NOT EXISTS idx_purchase_request_items_request_id ON public.purchase_request_items(request_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requests_project_id ON public.purchase_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_project_id ON public.invoices(project_id);
CREATE INDEX IF NOT EXISTS idx_invoices_supplier_id ON public.invoices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_notifications_project_id ON public.notifications(project_id);
CREATE INDEX IF NOT EXISTS idx_tickets_project_id ON public.tickets(project_id);
CREATE INDEX IF NOT EXISTS idx_cost_allocations_project_id ON public.cost_allocations(project_id);

