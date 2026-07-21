
CREATE TABLE public.machinery_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  machine_type  text NOT NULL CHECK (machine_type IN ('vinç','jcb','ekskavatör','loader','gayk_delici','rok_delim','kamyon','traktör','diğer')),
  count         int4 NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'çalışıyor' CHECK (status IN ('çalışıyor','arızalı','beklemede')),
  notes         text,
  CONSTRAINT machinery_logs_report_machine_unique UNIQUE (report_id, machine_type)
);

ALTER TABLE public.machinery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated okuyabilir" ON public.machinery_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated ekleyebilir" ON public.machinery_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated güncelleyebilir" ON public.machinery_logs
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated silebilir" ON public.machinery_logs
  FOR DELETE USING (auth.role() = 'authenticated');

