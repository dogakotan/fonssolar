
-- ============================================================
-- 1. progress_items.category kısıtını genişlet
--    task_category enum'uyla hizala
-- ============================================================
ALTER TABLE progress_items
  DROP CONSTRAINT IF EXISTS progress_items_category_check;

ALTER TABLE progress_items
  ADD CONSTRAINT progress_items_category_check
  CHECK (category = ANY (ARRAY[
    'mekanik', 'elektrik', 'inşaat', 'diğer',
    'elektrik_dc', 'elektrik_ac', 'elektrik_og',
    'mobilizasyon', 'topraklama', 'enh', 'devreye_alma'
  ]));

-- ============================================================
-- 2. Adana için progress_items ekle (task_id FK ile bağlı)
-- ============================================================
INSERT INTO progress_items (project_id, task_id, category, name, unit, target_qty, total_progress, order_index)
SELECT 'adana-ges-001', pt.id, pi_data.category, pi_data.name, pi_data.unit, pi_data.target_qty, 0, pi_data.ord
FROM (VALUES
  ('M1',  'mekanik',      'Kolon Noktalama',              'adet',      0,       1),
  ('M2',  'mekanik',      'Rok Delgi',                    'adet',      0,       2),
  ('M3',  'mekanik',      'Kolon Cakim',                  'adet',      0,       3),
  ('M4',  'mekanik',      'Kiris Montaji',                'adet',      824,     4),
  ('M5',  'mekanik',      'Asik Montaji',                 'adet',      10712,   5),
  ('M6',  'mekanik',      'Panel Montaji',                'adet',      21425,   6),
  ('E1',  'elektrik_dc',  'DC Kablo Kazisi',              'mt',        1200,    7),
  ('E2',  'elektrik_dc',  'DC Kablo Cekimi',              'mt',        120000,  8),
  ('E4',  'elektrik_dc',  'Konnekter ve Etiket',          'adet_cift', 21425,   9),
  ('E6',  'elektrik_ac',  'AC Kablo Kazisi',              'mt',        2500,    10),
  ('E7',  'elektrik_ac',  'AC Kablo Cekimi',              'mt',        10400,   11),
  ('E9',  'elektrik_ac',  'Inverter ve GES Pano Montaji', 'adet',      39,      12),
  ('E11', 'elektrik_og',  'OG Kablo Kazisi',              'mt',        4520,    13),
  ('E12', 'elektrik_og',  'OG XLPE Kablo Cekimi',         'mt',        4520,    14),
  ('E15', 'elektrik_og',  'OG Hucre Montaji',             'adet',      18,      15),
  ('T1',  'topraklama',   'Topraklama Kazisi',            'mt',        5000,    16)
) AS pi_data(task_code, category, name, unit, target_qty, ord)
JOIN project_tasks pt
  ON pt.project_id = 'adana-ges-001'
  AND pt.task_code = pi_data.task_code;

