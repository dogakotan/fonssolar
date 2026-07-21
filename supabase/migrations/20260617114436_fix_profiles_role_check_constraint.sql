
-- Eski constraint'i kaldır (role kolonu serbest metin olacak)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

