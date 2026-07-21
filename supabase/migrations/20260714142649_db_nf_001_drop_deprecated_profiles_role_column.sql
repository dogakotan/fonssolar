
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  INSERT INTO public.profiles (id, email, full_name, role_key, project_id)
  VALUES (
    new.id,
    new.email,
    v_full_name,
    v_role_key,
    v_project_id
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
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
$function$;

ALTER TABLE public.profiles DROP COLUMN role;

