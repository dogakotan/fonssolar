
DELETE FROM budget_lines WHERE project_id = 'test-izmir-ges-2026';

INSERT INTO budget_lines (id, project_id, category, name, planned_amount, order_index) VALUES
  (gen_random_uuid(), 'test-izmir-ges-2026', 'panel',        'Güneş Paneli (13.300 adet 620Wp)',          18620000, 1),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'inverter',     'Huawei İnvertör (SUN2000-330KTL x25)',       6250000, 2),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'mekanik',      'Taşıyıcı Sistem (Profil + Kiriş + Aşık)',   4800000, 3),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'elektrik_dc',  'DC Kablo ve Aksesuarlar (75.000 mt)',        1125000, 4),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'elektrik_ac',  'AC Kablo ve Aksesuarlar',                    980000, 5),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'elektrik_og',  'OG Kablo + Hücre + Trafo (5 TM)',           3750000, 6),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'enh',          'ENH Hattı Yapımı',                          2200000, 7),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'iscilik',      'Montaj İşçilik (Mekanik)',                  1450000, 8),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'iscilik',      'Montaj İşçilik (Elektrik)',                 1200000, 9),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'altyapi',      'Arazi Tesviye ve Yol Yapımı',                850000, 10),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'altyapi',      'Şantiye Mobilizasyonu',                      320000, 11),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'izin',         'Lisans ve İzin Masrafları',                  450000, 12),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'denetim',      'Proje Yönetimi ve Mühendislik',              680000, 13),
  (gen_random_uuid(), 'test-izmir-ges-2026', 'diger',        'Beklenmeyen Giderler (%3)',                 1287750, 14);

