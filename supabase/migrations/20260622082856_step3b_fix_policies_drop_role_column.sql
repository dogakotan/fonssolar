
-- profiles.role'a bağımlı policy'leri role_key kullanacak şekilde yeniden yaz

-- 1. agent_reports policy'leri
DROP POLICY IF EXISTS "ar_select_staff" ON agent_reports;
CREATE POLICY "ar_select_staff" ON agent_reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role_key = ANY (ARRAY['admin', 'koordinator', 'proje_koordinatoru'])
    )
  );

DROP POLICY IF EXISTS "ar_update_admin" ON agent_reports;
CREATE POLICY "ar_update_admin" ON agent_reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role_key = 'admin'
    )
  );

DROP POLICY IF EXISTS "ar_delete_admin" ON agent_reports;
CREATE POLICY "ar_delete_admin" ON agent_reports
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role_key = 'admin'
    )
  );

-- 2. daily_reports "Kendi raporu güncelleyebilir" policy'si
DROP POLICY IF EXISTS "Kendi raporu güncelleyebilir" ON daily_reports;
CREATE POLICY "Kendi raporu güncelleyebilir" ON daily_reports
  FOR UPDATE USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role_key = ANY (ARRAY['admin', 'santiye_sefi'])
    )
  );

-- Artık role kolonu güvenle drop edilebilir
ALTER TABLE profiles DROP COLUMN IF EXISTS role;

-- role_key'e FK ekle
ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_key_fkey
  FOREIGN KEY (role_key) REFERENCES roles(key)
  ON UPDATE CASCADE;

