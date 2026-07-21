
-- =====================================================
-- ADIM 1: Finans & Satın Alma RLS Politika Düzeltmeleri
-- =====================================================

-- 1) BUDGET_LINES: sadece admin → admin + muhasebe + maliyet_kontrolcu
DROP POLICY IF EXISTS "Bütçe okuma sadece admin" ON budget_lines;
DROP POLICY IF EXISTS "Bütçe ekleme sadece admin" ON budget_lines;
DROP POLICY IF EXISTS "Bütçe güncelleme sadece admin" ON budget_lines;

CREATE POLICY "budget_lines_select" ON budget_lines
  FOR SELECT USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','maliyet_kontrolcu','proje_koordinatoru'])
  );

CREATE POLICY "budget_lines_insert" ON budget_lines
  FOR INSERT WITH CHECK (
    get_my_role() = ANY (ARRAY['admin','muhasebe','maliyet_kontrolcu'])
  );

CREATE POLICY "budget_lines_update" ON budget_lines
  FOR UPDATE USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','maliyet_kontrolcu'])
  );

CREATE POLICY "budget_lines_delete" ON budget_lines
  FOR DELETE USING (
    get_my_role() = 'admin'
  );

-- 2) COST_ALLOCATIONS: sadece admin → admin + muhasebe + maliyet_kontrolcu
DROP POLICY IF EXISTS "Maliyet okuma sadece admin" ON cost_allocations;
DROP POLICY IF EXISTS "Maliyet ekleme sadece admin" ON cost_allocations;
DROP POLICY IF EXISTS "Maliyet güncelleme sadece admin" ON cost_allocations;

CREATE POLICY "cost_allocations_select" ON cost_allocations
  FOR SELECT USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','maliyet_kontrolcu'])
  );

CREATE POLICY "cost_allocations_insert" ON cost_allocations
  FOR INSERT WITH CHECK (
    get_my_role() = ANY (ARRAY['admin','muhasebe','maliyet_kontrolcu'])
  );

CREATE POLICY "cost_allocations_update" ON cost_allocations
  FOR UPDATE USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','maliyet_kontrolcu'])
  );

CREATE POLICY "cost_allocations_delete" ON cost_allocations
  FOR DELETE USING (
    get_my_role() = 'admin'
  );

-- 3) PURCHASE_REQUEST_ITEMS: çakışan politikalardan eskiyi kaldır
DROP POLICY IF EXISTS "PR item okuma" ON purchase_request_items;
DROP POLICY IF EXISTS "PR item ekleme" ON purchase_request_items;
DROP POLICY IF EXISTS "PR item silme" ON purchase_request_items;
-- pr_items_select ve pr_items_insert kalır, bunlar daha iyi yazılmış

-- pr_items_insert'te WITH CHECK eksikse yeniden oluştur
DROP POLICY IF EXISTS "pr_items_insert" ON purchase_request_items;
CREATE POLICY "pr_items_insert" ON purchase_request_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_items.request_id
        AND (
          pr.requested_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
              AND profiles.role_key = ANY (ARRAY['admin','muhasebe','satin_alma_uzmani'])
          )
        )
    )
  );

-- pr_items update ekle (eksikti)
CREATE POLICY "pr_items_update" ON purchase_request_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role_key = ANY (ARRAY['admin','satin_alma_uzmani'])
    )
  );

-- pr_items delete ekle (eksikti)
CREATE POLICY "pr_items_delete" ON purchase_request_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role_key = ANY (ARRAY['admin','satin_alma_uzmani'])
    )
  );

-- 4) SUPPLIERS: muhasebe'ye ek olarak satin_alma_uzmani erişimi
DROP POLICY IF EXISTS "Tedarikçi okuma" ON suppliers;
DROP POLICY IF EXISTS "Tedarikçi ekleme" ON suppliers;
DROP POLICY IF EXISTS "Tedarikçi güncelleme" ON suppliers;

CREATE POLICY "suppliers_select" ON suppliers
  FOR SELECT USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','satin_alma_uzmani','maliyet_kontrolcu','proje_koordinatoru'])
  );

CREATE POLICY "suppliers_insert" ON suppliers
  FOR INSERT WITH CHECK (
    get_my_role() = ANY (ARRAY['admin','muhasebe','satin_alma_uzmani'])
  );

CREATE POLICY "suppliers_update" ON suppliers
  FOR UPDATE USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','satin_alma_uzmani'])
  );

CREATE POLICY "suppliers_delete" ON suppliers
  FOR DELETE USING (
    get_my_role() = 'admin'
  );

-- 5) INVOICES: satin_alma_uzmani okuma erişimi ekle (kendi PR'ına bağlı faturaları görsün)
DROP POLICY IF EXISTS "Finans okuma" ON invoices;
DROP POLICY IF EXISTS "Finans ekleme" ON invoices;
DROP POLICY IF EXISTS "Finans güncelleme" ON invoices;

CREATE POLICY "invoices_select" ON invoices
  FOR SELECT USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','maliyet_kontrolcu','satin_alma_uzmani','proje_koordinatoru'])
  );

CREATE POLICY "invoices_insert" ON invoices
  FOR INSERT WITH CHECK (
    get_my_role() = ANY (ARRAY['admin','muhasebe','satin_alma_uzmani'])
  );

CREATE POLICY "invoices_update" ON invoices
  FOR UPDATE USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe'])
  );

CREATE POLICY "invoices_delete" ON invoices
  FOR DELETE USING (
    get_my_role() = 'admin'
  );

-- 6) INVOICE_APPROVALS: satin_alma_uzmani ve maliyet_kontrolcu okuma erişimi
DROP POLICY IF EXISTS "Onay okuma" ON invoice_approvals;
DROP POLICY IF EXISTS "Onay ekleme" ON invoice_approvals;
DROP POLICY IF EXISTS "Onay güncelleme" ON invoice_approvals;

CREATE POLICY "invoice_approvals_select" ON invoice_approvals
  FOR SELECT USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe','maliyet_kontrolcu','satin_alma_uzmani'])
  );

CREATE POLICY "invoice_approvals_insert" ON invoice_approvals
  FOR INSERT WITH CHECK (
    get_my_role() = ANY (ARRAY['admin','muhasebe'])
  );

CREATE POLICY "invoice_approvals_update" ON invoice_approvals
  FOR UPDATE USING (
    get_my_role() = ANY (ARRAY['admin','muhasebe'])
  );

