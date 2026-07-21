DROP POLICY IF EXISTS "Herkes okuyabilir" ON public.progress_daily;
DROP POLICY IF EXISTS "Authenticated ekleyebilir" ON public.progress_daily;
DROP POLICY IF EXISTS "Authenticated güncelleyebilir" ON public.progress_daily;
DROP POLICY IF EXISTS "Authenticated silebilir" ON public.progress_daily;
DROP POLICY IF EXISTS pd_select ON public.progress_daily;
DROP POLICY IF EXISTS pd_insert ON public.progress_daily;
DROP POLICY IF EXISTS pd_update ON public.progress_daily;
DROP POLICY IF EXISTS pd_delete ON public.progress_daily;

CREATE POLICY pd_select ON public.progress_daily
FOR SELECT USING (user_can_access_report(report_id));

CREATE POLICY pd_insert ON public.progress_daily
FOR INSERT WITH CHECK (user_can_access_report(report_id));

CREATE POLICY pd_update ON public.progress_daily
FOR UPDATE USING (user_can_access_report(report_id));

CREATE POLICY pd_delete ON public.progress_daily
FOR DELETE USING (user_can_access_report(report_id));

