-- Daily Reports (son 5 gün)
INSERT INTO daily_reports (id, project_id, report_date, weather, notes) VALUES
('a1000001-0000-0000-0000-000000000001','test-izmir-ges-2026','2026-06-20','açık','Rok delgi çalışmaları devam etti'),
('a1000001-0000-0000-0000-000000000002','test-izmir-ges-2026','2026-06-21','açık','Rok delgi 3. bölge tamamlandı'),
('a1000001-0000-0000-0000-000000000003','test-izmir-ges-2026','2026-06-22','parçalı bulutlu','Normal tempo'),
('a1000001-0000-0000-0000-000000000004','test-izmir-ges-2026','2026-06-23','yağmurlu','Saha durdu, kayıp gün'),
('a1000001-0000-0000-0000-000000000005','test-izmir-ges-2026','2026-06-24','açık','Çalışmalar yeniden başladı');

-- Personnel Log Entries
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('a1000001-0000-0000-0000-000000000005','mühendis','idari',3),
('a1000001-0000-0000-0000-000000000005','usta','mekanik',8),
('a1000001-0000-0000-0000-000000000005','işçi','mekanik',14),
('a1000001-0000-0000-0000-000000000005','işçi','yevmiyeci',6);

-- Machinery Logs
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('a1000001-0000-0000-0000-000000000005','rok_delim',2,'çalışıyor'),
('a1000001-0000-0000-0000-000000000005','ekskavatör',1,'çalışıyor'),
('a1000001-0000-0000-0000-000000000005','kamyon',2,'çalışıyor'),
('a1000001-0000-0000-0000-000000000005','jcb',1,'beklemede');

