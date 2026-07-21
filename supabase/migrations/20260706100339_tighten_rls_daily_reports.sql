-- daily_reports: herkese açık okuma kaldırılıyor, proje bazlı izolasyon
DROP POLICY IF EXISTS "Herkes okuyabilir" ON public.daily_reports;
DROP POLICY IF EXISTS "Authenticated kullanıcı ekleyebilir" ON public.daily_reports;
DROP POLICY IF EXISTS "Kendi raporu güncelleyebilir" ON public.daily_reports;
DROP POLICY IF EXISTS dr_select ON public.daily_reports;
DROP POLICY IF EXISTS dr_insert ON public.daily_reports;
DROP POLICY IF EXISTS dr_update ON public.daily_reports;
DROP POLICY IF EXISTS dr_delete ON public.daily_reports;

CREATE POLICY dr_select ON public.daily_reports
FOR SELECT USING (
  get_my_role() = 'admin'
  OR created_by = auth.uid()
  OR project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY dr_insert ON public.daily_reports
FOR INSERT WITH CHECK (
  get_my_role() = 'admin'
  OR (
    created_by = auth.uid()
    AND project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
  )
);

CREATE POLICY dr_update ON public.daily_reports
FOR UPDATE USING (
  get_my_role() = 'admin' OR created_by = auth.uid()
);

CREATE POLICY dr_delete ON public.daily_reports
FOR DELETE USING (get_my_role() = 'admin');

