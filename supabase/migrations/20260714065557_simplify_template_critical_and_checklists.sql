
-- 1) Kritik görev işareti artık project_tasks üzerinde
ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS is_critical boolean NOT NULL DEFAULT false;

-- 2) Ayrı Kritik Yol tablolarını kaldır (yalnızca test verisi vardı: test-izmir-ges-2026, 15 satır)
DROP TABLE IF EXISTS critical_path_predecessors CASCADE;
DROP TABLE IF EXISTS critical_path_items CASCADE;

-- 3) Kullanılmayan checklist tablolarını kaldır (0 satır, hiçbir gerçek projede veri yok)
DROP TABLE IF EXISTS mechanical_checklist CASCADE;
DROP TABLE IF EXISTS electrical_checklist CASCADE;

-- 4) Kategori Ağırlıkları'nı kullanıcının belirlediği kanonik 10 kaleme sabitle (mevcut 2 test projesi normalize edilir)
DELETE FROM project_category_weights WHERE project_id IN ('test-izmir-ges-2026','test-kayseri-develi-ges');

INSERT INTO project_category_weights (project_id, category, weight_pct)
SELECT p.id, w.category::task_category, w.weight_pct
FROM (VALUES ('test-izmir-ges-2026'), ('test-kayseri-develi-ges')) AS p(id)
CROSS JOIN (VALUES
  ('kolon_montaji', 10),
  ('kiris_montaji', 10),
  ('asik_montaji', 10),
  ('panel_montaji', 10),
  ('elektrik_dc', 10),
  ('elektrik_ac', 10),
  ('elektrik_og', 10),
  ('kosk_trafo', 5),
  ('topraklama', 5),
  ('devreye_alma', 10)
) AS w(category, weight_pct);

