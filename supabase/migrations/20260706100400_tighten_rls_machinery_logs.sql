DROP POLICY IF EXISTS "Herkes okuyabilir" ON public.machinery_logs;
DROP POLICY IF EXISTS "Authenticated ekleyebilir" ON public.machinery_logs;
DROP POLICY IF EXISTS "Authenticated güncelleyebilir" ON public.machinery_logs;
DROP POLICY IF EXISTS "Authenticated silebilir" ON public.machinery_logs;
DROP POLICY IF EXISTS ml_select ON public.machinery_logs;
DROP POLICY IF EXISTS ml_insert ON public.machinery_logs;
DROP POLICY IF EXISTS ml_update ON public.machinery_logs;
DROP POLICY IF EXISTS ml_delete ON public.machinery_logs;

CREATE POLICY ml_select ON public.machinery_logs
FOR SELECT USING (user_can_access_report(report_id));

CREATE POLICY ml_insert ON public.machinery_logs
FOR INSERT WITH CHECK (user_can_access_report(report_id));

CREATE POLICY ml_update ON public.machinery_logs
FOR UPDATE USING (user_can_access_report(report_id));

CREATE POLICY ml_delete ON public.machinery_logs
FOR DELETE USING (user_can_access_report(report_id));

