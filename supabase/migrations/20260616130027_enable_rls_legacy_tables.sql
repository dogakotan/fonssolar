
ALTER TABLE public.gunluk_ilerleme_örnek ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personel_makine_raporu ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin erişebilir" ON public.gunluk_ilerleme_örnek
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admin erişebilir" ON public.personel_makine_raporu
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

