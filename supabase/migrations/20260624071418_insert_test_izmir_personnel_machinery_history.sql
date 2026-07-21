-- 01 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000001','mühendis','idari',2),
('b1000001-0000-0000-0000-000000000001','usta','mekanik',4),
('b1000001-0000-0000-0000-000000000001','işçi','yevmiyeci',8);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000001','ekskavatör',1,'çalışıyor'),
('b1000001-0000-0000-0000-000000000001','kamyon',1,'çalışıyor');

-- 02 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000002','mühendis','idari',2),
('b1000001-0000-0000-0000-000000000002','usta','mekanik',4),
('b1000001-0000-0000-0000-000000000002','işçi','yevmiyeci',10);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000002','ekskavatör',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000002','kamyon',2,'çalışıyor');

-- 03 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000003','mühendis','idari',2),
('b1000001-0000-0000-0000-000000000003','usta','mekanik',5),
('b1000001-0000-0000-0000-000000000003','işçi','yevmiyeci',12);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000003','ekskavatör',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000003','kamyon',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000003','loader',1,'çalışıyor');

-- 04 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000004','mühendis','idari',2),
('b1000001-0000-0000-0000-000000000004','usta','mekanik',5),
('b1000001-0000-0000-0000-000000000004','işçi','yevmiyeci',12);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000004','ekskavatör',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000004','kamyon',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000004','loader',1,'çalışıyor');

-- 05 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000005','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000005','usta','mekanik',6),
('b1000001-0000-0000-0000-000000000005','işçi','yevmiyeci',14);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000005','ekskavatör',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000005','kamyon',3,'çalışıyor'),
('b1000001-0000-0000-0000-000000000005','loader',1,'çalışıyor');

-- 08 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000006','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000006','usta','mekanik',6),
('b1000001-0000-0000-0000-000000000006','işçi','yevmiyeci',14);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000006','ekskavatör',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000006','kamyon',3,'çalışıyor'),
('b1000001-0000-0000-0000-000000000006','loader',1,'çalışıyor');

-- 09 Haziran (yağmurlu - kayıp gün, az personel)
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000007','mühendis','idari',2),
('b1000001-0000-0000-0000-000000000007','usta','mekanik',2);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000007','ekskavatör',1,'beklemede'),
('b1000001-0000-0000-0000-000000000007','kamyon',2,'beklemede');

-- 10 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000008','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000008','usta','mekanik',7),
('b1000001-0000-0000-0000-000000000008','işçi','yevmiyeci',15);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000008','ekskavatör',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000008','kamyon',3,'çalışıyor'),
('b1000001-0000-0000-0000-000000000008','loader',1,'çalışıyor');

-- 11 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000009','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000009','usta','mekanik',8),
('b1000001-0000-0000-0000-000000000009','işçi','mekanik',10),
('b1000001-0000-0000-0000-000000000009','işçi','yevmiyeci',8);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000009','rok_delim',1,'çalışıyor'),
('b1000001-0000-0000-0000-000000000009','kamyon',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000009','jcb',1,'çalışıyor');

-- 12 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000010','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000010','usta','mekanik',8),
('b1000001-0000-0000-0000-000000000010','işçi','mekanik',10),
('b1000001-0000-0000-0000-000000000010','işçi','yevmiyeci',8);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000010','rok_delim',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000010','kamyon',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000010','jcb',1,'çalışıyor');

-- 15 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000011','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000011','usta','mekanik',8),
('b1000001-0000-0000-0000-000000000011','işçi','mekanik',12),
('b1000001-0000-0000-0000-000000000011','işçi','yevmiyeci',6);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000011','rok_delim',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000011','kamyon',3,'çalışıyor'),
('b1000001-0000-0000-0000-000000000011','jcb',1,'çalışıyor');

-- 16 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000012','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000012','usta','mekanik',8),
('b1000001-0000-0000-0000-000000000012','işçi','mekanik',14),
('b1000001-0000-0000-0000-000000000012','işçi','yevmiyeci',6);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000012','rok_delim',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000012','kamyon',3,'çalışıyor'),
('b1000001-0000-0000-0000-000000000012','jcb',1,'çalışıyor');

-- 17 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000013','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000013','usta','mekanik',8),
('b1000001-0000-0000-0000-000000000013','işçi','mekanik',14),
('b1000001-0000-0000-0000-000000000013','işçi','yevmiyeci',6);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000013','rok_delim',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000013','kamyon',3,'çalışıyor'),
('b1000001-0000-0000-0000-000000000013','jcb',1,'çalışıyor');

-- 18 Haziran (fırtınalı - kayıp gün)
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000014','mühendis','idari',2),
('b1000001-0000-0000-0000-000000000014','usta','mekanik',2);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000014','rok_delim',2,'beklemede'),
('b1000001-0000-0000-0000-000000000014','kamyon',3,'beklemede');

-- 19 Haziran
INSERT INTO personnel_log_entries (report_id, shift, department, count) VALUES
('b1000001-0000-0000-0000-000000000015','mühendis','idari',3),
('b1000001-0000-0000-0000-000000000015','usta','mekanik',8),
('b1000001-0000-0000-0000-000000000015','işçi','mekanik',14),
('b1000001-0000-0000-0000-000000000015','işçi','yevmiyeci',6);
INSERT INTO machinery_logs (report_id, machine_type, count, status) VALUES
('b1000001-0000-0000-0000-000000000015','rok_delim',2,'çalışıyor'),
('b1000001-0000-0000-0000-000000000015','kamyon',3,'çalışıyor'),
('b1000001-0000-0000-0000-000000000015','jcb',1,'çalışıyor');

