
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_role_key text;
BEGIN
  -- metadata'da role_key varsa kullan, yoksa email'e göre tahmin et
  v_role_key := COALESCE(
    NEW.raw_user_meta_data->>'role_key',
    CASE 
      WHEN NEW.email ILIKE '%muhasebe%' THEN 'muhasebe'
      WHEN NEW.email ILIKE '%admin%'    THEN 'admin'
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
    SET email = EXCLUDED.email,
        role_key = EXCLUDED.role_key;
  
  RETURN NEW;
END;
$$;

