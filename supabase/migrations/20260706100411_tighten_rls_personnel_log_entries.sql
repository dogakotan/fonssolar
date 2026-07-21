DROP POLICY IF EXISTS ple_select_auth ON public.personnel_log_entries;
DROP POLICY IF EXISTS ple_insert_auth ON public.personnel_log_entries;
DROP POLICY IF EXISTS ple_update_auth ON public.personnel_log_entries;
DROP POLICY IF EXISTS ple_delete_auth ON public.personnel_log_entries;
DROP POLICY IF EXISTS ple_select ON public.personnel_log_entries;
DROP POLICY IF EXISTS ple_insert ON public.personnel_log_entries;
DROP POLICY IF EXISTS ple_update ON public.personnel_log_entries;
DROP POLICY IF EXISTS ple_delete ON public.personnel_log_entries;

CREATE POLICY ple_select ON public.personnel_log_entries
FOR SELECT USING (user_can_access_report(report_id));

CREATE POLICY ple_insert ON public.personnel_log_entries
FOR INSERT WITH CHECK (user_can_access_report(report_id));

CREATE POLICY ple_update ON public.personnel_log_entries
FOR UPDATE USING (user_can_access_report(report_id));

CREATE POLICY ple_delete ON public.personnel_log_entries
FOR DELETE USING (user_can_access_report(report_id));

