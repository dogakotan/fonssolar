
-- Mevcut progress_daily kayıtlarını temizle (Kiris ve Asik)
DELETE FROM progress_daily WHERE item_id IN (
  'dad53fb2-839c-46cd-9e35-3cb14673e21e',
  '87a184b8-ef0e-4b9d-a9d6-9ebe362c82b0'
);

-- Kiris Montaji — 20 günde 320 adet kümülatif
INSERT INTO progress_daily (id, item_id, report_id, qty_added, note) VALUES
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000001', 15, 'İlk gün kurulum başladı'),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000002', 18, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000003', 12, 'Parçalı bulutlu yavaş ilerleme'),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000004', 22, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000005', 20, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000006', 25, 'Hafta başı hızlı tempo'),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000007', 0, 'Yağmurlu çalışma yapılamadı'),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000008', 24, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000009', 22, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000010', 20, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000011', 23, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000012', 25, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000013', 21, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000014', 0, 'Fırtına - çalışma yok'),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'b1000001-0000-0000-0000-000000000015', 18, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'a1000001-0000-0000-0000-000000000001', 22, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'a1000001-0000-0000-0000-000000000002', 8, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'a1000001-0000-0000-0000-000000000003', 5, NULL),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'a1000001-0000-0000-0000-000000000004', 0, 'Yağmurlu'),
  (gen_random_uuid(), 'dad53fb2-839c-46cd-9e35-3cb14673e21e', 'a1000001-0000-0000-0000-000000000005', 20, NULL);

UPDATE progress_items SET total_progress = 320 WHERE id = 'dad53fb2-839c-46cd-9e35-3cb14673e21e';

-- Rok Delgi — 20-24 Haziran arası başladı
DO $$
DECLARE
  rok_item_id uuid;
BEGIN
  SELECT id INTO rok_item_id FROM progress_items 
  WHERE project_id = 'test-izmir-ges-2026' AND name ILIKE '%Rok%' LIMIT 1;

  IF rok_item_id IS NOT NULL THEN
    DELETE FROM progress_daily WHERE item_id = rok_item_id;
    INSERT INTO progress_daily (id, item_id, report_id, qty_added, note) VALUES
      (gen_random_uuid(), rok_item_id, 'a1000001-0000-0000-0000-000000000001', 50, 'Rok delgi başladı'),
      (gen_random_uuid(), rok_item_id, 'a1000001-0000-0000-0000-000000000002', 45, NULL),
      (gen_random_uuid(), rok_item_id, 'a1000001-0000-0000-0000-000000000003', 30, NULL),
      (gen_random_uuid(), rok_item_id, 'a1000001-0000-0000-0000-000000000004', 0, 'Yağmurlu'),
      (gen_random_uuid(), rok_item_id, 'a1000001-0000-0000-0000-000000000005', 55, NULL);
    UPDATE progress_items SET total_progress = 180 WHERE id = rok_item_id;
  END IF;
END $$;

-- Kolon Çakım — 1 Temmuz başlıyor ama proje hızlı ilerlediğinden birkaç günde başladı
DO $$
DECLARE
  kolon_item_id uuid;
BEGIN
  SELECT id INTO kolon_item_id FROM progress_items 
  WHERE project_id = 'test-izmir-ges-2026' AND name ILIKE '%Kolon%' LIMIT 1;

  IF kolon_item_id IS NOT NULL THEN
    DELETE FROM progress_daily WHERE item_id = kolon_item_id;
    INSERT INTO progress_daily (id, item_id, report_id, qty_added, note) VALUES
      (gen_random_uuid(), kolon_item_id, 'a1000001-0000-0000-0000-000000000004', 0, 'Yağmurlu'),
      (gen_random_uuid(), kolon_item_id, 'a1000001-0000-0000-0000-000000000005', 120, 'Kolon çakım başladı');
    UPDATE progress_items SET total_progress = 120 WHERE id = kolon_item_id;
  END IF;
END $$;

