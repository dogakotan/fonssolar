-- Aktif task'lar için progress_items oluştur ve task_id bağla
-- M0 - Santiye Mobilizasyonu
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000001','test-izmir-ges-2026','mobilizasyon','Santiye Mobilizasyonu','%',100,100,10,'0157b67a-7960-4d42-b7d0-dd425f59cb20');

-- M0a - Arazi Tesviye
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000002','test-izmir-ges-2026','mobilizasyon','Arazi Tesviye','%',100,100,11,'9c1d5589-3d69-425c-9cfc-1fc3a73b6feb');

-- M0b - Ulasim Yollari
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000003','test-izmir-ges-2026','mobilizasyon','Ulasim Yollari','%',100,100,12,'5f4dbd13-3ef7-4c01-9525-b62a1f8f9797');

-- M0c - Isletme Binasi
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000004','test-izmir-ges-2026','mobilizasyon','Isletme Binasi','%',100,80,13,'714747b7-faa8-41ab-afdc-13430008f113');

-- M0d - Depo Alani
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000005','test-izmir-ges-2026','mobilizasyon','Depo Alani','%',100,75,14,'f004315d-63a5-4216-b486-e7b190d9645b');

-- M0e - Telcit ve Guvenlik
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000006','test-izmir-ges-2026','mobilizasyon','Telcit ve Guvenlik','%',100,60,15,'fc66c139-adf7-45ae-aeb4-f12ed36129ed');

-- M1 - Kolon Noktalama
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000007','test-izmir-ges-2026','mekanik','Kolon Noktalama','adet',3200,3200,16,'c01e2358-d3e0-4887-8012-6bae0ff63ea6');

-- M2 - Rok Delgi
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000008','test-izmir-ges-2026','mekanik','Rok Delgi Islemi','adet',3200,2080,17,'d2972a32-cdfb-4669-8031-30bf169e2673');

-- M3 - Kolon Cakim
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000009','test-izmir-ges-2026','mekanik','Kolon Cakim Islemi','adet',3200,640,18,'9ed78efb-ac8d-41cd-ac71-524dd9a6132a');

-- N1 - ENH
INSERT INTO progress_items (id, project_id, category, name, unit, target_qty, total_progress, order_index, task_id)
VALUES ('c0000001-0000-0000-0000-000000000010','test-izmir-ges-2026','enh','ENH Projelendirme','%',100,30,19,'4a323abc-92cc-4d5c-83b3-c4d3a242dd73');

