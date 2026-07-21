
-- =============================================
-- 1. user_project_access tablosu
-- =============================================
CREATE TABLE IF NOT EXISTS user_project_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  access_level text NOT NULL DEFAULT 'tam_erisim' 
    CHECK (access_level IN ('tam_erisim', 'sadece_goruntule')),
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, project_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_upa_user_id ON user_project_access(user_id);
CREATE INDEX IF NOT EXISTS idx_upa_project_id ON user_project_access(project_id);

-- RLS
ALTER TABLE user_project_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY upa_select_admin ON user_project_access
  FOR SELECT USING (get_my_role() = 'admin');

CREATE POLICY upa_select_own ON user_project_access
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY upa_insert_admin ON user_project_access
  FOR INSERT WITH CHECK (get_my_role() = 'admin');

CREATE POLICY upa_update_admin ON user_project_access
  FOR UPDATE USING (get_my_role() = 'admin');

CREATE POLICY upa_delete_admin ON user_project_access
  FOR DELETE USING (get_my_role() = 'admin');

-- =============================================
-- 2. Mevcut profillerdeki project_id'yi user_project_access'e migrate et
-- =============================================
INSERT INTO user_project_access (user_id, project_id, access_level)
SELECT id, project_id, 'tam_erisim'
FROM profiles
WHERE project_id IS NOT NULL
ON CONFLICT (user_id, project_id) DO NOTHING;

-- =============================================
-- 3. handle_new_user trigger'ını güncelle
--    → raw_user_meta_data'dan project_ids (array) okusun
--    → user_project_access'e otomatik eklesin
-- =============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_role_key text;
  v_full_name text;
  v_project_id text;
  v_project_ids jsonb;
  v_pid text;
BEGIN
  -- Rol belirle
  v_role_key := coalesce(
    new.raw_user_meta_data->>'role_key',
    CASE
      WHEN new.email ILIKE '%muhasebe%' THEN 'muhasebe'
      WHEN new.email ILIKE '%admin%' THEN 'admin'
      WHEN new.email ILIKE '%satin%' THEN 'satin_alma_uzmani'
      WHEN new.email ILIKE '%tedarik%' THEN 'satin_alma_uzmani'
      WHEN new.email ILIKE '%santiye%' THEN 'santiye_sefi'
      ELSE 'santiye_sefi'
    END
  );

  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    split_part(new.email, '@', 1)
  );

  v_project_id := new.raw_user_meta_data->>'project_id';

  -- profiles tablosuna ekle/güncelle
  INSERT INTO public.profiles (id, email, full_name, role, role_key, project_id)
  VALUES (
    new.id,
    new.email,
    v_full_name,
    coalesce(new.raw_user_meta_data->>'role', v_role_key),
    v_role_key,
    v_project_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    role = EXCLUDED.role,
    role_key = EXCLUDED.role_key,
    project_id = EXCLUDED.project_id;

  -- user_project_access: tekil project_id varsa ekle
  IF v_project_id IS NOT NULL THEN
    INSERT INTO user_project_access (user_id, project_id, access_level)
    VALUES (new.id, v_project_id, 'tam_erisim')
    ON CONFLICT (user_id, project_id) DO NOTHING;
  END IF;

  -- user_project_access: çoklu project_ids array'i varsa ekle
  -- meta_data'da project_ids: ["proje-1", "proje-2"] şeklinde gönderilirse
  v_project_ids := new.raw_user_meta_data->'project_ids';
  IF v_project_ids IS NOT NULL AND jsonb_typeof(v_project_ids) = 'array' THEN
    FOR v_pid IN SELECT jsonb_array_elements_text(v_project_ids)
    LOOP
      INSERT INTO user_project_access (user_id, project_id, access_level)
      VALUES (new.id, v_pid, 'tam_erisim')
      ON CONFLICT (user_id, project_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN new;
END;
$$;

-- =============================================
-- 4. projects RLS — kullanıcı sadece atandığı projeleri görsün
-- =============================================
DROP POLICY IF EXISTS allow_all_projects ON projects;

-- Admin her şeyi görür
CREATE POLICY projects_admin ON projects
  FOR ALL USING (get_my_role() = 'admin');

-- Kullanıcı sadece user_project_access'teki projeleri görür
CREATE POLICY projects_user_access ON projects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_project_access upa
      WHERE upa.user_id = auth.uid()
        AND upa.project_id = projects.id
    )
  );

-- =============================================
-- 5. Diğer tablolarda proje bazlı erişim — helper function
-- =============================================
CREATE OR REPLACE FUNCTION user_has_project_access(p_project_id text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_project_access
    WHERE user_id = auth.uid()
      AND project_id = p_project_id
  ) OR get_my_role() = 'admin';
$$;

-- =============================================
-- 6. project_tasks, progress_items, project_risks RLS güncelle
-- =============================================
DROP POLICY IF EXISTS project_tasks_select ON project_tasks;
CREATE POLICY project_tasks_select ON project_tasks
  FOR SELECT USING (user_has_project_access(project_id));

DROP POLICY IF EXISTS "Herkes okuyabilir" ON progress_items;
CREATE POLICY progress_items_select ON progress_items
  FOR SELECT USING (user_has_project_access(project_id));

DROP POLICY IF EXISTS authenticated_select_risks ON project_risks;
CREATE POLICY project_risks_select ON project_risks
  FOR SELECT USING (user_has_project_access(project_id));

