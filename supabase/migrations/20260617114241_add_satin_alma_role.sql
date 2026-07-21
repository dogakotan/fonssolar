
-- Role constraint'e satin_alma_uzmani ekle
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_key_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_key_check
  CHECK (role_key IN ('admin', 'muhasebe', 'santiye_sefi', 'muhendis', 'koordinator', 'satin_alma_uzmani'));

-- Trigger'ı da güncelle
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role_key text;
BEGIN
  v_role_key := COALESCE(
    NEW.raw_user_meta_data->>'role_key',
    CASE
      WHEN NEW.email ILIKE '%muhasebe%'    THEN 'muhasebe'
      WHEN NEW.email ILIKE '%admin%'       THEN 'admin'
      WHEN NEW.email ILIKE '%satin%'       THEN 'satin_alma_uzmani'
      WHEN NEW.email ILIKE '%tedarik%'     THEN 'satin_alma_uzmani'
      ELSE 'santiye_sefi'
    END
  );

  INSERT INTO public.profiles (id, email, full_name, role, role_key)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', v_role_key),
    v_role_key
  )
  ON CONFLICT (id) DO UPDATE
    SET email    = EXCLUDED.email,
        role_key = EXCLUDED.role_key;

  RETURN NEW;
END;
$$;

-- Purchase requests RLS'ini güncelle — satin_alma_uzmani da ekleyebilsin
DROP POLICY IF EXISTS "PR ekleme" ON public.purchase_requests;
CREATE POLICY "PR ekleme" ON public.purchase_requests
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator','satin_alma_uzmani')
  );

DROP POLICY IF EXISTS "PR okuma" ON public.purchase_requests;
CREATE POLICY "PR okuma" ON public.purchase_requests
  FOR SELECT USING (
    public.get_my_role() IN ('admin','muhasebe','santiye_sefi','muhendis','koordinator','satin_alma_uzmani')
  );

DROP POLICY IF EXISTS "PR item okuma" ON public.purchase_request_items;
CREATE POLICY "PR item okuma" ON public.purchase_request_items
  FOR SELECT USING (
    public.get_my_role() IN ('admin','muhasebe','santiye_sefi','muhendis','koordinator','satin_alma_uzmani')
  );

DROP POLICY IF EXISTS "PR item ekleme" ON public.purchase_request_items;
CREATE POLICY "PR item ekleme" ON public.purchase_request_items
  FOR INSERT WITH CHECK (
    public.get_my_role() IN ('admin','santiye_sefi','muhendis','koordinator','satin_alma_uzmani')
  );

