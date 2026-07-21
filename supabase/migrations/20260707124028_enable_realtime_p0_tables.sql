-- 7 tabloyu Realtime yayınına ekle (P0 kümesi)
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.daily_reports,
  public.progress_daily,
  public.progress_items,
  public.purchase_requests,
  public.invoices,
  public.tickets,
  public.project_tasks;

-- DELETE/UPDATE olaylarında RLS'in ihtiyaç duyduğu kolonların (project_id,
-- report_id, requested_by vb.) WAL'da eksiksiz gelmesi için — varsayılan
-- REPLICA IDENTITY yalnızca primary key taşır, RLS politikalarını
-- değerlendirmeye yetmez.
ALTER TABLE public.daily_reports      REPLICA IDENTITY FULL;
ALTER TABLE public.progress_daily     REPLICA IDENTITY FULL;
ALTER TABLE public.progress_items     REPLICA IDENTITY FULL;
ALTER TABLE public.purchase_requests  REPLICA IDENTITY FULL;
ALTER TABLE public.invoices           REPLICA IDENTITY FULL;
ALTER TABLE public.tickets            REPLICA IDENTITY FULL;
ALTER TABLE public.project_tasks      REPLICA IDENTITY FULL;

