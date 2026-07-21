
-- INVOICES: admin + muhasebe okuyabilir/ekleyebilir, admin+muhasebe güncelleyebilir
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated ekleyebilir" ON public.invoices;
DROP POLICY IF EXISTS "Authenticated güncelleyebilir" ON public.invoices;

CREATE POLICY "Finans okuma" ON public.invoices
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );
CREATE POLICY "Finans ekleme" ON public.invoices
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );
CREATE POLICY "Finans güncelleme" ON public.invoices
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );

-- INVOICE_APPROVALS: admin + muhasebe
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.invoice_approvals;
DROP POLICY IF EXISTS "Authenticated ekleyebilir" ON public.invoice_approvals;
DROP POLICY IF EXISTS "Authenticated güncelleyebilir" ON public.invoice_approvals;

CREATE POLICY "Onay okuma" ON public.invoice_approvals
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );
CREATE POLICY "Onay ekleme" ON public.invoice_approvals
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );
CREATE POLICY "Onay güncelleme" ON public.invoice_approvals
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );

-- SUPPLIERS: admin + muhasebe
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated ekleyebilir" ON public.suppliers;
DROP POLICY IF EXISTS "Authenticated güncelleyebilir" ON public.suppliers;

CREATE POLICY "Tedarikçi okuma" ON public.suppliers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );
CREATE POLICY "Tedarikçi ekleme" ON public.suppliers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );
CREATE POLICY "Tedarikçi güncelleme" ON public.suppliers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key IN ('admin','muhasebe'))
  );

-- COST_ALLOCATIONS: sadece admin
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.cost_allocations;
DROP POLICY IF EXISTS "Authenticated ekleyebilir" ON public.cost_allocations;
DROP POLICY IF EXISTS "Authenticated güncelleyebilir" ON public.cost_allocations;

CREATE POLICY "Maliyet okuma sadece admin" ON public.cost_allocations
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key = 'admin')
  );
CREATE POLICY "Maliyet ekleme sadece admin" ON public.cost_allocations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key = 'admin')
  );
CREATE POLICY "Maliyet güncelleme sadece admin" ON public.cost_allocations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key = 'admin')
  );

-- BUDGET_LINES: sadece admin
DROP POLICY IF EXISTS "Authenticated okuyabilir" ON public.budget_lines;
DROP POLICY IF EXISTS "Authenticated ekleyebilir" ON public.budget_lines;
DROP POLICY IF EXISTS "Authenticated güncelleyebilir" ON public.budget_lines;

CREATE POLICY "Bütçe okuma sadece admin" ON public.budget_lines
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key = 'admin')
  );
CREATE POLICY "Bütçe ekleme sadece admin" ON public.budget_lines
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key = 'admin')
  );
CREATE POLICY "Bütçe güncelleme sadece admin" ON public.budget_lines
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role_key = 'admin')
  );

