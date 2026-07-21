
-- Mevcut select politikasını düşür
DROP POLICY IF EXISTS "tickets_select" ON tickets;

-- Yeni: admin role_key'i olan herkes tüm ticketları görür
-- project_id'si olan kullanıcılar kendi projesinin ticketlarını görür
CREATE POLICY "tickets_select" ON tickets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role_key = 'admin'
    )
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.project_id = tickets.project_id
    )
    OR auth.uid() = created_by
  );

