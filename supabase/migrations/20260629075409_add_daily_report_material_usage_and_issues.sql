
-- =============================================
-- daily_report_material_usage
-- =============================================
CREATE TABLE IF NOT EXISTS public.daily_report_material_usage (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  project_id      text NOT NULL,
  progress_item_id uuid REFERENCES public.progress_items(id) ON DELETE SET NULL,
  material_name   text NOT NULL,
  quantity_used   numeric NOT NULL DEFAULT 0,
  unit            text,
  description     text,
  reason          text,  -- fazla/eksik kullanım sebebi
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_report_material_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dmu_select" ON public.daily_report_material_usage
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "dmu_insert" ON public.daily_report_material_usage
  FOR INSERT TO authenticated WITH CHECK (
    project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "dmu_update" ON public.daily_report_material_usage
  FOR UPDATE TO authenticated USING (
    project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "dmu_delete" ON public.daily_report_material_usage
  FOR DELETE TO authenticated USING (
    project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
  );

-- =============================================
-- daily_report_issues
-- =============================================
CREATE TABLE IF NOT EXISTS public.daily_report_issues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  project_id      text NOT NULL,
  topic           text NOT NULL,
  priority        text NOT NULL DEFAULT 'orta' CHECK (priority IN ('düşük','orta','yüksek','kritik')),
  assigned_to     text,
  description     text,
  resolution_status text NOT NULL DEFAULT 'açık' CHECK (resolution_status IN ('açık','devam ediyor','çözüldü')),
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_report_issues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dri_select" ON public.daily_report_issues
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "dri_insert" ON public.daily_report_issues
  FOR INSERT TO authenticated WITH CHECK (
    project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "dri_update" ON public.daily_report_issues
  FOR UPDATE TO authenticated USING (
    project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "dri_delete" ON public.daily_report_issues
  FOR DELETE TO authenticated USING (
    project_id = (SELECT project_id FROM public.profiles WHERE id = auth.uid())
  );

