
-- ============================================================
-- 1. Bağlantı tablosu: critical_path_predecessors
--    Her satır tek bir (aktivite → önceki aktivite) ilişkisini tutar
--    1NF: virgülle ayrılmış predecessor_codes kaldırılır
-- ============================================================
CREATE TABLE IF NOT EXISTS critical_path_predecessors (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES critical_path_items(id) ON DELETE CASCADE,
  predecessor_id  uuid NOT NULL REFERENCES critical_path_items(id) ON DELETE CASCADE,
  UNIQUE (item_id, predecessor_id)
);

-- RLS aç
ALTER TABLE critical_path_predecessors ENABLE ROW LEVEL SECURITY;

-- Tüm giriş yapmış kullanıcılar okuyabilir
CREATE POLICY "cpath_pred_select" ON critical_path_predecessors
  FOR SELECT USING (auth.role() = 'authenticated');

-- Admin, koordinatör ve proje kurulum şefi yazabilir
CREATE POLICY "cpath_pred_insert" ON critical_path_predecessors
  FOR INSERT WITH CHECK (get_my_role() IN ('admin', 'proje_koordinatoru', 'proje_kurulum_sefi'));

CREATE POLICY "cpath_pred_update" ON critical_path_predecessors
  FOR UPDATE USING (get_my_role() IN ('admin', 'proje_koordinatoru', 'proje_kurulum_sefi'));

CREATE POLICY "cpath_pred_delete" ON critical_path_predecessors
  FOR DELETE USING (get_my_role() = 'admin');

-- ============================================================
-- 2. Mevcut verileri bağlantı tablosuna taşı
--    "C8,C10" → iki ayrı satır
-- ============================================================
INSERT INTO critical_path_predecessors (item_id, predecessor_id)
SELECT 
  child.id   AS item_id,
  parent.id  AS predecessor_id
FROM critical_path_items child
-- predecessor_codes'u satıra böl
CROSS JOIN LATERAL unnest(string_to_array(child.predecessor_codes, ',')) AS pred_code
JOIN critical_path_items parent
  ON parent.project_id = child.project_id
  AND parent.path_code = trim(pred_code)
WHERE child.predecessor_codes IS NOT NULL;

-- ============================================================
-- 3. Artık gereksiz olan serbest metin kolonu kaldır
-- ============================================================
ALTER TABLE critical_path_items DROP COLUMN predecessor_codes;

-- ============================================================
-- 4. responsible → responsible_role: roles.key FK ekle
--    Mevcut serbest metin değerlerini role_key'e map et
-- ============================================================
ALTER TABLE project_tasks
  ADD COLUMN responsible_role text REFERENCES roles(key) ON DELETE SET NULL;

ALTER TABLE critical_path_items
  ADD COLUMN responsible_role text REFERENCES roles(key) ON DELETE SET NULL;

-- Mevcut responsible değerlerini bilinen role_key'lere eşle
UPDATE project_tasks SET responsible_role = CASE responsible
  WHEN 'Santiye Sefi'  THEN 'santiye_sefi'
  WHEN 'Mek. Sef'      THEN 'mekanik_sef'
  WHEN 'Elk. Sef'      THEN 'elektrik_sefi'
  WHEN 'Proje Koor.'   THEN 'proje_koordinatoru'
  WHEN 'Operasyon'     THEN 'operasyon_sorumlusu'
  WHEN 'Lojistik'      THEN 'lojistik_tedarik'
  ELSE NULL
END
WHERE project_id = 'adana-ges-001';

UPDATE critical_path_items SET responsible_role = CASE responsible
  WHEN 'Santiye Sefi'  THEN 'santiye_sefi'
  WHEN 'Mek. Sef'      THEN 'mekanik_sef'
  WHEN 'Elk. Sef'      THEN 'elektrik_sefi'
  WHEN 'Proje Koor.'   THEN 'proje_koordinatoru'
  WHEN 'Operasyon'     THEN 'operasyon_sorumlusu'
  ELSE NULL
END
WHERE project_id = 'adana-ges-001';

-- ============================================================
-- 5. equipment → equipment_notes: amacını netleştir (rename)
-- ============================================================
ALTER TABLE project_tasks
  RENAME COLUMN equipment TO equipment_notes;

