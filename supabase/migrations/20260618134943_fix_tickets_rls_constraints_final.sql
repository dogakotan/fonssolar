
-- 1. Eski çakışan politikaları temizle
DROP POLICY IF EXISTS "Ticket ekleme" ON tickets;
DROP POLICY IF EXISTS "Ticket güncelleme" ON tickets;
DROP POLICY IF EXISTS "Ticket okuma" ON tickets;
DROP POLICY IF EXISTS "tickets_insert" ON tickets;
DROP POLICY IF EXISTS "tickets_select" ON tickets;
DROP POLICY IF EXISTS "tickets_update" ON tickets;

-- 2. Temiz politikalar — proje bazlı erişim
CREATE POLICY "tickets_select" ON tickets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND (
        profiles.role_key = 'admin'
        OR profiles.project_id = tickets.project_id
      )
    )
  );

CREATE POLICY "tickets_insert" ON tickets
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "tickets_update" ON tickets
  FOR UPDATE USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() AND profiles.role_key = 'admin'
    )
  );

-- 3. Status constraint — iptal_edildi ekle
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY[
    'açık'::text,
    'işlemde'::text,
    'kapatıldı'::text,
    'iptal_edildi'::text
  ]));

-- 4. Severity constraint — kritik kaldır
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_severity_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_severity_check
  CHECK (severity = ANY (ARRAY[
    'düşük'::text,
    'orta'::text,
    'yüksek'::text
  ]));

-- 5. Category constraint — sadece elektrik/mekanik
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_category_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_category_check
  CHECK (category = ANY (ARRAY[
    'elektrik'::text,
    'mekanik'::text
  ]));

