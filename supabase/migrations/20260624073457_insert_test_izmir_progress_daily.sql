-- Kiriş Montajı (id: dad53fb2) günlük ilerleme
-- Toplam 320 adet tamamlandı, günlere dağıtalım
INSERT INTO progress_daily (item_id, report_id, qty_added, note) VALUES
('dad53fb2-839c-46cd-9e35-3cb14673e21e','b1000001-0000-0000-0000-000000000009',20,'Kiriş montajı başladı'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','b1000001-0000-0000-0000-000000000010',30,'Kiriş montajı devam'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','b1000001-0000-0000-0000-000000000011',40,'Kiriş montajı hız kazandı'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','b1000001-0000-0000-0000-000000000012',35,'Normal tempo'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','b1000001-0000-0000-0000-000000000013',40,'Verimli gün'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','b1000001-0000-0000-0000-000000000015',30,'Fırtına sonrası telafi'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','a1000001-0000-0000-0000-000000000001',35,'Devam'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','a1000001-0000-0000-0000-000000000002',40,'Hız kazandı'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','a1000001-0000-0000-0000-000000000003',30,'Normal tempo'),
('dad53fb2-839c-46cd-9e35-3cb14673e21e','a1000001-0000-0000-0000-000000000005',20,'Yağmur sonrası');

-- Rok Delgi (progress_items id: non-dashboard ama S-curve için ekleyelim)
-- S-curve gerçekleşen çizgisi için genel ilerleme verisini progress_daily'e ekle
-- Kolon Cakim progress_items id
INSERT INTO progress_daily (item_id, report_id, qty_added, note) VALUES
('87a184b8-ef0e-4b9d-a9d6-9ebe362c82b0',  'b1000001-0000-0000-0000-000000000001', 0, 'Henüz başlamadı');

