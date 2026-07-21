
CREATE TABLE public.daily_tasks (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('done','planned')),
  description  text NOT NULL,
  order_index  int4 NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated okuyabilir" ON public.daily_tasks
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated ekleyebilir" ON public.daily_tasks
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated güncelleyebilir" ON public.daily_tasks
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated silebilir" ON public.daily_tasks
  FOR DELETE USING (auth.role() = 'authenticated');

