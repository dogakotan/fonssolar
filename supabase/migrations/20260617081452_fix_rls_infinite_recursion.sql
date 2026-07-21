
-- RLS döngüsünü kıran helper function
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role_key FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- profiles policy'lerini yenile (döngü yok)
DROP POLICY IF EXISTS "Herkes kendi profilini okur" ON public.profiles;
DROP POLICY IF EXISTS "Admin tüm profilleri okur" ON public.profiles;
DROP POLICY IF EXISTS "Admin profil ekler" ON public.profiles;
DROP POLICY IF EXISTS "Admin profil günceller" ON public.profiles;

CREATE POLICY "Herkes kendi profilini okur" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admin tüm profilleri okur" ON public.profiles
  FOR SELECT USING (public.get_my_role() = 'admin');

CREATE POLICY "Admin profil ekler" ON public.profiles
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Admin profil günceller" ON public.profiles
  FOR UPDATE USING (public.get_my_role() = 'admin');

-- Finans tablolarını aynı function ile güncelle
DROP POLICY IF EXISTS "Finans okuma" ON public.invoices;
DROP POLICY IF EXISTS "Finans ekleme" ON public.invoices;
DROP POLICY IF EXISTS "Finans güncelleme" ON public.invoices;

CREATE POLICY "Finans okuma" ON public.invoices
  FOR SELECT USING (public.get_my_role() IN ('admin','muhasebe'));
CREATE POLICY "Finans ekleme" ON public.invoices
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','muhasebe'));
CREATE POLICY "Finans güncelleme" ON public.invoices
  FOR UPDATE USING (public.get_my_role() IN ('admin','muhasebe'));

DROP POLICY IF EXISTS "Onay okuma" ON public.invoice_approvals;
DROP POLICY IF EXISTS "Onay ekleme" ON public.invoice_approvals;
DROP POLICY IF EXISTS "Onay güncelleme" ON public.invoice_approvals;

CREATE POLICY "Onay okuma" ON public.invoice_approvals
  FOR SELECT USING (public.get_my_role() IN ('admin','muhasebe'));
CREATE POLICY "Onay ekleme" ON public.invoice_approvals
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','muhasebe'));
CREATE POLICY "Onay güncelleme" ON public.invoice_approvals
  FOR UPDATE USING (public.get_my_role() IN ('admin','muhasebe'));

DROP POLICY IF EXISTS "Tedarikçi okuma" ON public.suppliers;
DROP POLICY IF EXISTS "Tedarikçi ekleme" ON public.suppliers;
DROP POLICY IF EXISTS "Tedarikçi güncelleme" ON public.suppliers;

CREATE POLICY "Tedarikçi okuma" ON public.suppliers
  FOR SELECT USING (public.get_my_role() IN ('admin','muhasebe'));
CREATE POLICY "Tedarikçi ekleme" ON public.suppliers
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin','muhasebe'));
CREATE POLICY "Tedarikçi güncelleme" ON public.suppliers
  FOR UPDATE USING (public.get_my_role() IN ('admin','muhasebe'));

DROP POLICY IF EXISTS "Maliyet okuma sadece admin" ON public.cost_allocations;
DROP POLICY IF EXISTS "Maliyet ekleme sadece admin" ON public.cost_allocations;
DROP POLICY IF EXISTS "Maliyet güncelleme sadece admin" ON public.cost_allocations;

CREATE POLICY "Maliyet okuma sadece admin" ON public.cost_allocations
  FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "Maliyet ekleme sadece admin" ON public.cost_allocations
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "Maliyet güncelleme sadece admin" ON public.cost_allocations
  FOR UPDATE USING (public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "Bütçe okuma sadece admin" ON public.budget_lines;
DROP POLICY IF EXISTS "Bütçe ekleme sadece admin" ON public.budget_lines;
DROP POLICY IF EXISTS "Bütçe güncelleme sadece admin" ON public.budget_lines;

CREATE POLICY "Bütçe okuma sadece admin" ON public.budget_lines
  FOR SELECT USING (public.get_my_role() = 'admin');
CREATE POLICY "Bütçe ekleme sadece admin" ON public.budget_lines
  FOR INSERT WITH CHECK (public.get_my_role() = 'admin');
CREATE POLICY "Bütçe güncelleme sadece admin" ON public.budget_lines
  FOR UPDATE USING (public.get_my_role() = 'admin');

