
CREATE TABLE public.daily_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date   date NOT NULL,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  weather       text CHECK (weather IN ('açık','parçalı bulutlu','bulutlu','yağmurlu','karlı','fırtınalı')),
  notes         text,
  ai_summary    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_reports_project_date_unique UNIQUE (project_id, report_date)
);

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Herkes okuyabilir" ON public.daily_reports
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated kullanıcı ekleyebilir" ON public.daily_reports
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Kendi raporu güncelleyebilir" ON public.daily_reports
  FOR UPDATE USING (auth.uid() = created_by OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','santiye_sefi')
  ));

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER daily_reports_updated_at
  BEFORE UPDATE ON public.daily_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

