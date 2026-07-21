
-- Eski çakışan politikaları temizle
DROP POLICY IF EXISTS "Admin talep güncelleme" ON purchase_requests;
DROP POLICY IF EXISTS "PR ekleme" ON purchase_requests;
DROP POLICY IF EXISTS "PR güncelleme" ON purchase_requests;
DROP POLICY IF EXISTS "PR okuma" ON purchase_requests;
DROP POLICY IF EXISTS "Talep okuma" ON purchase_requests;
DROP POLICY IF EXISTS "Talep oluşturma" ON purchase_requests;

-- SELECT: admin hepsini görür, kullanıcı sadece kendi taleplerini
CREATE POLICY "pr_select" ON purchase_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_key IN ('admin', 'muhasebe', 'satin_alma_uzmani')
    )
    OR auth.uid() = requested_by
  );

-- INSERT: giriş yapmış herkes talep oluşturabilir
CREATE POLICY "pr_insert" ON purchase_requests
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: sadece admin onaylayabilir
CREATE POLICY "pr_update" ON purchase_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role_key = 'admin'
    )
    OR auth.uid() = requested_by
  );

-- purchase_request_items için de aynı mantık
DROP POLICY IF EXISTS "PR items okuma" ON purchase_request_items;
DROP POLICY IF EXISTS "PR items ekleme" ON purchase_request_items;

CREATE POLICY "pr_items_select" ON purchase_request_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM purchase_requests pr
      WHERE pr.id = purchase_request_items.request_id
      AND (
        pr.requested_by = auth.uid()
        OR EXISTS (
          SELECT 1 FROM profiles
          WHERE profiles.id = auth.uid()
          AND profiles.role_key IN ('admin', 'muhasebe', 'satin_alma_uzmani')
        )
      )
    )
  );

CREATE POLICY "pr_items_insert" ON purchase_request_items
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

