
INSERT INTO public.profiles (id, email, full_name, role, role_key)
VALUES (
  '84cce00a-487a-47e9-9b6d-e41bc62bcaf5',
  'admin@fonssolar.com',
  'Admin',
  'Sistem Yöneticisi',
  'admin'
)
ON CONFLICT (id) DO UPDATE SET role_key = 'admin', email = 'admin@fonssolar.com';

