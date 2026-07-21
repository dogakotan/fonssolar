
-- daily_reports
DROP POLICY IF EXISTS "Herkes okuyabilir" ON public.daily_reports;
CREATE POLICY "Herkes okuyabilir" ON public.daily_reports
  FOR SELECT USING (true);

-- personnel_logs
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.personnel_logs;
CREATE POLICY "Herkes okuyabilir" ON public.personnel_logs
  FOR SELECT USING (true);

-- machinery_logs
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.machinery_logs;
CREATE POLICY "Herkes okuyabilir" ON public.machinery_logs
  FOR SELECT USING (true);

-- daily_tasks
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.daily_tasks;
CREATE POLICY "Herkes okuyabilir" ON public.daily_tasks
  FOR SELECT USING (true);

-- progress_items
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.progress_items;
CREATE POLICY "Herkes okuyabilir" ON public.progress_items
  FOR SELECT USING (true);

-- progress_daily
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.progress_daily;
CREATE POLICY "Herkes okuyabilir" ON public.progress_daily
  FOR SELECT USING (true);

