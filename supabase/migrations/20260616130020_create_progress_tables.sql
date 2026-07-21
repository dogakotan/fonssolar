
CREATE TABLE public.progress_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      text NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category        text NOT NULL CHECK (category IN ('mekanik','elektrik','inşaat','diğer')),
  name            text NOT NULL,
  unit            text NOT NULL,
  target_qty      numeric NOT NULL DEFAULT 0,
  total_progress  numeric NOT NULL DEFAULT 0,
  order_index     int4 NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.progress_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated okuyabilir" ON public.progress_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated ekleyebilir" ON public.progress_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated güncelleyebilir" ON public.progress_items
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE TRIGGER progress_items_updated_at
  BEFORE UPDATE ON public.progress_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


CREATE TABLE public.progress_daily (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES public.progress_items(id) ON DELETE CASCADE,
  report_id   uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  qty_added   numeric NOT NULL DEFAULT 0,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT progress_daily_item_report_unique UNIQUE (item_id, report_id)
);

ALTER TABLE public.progress_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated okuyabilir" ON public.progress_daily
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated ekleyebilir" ON public.progress_daily
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated güncelleyebilir" ON public.progress_daily
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated silebilir" ON public.progress_daily
  FOR DELETE USING (auth.role() = 'authenticated');


CREATE OR REPLACE FUNCTION sync_progress_total()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.progress_items
  SET total_progress = (
    SELECT COALESCE(SUM(qty_added), 0)
    FROM public.progress_daily
    WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
  )
  WHERE id = COALESCE(NEW.item_id, OLD.item_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER progress_daily_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.progress_daily
  FOR EACH ROW EXECUTE FUNCTION sync_progress_total();

