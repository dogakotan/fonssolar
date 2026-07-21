
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_key_check;

ALTER TABLE profiles ADD CONSTRAINT profiles_role_key_check CHECK (role_key = ANY (ARRAY[
  'admin',
  'muhasebe',
  'santiye_sefi',
  'muhendis',
  'koordinator',
  'satin_alma_uzmani',
  'proje_koordinatoru',
  'proje_kurulum_sefi',
  'elektrik_sefi',
  'mekanik_sef',
  'isg_sorumlusu',
  'kalite_kontrol_sefi',
  'lojistik_tedarik',
  'enh_sorumlusu',
  'operasyon_sorumlusu',
  'evrak_takip',
  'maliyet_kontrolcu',
  'is_makinesi_operator',
  'proje_tasarim_sorumlusu'
]));

