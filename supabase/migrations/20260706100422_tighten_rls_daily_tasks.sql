DROP POLICY IF EXISTS "Herkes okuyabilir" ON public.daily_tasks;
DROP POLICY IF EXISTS "Authenticated ekleyebilir" ON public.daily_tasks;
DROP POLICY IF EXISTS "Authenticated güncelleyebilir" ON public.daily_tasks;
DROP POLICY IF EXISTS "Authenticated silebilir" ON public.daily_tasks;
DROP POLICY IF EXISTS dt_select ON public.daily_tasks;
DROP POLICY IF EXISTS dt_insert ON public.daily_tasks;
DROP POLICY IF EXISTS dt_update ON public.daily_tasks;
DROP POLICY IF EXISTS dt_delete ON public.daily_tasks;

CREATE POLICY dt_select ON public.daily_tasks
FOR SELECT USING (user_can_access_report(report_id));

CREATE POLICY dt_insert ON public.daily_tasks
FOR INSERT WITH CHECK (user_can_access_report(report_id));

CREATE POLICY dt_update ON public.daily_tasks
FOR UPDATE USING (user_can_access_report(report_id));

CREATE POLICY dt_delete ON public.daily_tasks
FOR DELETE USING (user_can_access_report(report_id));

