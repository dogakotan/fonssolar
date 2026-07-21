
-- Bugünkü rapor
INSERT INTO public.daily_reports (id, project_id, report_date, weather, notes)
VALUES (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'kaptan-usak-ges',
  CURRENT_DATE,
  'açık',
  'Saha çalışmaları normal seyrinde devam ediyor.'
);

-- Personel durumu
INSERT INTO public.personnel_logs (report_id, shift, idari, mekanik, elektrik, yevmiyeci) VALUES
('a1b2c3d4-0000-0000-0000-000000000001', 'mühendis', 1, 0, 0, 0),
('a1b2c3d4-0000-0000-0000-000000000001', 'usta',     1, 0, 1, 0),
('a1b2c3d4-0000-0000-0000-000000000001', 'işçi',     0, 2, 3, 0);

-- İş makinesi durumu
INSERT INTO public.machinery_logs (report_id, machine_type, count, status) VALUES
('a1b2c3d4-0000-0000-0000-000000000001', 'vinç',      0, 'beklemede'),
('a1b2c3d4-0000-0000-0000-000000000001', 'jcb',       1, 'çalışıyor'),
('a1b2c3d4-0000-0000-0000-000000000001', 'ekskavatör',0, 'beklemede'),
('a1b2c3d4-0000-0000-0000-000000000001', 'loader',    0, 'beklemede'),
('a1b2c3d4-0000-0000-0000-000000000001', 'gayk_delici',0,'beklemede'),
('a1b2c3d4-0000-0000-0000-000000000001', 'rok_delim', 0, 'beklemede'),
('a1b2c3d4-0000-0000-0000-000000000001', 'kamyon',    0, 'beklemede'),
('a1b2c3d4-0000-0000-0000-000000000001', 'traktör',   1, 'çalışıyor');

-- Bugün yapılan işler
INSERT INTO public.daily_tasks (report_id, type, description, order_index) VALUES
('a1b2c3d4-0000-0000-0000-000000000001', 'done', 'Panel montaj çelik konstrüksiyonu',         1),
('a1b2c3d4-0000-0000-0000-000000000001', 'done', 'Güneş paneli kurulumu (faz 1 — 3.000 panel)',2),
('a1b2c3d4-0000-0000-0000-000000000001', 'done', 'Güneş paneli kurulumu (faz 1 - 3000 panel)',3);

-- Yarın yapılacak işler
INSERT INTO public.daily_tasks (report_id, type, description, order_index) VALUES
('a1b2c3d4-0000-0000-0000-000000000001', 'planned', 'İnvertör ve trafo montajı',      1),
('a1b2c3d4-0000-0000-0000-000000000001', 'planned', 'DC kablo döşeme ve bağlantılar', 2),
('a1b2c3d4-0000-0000-0000-000000000001', 'planned', 'AG/OG şalt tesisi kurulumu',     3),
('a1b2c3d4-0000-0000-0000-000000000001', 'planned', 'SCADA ve izleme sistemi kurulumu',4),
('a1b2c3d4-0000-0000-0000-000000000001', 'planned', 'Topraklama hattı devam',         5),
('a1b2c3d4-0000-0000-0000-000000000001', 'planned', 'Kablo kanal temizliği',          6);

