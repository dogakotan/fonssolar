
-- critical_path_items: ADANA-GES-2026 kritik yol (15 aktivite)
INSERT INTO critical_path_items (project_id, path_code, activity_name, predecessor_codes, planned_start, planned_end, is_critical, status, responsible, notes) VALUES
('adana-ges-001', 'C1',  'ENH Kurulumu ve TEDAS Onayi',  NULL,       '2026-07-01', '2026-12-31', true, 'beklemede', 'Proje Koor.', 'Tum sistemi etkiler'),
('adana-ges-001', 'C2',  'Arazi Tesviye',                NULL,       '2026-07-01', '2026-07-31', true, 'beklemede', 'Santiye Sefi','Mekanik bolum oncesi'),
('adana-ges-001', 'C3',  'Kolon Noktalama',              'C2',       '2026-08-01', '2026-08-16', true, 'beklemede', 'Mek. Sef',    NULL),
('adana-ges-001', 'C4',  'Rok Delgi',                    'C3',       '2026-08-10', '2026-09-05', true, 'beklemede', 'Mek. Sef',    NULL),
('adana-ges-001', 'C5',  'Kolon Cakim',                  'C4',       '2026-08-27', '2026-09-25', true, 'beklemede', 'Mek. Sef',    NULL),
('adana-ges-001', 'C6',  'Kiris Montaji',                'C5',       '2026-09-15', '2026-10-15', true, 'beklemede', 'Mek. Sef',    NULL),
('adana-ges-001', 'C7',  'Asik Montaji',                 'C6',       '2026-10-01', '2026-10-31', true, 'beklemede', 'Mek. Sef',    NULL),
('adana-ges-001', 'C8',  'Panel Montaji',                'C7',       '2026-10-10', '2026-10-31', true, 'beklemede', 'Mek. Sef',    NULL),
('adana-ges-001', 'C9',  'OG Kazi ve XLPE Kablo',        'C2',       '2026-08-01', '2026-09-20', true, 'beklemede', 'Elk. Sef',    NULL),
('adana-ges-001', 'C10', 'Kosk ve Trafo Montaji',        'C9',       '2026-09-01', '2026-10-15', true, 'beklemede', 'Elk. Sef',    NULL),
('adana-ges-001', 'C11', 'Inverter Devreye Alma',        'C8,C10',   '2026-11-01', '2026-11-15', true, 'beklemede', 'Operasyon',   NULL),
('adana-ges-001', 'C12', 'SCADA Islemleri',              'C11',      '2026-11-01', '2026-11-10', true, 'beklemede', 'Operasyon',   NULL),
('adana-ges-001', 'C13', 'Sistem Testleri',              'C12',      '2026-11-01', '2026-11-30', true, 'beklemede', 'Operasyon',   NULL),
('adana-ges-001', 'C14', 'EDAS Toroslar Kabul Testleri', 'C13',      '2026-12-01', '2026-12-20', true, 'beklemede', 'Operasyon',   'EK-5'),
('adana-ges-001', 'C15', 'Ticari Uretim Gecisi',         'C14',      '2026-12-21', '2026-12-31', true, 'beklemede', 'Proje Koor.', 'Hedef');

