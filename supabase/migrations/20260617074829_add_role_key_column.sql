
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_key text NOT NULL DEFAULT 'santiye_sefi'
  CHECK (role_key IN ('admin', 'muhasebe', 'santiye_sefi', 'muhendis', 'koordinator'));

UPDATE public.profiles SET role_key = 'santiye_sefi';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Herkes kendi profilini okur" ON public.profiles;
DROP POLICY IF EXISTS "Admin tüm profilleri okur" ON public.profiles;
DROP POLICY IF EXISTS "Admin profil ekler" ON public.profiles;
DROP POLICY IF EXISTS "Admin profil günceller" ON public.profiles;

CREATE POLICY "Herkes kendi profilini okur" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admin tüm profilleri okur" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role_key = 'admin')
  );

CREATE POLICY "Admin profil ekler" ON public.profiles
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role_key = 'admin')
  );

CREATE POLICY "Admin profil günceller" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid() AND p2.role_key = 'admin')
  );

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, role_key)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'Kullanıcı'),
    COALESCE(NEW.raw_user_meta_data->>'role_key', 'santiye_sefi')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

