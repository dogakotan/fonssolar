
-- 1) allow the new role value while both old+new coexist during migration
ALTER TABLE profiles DROP CONSTRAINT profiles_role_key_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_key_check
  CHECK (role_key = ANY (ARRAY[
    'admin','muhasebe','santiye_sefi','muhendis','koordinator','satin_alma_uzmani',
    'proje_koordinatoru','proje_kurulum_sefi','elektrik_sefi','mekanik_sef','isg_sorumlusu',
    'kalite_kontrol_sefi','lojistik_tedarik','enh_sorumlusu','operasyon_sorumlusu',
    'evrak_takip','maliyet_kontrolcu','is_makinesi_operator','proje_tasarim_sorumlusu',
    'proje_yoneticisi'
  ]));

-- 2) new role: per-project (cross_project=false, is_manager=false -> scoped via profiles.project_id /
--    user_project_access, same mechanism as santiye_sefi)
INSERT INTO roles (key, display_name, description, is_manager, cross_project)
VALUES (
  'proje_yoneticisi',
  'Proje Yöneticisi',
  'Onaylanan satın alma taleplerinde tedarikçi seçimi ve satın alma/teslimat takibi; kendi projesinin satın alma ve fatura sürecini izler.',
  false, false
);

-- 3) move the existing (test) satin_alma_uzmani profile onto the new role so nothing is orphaned
UPDATE profiles
SET role_key = 'proje_yoneticisi',
    project_id = COALESCE(project_id, 'test-izmir-ges-2026')
WHERE role_key = 'satin_alma_uzmani';

-- 4) retire satin_alma_uzmani: no longer an allowed value, then drop the role row
ALTER TABLE profiles DROP CONSTRAINT profiles_role_key_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_key_check
  CHECK (role_key = ANY (ARRAY[
    'admin','muhasebe','santiye_sefi','muhendis','koordinator',
    'proje_koordinatoru','proje_kurulum_sefi','elektrik_sefi','mekanik_sef','isg_sorumlusu',
    'kalite_kontrol_sefi','lojistik_tedarik','enh_sorumlusu','operasyon_sorumlusu',
    'evrak_takip','maliyet_kontrolcu','is_makinesi_operator','proje_tasarim_sorumlusu',
    'proje_yoneticisi'
  ]));

DELETE FROM roles WHERE key = 'satin_alma_uzmani';

-- 5) RLS: drop satin_alma_uzmani from blanket cross-project clauses (role is gone, and the
--    project-scoped clauses already in these same policies cover proje_yoneticisi via profiles.project_id)
ALTER POLICY projects_select ON projects
  USING (
    (get_my_role() = 'admin')
    OR (EXISTS (SELECT 1 FROM user_project_access upa WHERE upa.user_id = auth.uid() AND upa.project_id = projects.id))
    OR (id = (SELECT profiles.project_id FROM profiles WHERE profiles.id = auth.uid()))
    OR (get_my_role() = 'muhasebe')
  );

ALTER POLICY purchase_requests_select ON purchase_requests
  USING (
    (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role_key = ANY (ARRAY['admin','muhasebe'])))
    OR (auth.uid() = requested_by)
    OR (project_id IN (SELECT p.project_id FROM profiles p WHERE p.id = auth.uid() AND p.project_id IS NOT NULL))
  );

