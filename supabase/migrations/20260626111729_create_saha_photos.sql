
-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'saha-fotolari',
  'saha-fotolari',
  true,
  10485760,
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/heic']
)
ON CONFLICT (id) DO NOTHING;

-- Photos metadata table
CREATE TABLE IF NOT EXISTS public.daily_report_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id    uuid REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  project_id   text REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date  date NOT NULL,
  storage_path text NOT NULL,
  caption      text,
  uploaded_by  uuid REFERENCES auth.users(id),
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drp_project ON public.daily_report_photos(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_drp_report  ON public.daily_report_photos(report_id);

ALTER TABLE public.daily_report_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drp_select" ON public.daily_report_photos FOR SELECT USING (true);
CREATE POLICY "drp_insert" ON public.daily_report_photos FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "drp_delete" ON public.daily_report_photos FOR DELETE USING (uploaded_by = auth.uid());

-- Storage policies
CREATE POLICY "storage_select" ON storage.objects FOR SELECT USING (bucket_id = 'saha-fotolari');
CREATE POLICY "storage_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'saha-fotolari' AND auth.uid() IS NOT NULL);
CREATE POLICY "storage_delete" ON storage.objects FOR DELETE USING (bucket_id = 'saha-fotolari' AND auth.uid() IS NOT NULL);

