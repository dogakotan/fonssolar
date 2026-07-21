
CREATE TABLE public.personnel_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  shift       text NOT NULL CHECK (shift IN ('mühendis','usta','işçi')),
  idari       int4 NOT NULL DEFAULT 0,
  mekanik     int4 NOT NULL DEFAULT 0,
  elektrik    int4 NOT NULL DEFAULT 0,
  yevmiyeci   int4 NOT NULL DEFAULT 0,
  total       int4 GENERATED ALWAYS AS (idari + mekanik + elektrik + yevmiyeci) STORED,
  CONSTRAINT personnel_logs_report_shift_unique UNIQUE (report_id, shift)
);

ALTER TABLE public.personnel_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated okuyabilir" ON public.personnel_logs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated ekleyebilir" ON public.personnel_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated güncelleyebilir" ON public.personnel_logs
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated silebilir" ON public.personnel_logs
  FOR DELETE USING (auth.role() = 'authenticated');

