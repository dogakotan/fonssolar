INSERT INTO project_tasks (project_id, task_code, task_name, category, group_label, planned_start, planned_end, progress_pct, status) VALUES
-- Şantiye Mobilizasyon
('test-izmir-ges-2026','M0','Santiye Mobilizasyonu','mobilizasyon','Şantiye Mobilizasyon','2026-06-01','2026-06-15',100,'tamamlandi'),
('test-izmir-ges-2026','M0a','Arazi Tesviye','mobilizasyon','Şantiye Mobilizasyon','2026-06-01','2026-06-10',100,'tamamlandi'),
('test-izmir-ges-2026','M0b','Ulasim Yollari','mobilizasyon','Şantiye Mobilizasyon','2026-06-05','2026-06-15',100,'tamamlandi'),
('test-izmir-ges-2026','M0c','Isletme Binasi','mobilizasyon','Şantiye Mobilizasyon','2026-06-05','2026-06-20',80,'devam_ediyor'),
('test-izmir-ges-2026','M0d','Depo Alani','mobilizasyon','Şantiye Mobilizasyon','2026-06-05','2026-06-20',75,'devam_ediyor'),
('test-izmir-ges-2026','M0e','Telcit ve Guvenlik','mobilizasyon','Şantiye Mobilizasyon','2026-06-01','2026-07-15',60,'devam_ediyor'),
-- Mekanik Bölüm
('test-izmir-ges-2026','M1','Kolon Noktalama','mekanik','Mekanik Bölüm','2026-06-15','2026-06-30',100,'tamamlandi'),
('test-izmir-ges-2026','M2','Rok Delgi Islemi','mekanik','Mekanik Bölüm','2026-06-20','2026-07-15',65,'devam_ediyor'),
('test-izmir-ges-2026','M3','Kolon Cakim Islemi','mekanik','Mekanik Bölüm','2026-07-01','2026-07-31',20,'devam_ediyor'),
('test-izmir-ges-2026','M4','Kiris Montaji','mekanik','Mekanik Bölüm','2026-07-20','2026-08-20',0,'beklemede'),
('test-izmir-ges-2026','M5','Asik Montaji','mekanik','Mekanik Bölüm','2026-08-10','2026-09-10',0,'beklemede'),
('test-izmir-ges-2026','M6','Panel Montaji (13.300 adet 620Wp)','mekanik','Mekanik Bölüm','2026-09-01','2026-10-15',0,'beklemede'),
-- Elektriksel DC
('test-izmir-ges-2026','E1','DC Kablo Kazisi','elektrik_dc','Elektriksel — DC','2026-07-15','2026-08-01',0,'beklemede'),
('test-izmir-ges-2026','E2','DC Kablo Cekimi','elektrik_dc','Elektriksel — DC','2026-08-15','2026-09-15',0,'beklemede'),
('test-izmir-ges-2026','E3','DC Kablo Reglaj','elektrik_dc','Elektriksel — DC','2026-09-10','2026-09-25',0,'beklemede'),
('test-izmir-ges-2026','E4','Konnekter ve Etiket','elektrik_dc','Elektriksel — DC','2026-09-20','2026-10-05',0,'beklemede'),
('test-izmir-ges-2026','E5','Izolasyon Testleri DC','elektrik_dc','Elektriksel — DC','2026-10-01','2026-10-10',0,'beklemede'),
-- Elektriksel AC
('test-izmir-ges-2026','E6','AC Kazi Acilmasi','elektrik_ac','Elektriksel — AC','2026-07-15','2026-08-05',0,'beklemede'),
('test-izmir-ges-2026','E7','AC Kablo Cekimi','elektrik_ac','Elektriksel — AC','2026-08-10','2026-09-05',0,'beklemede'),
('test-izmir-ges-2026','E8','AC Kazi Kapatma','elektrik_ac','Elektriksel — AC','2026-09-01','2026-09-15',0,'beklemede'),
('test-izmir-ges-2026','E9','Inverter ve GES Pano','elektrik_ac','Elektriksel — AC','2026-09-10','2026-10-01',0,'beklemede'),
('test-izmir-ges-2026','E10','Inverter Devreye Alma','elektrik_ac','Elektriksel — AC','2026-10-15','2026-11-01',0,'beklemede'),
-- Elektriksel OG
('test-izmir-ges-2026','E11','OG Kablo Kazisi','elektrik_og','Elektriksel — OG','2026-07-15','2026-09-01',0,'beklemede'),
('test-izmir-ges-2026','E12','XLPE OG Kablo Cekimi','elektrik_og','Elektriksel — OG','2026-08-15','2026-09-20',0,'beklemede'),
('test-izmir-ges-2026','E13','OG Kazi Kapatma','elektrik_og','Elektriksel — OG','2026-09-20','2026-10-05',0,'beklemede'),
('test-izmir-ges-2026','E14','Kosk ve Trafo Konumlandirma','elektrik_og','Elektriksel — OG','2026-09-01','2026-10-10',0,'beklemede'),
('test-izmir-ges-2026','E15','OG Hucre Montaji (12 adet)','elektrik_og','Elektriksel — OG','2026-09-01','2026-10-20',0,'beklemede'),
('test-izmir-ges-2026','E16','SCADA Islemleri','elektrik_og','Elektriksel — OG','2026-10-20','2026-11-01',0,'beklemede'),
('test-izmir-ges-2026','E17','Trafo Enerjilendirme','elektrik_og','Elektriksel — OG','2026-11-01','2026-11-10',0,'beklemede'),
-- Topraklama
('test-izmir-ges-2026','T1','Cevre Topraklama Kazisi','topraklama','Topraklama','2026-07-15','2026-09-15',0,'beklemede'),
('test-izmir-ges-2026','T2','Topraklama Serit Doseme','topraklama','Topraklama','2026-08-01','2026-09-20',0,'beklemede'),
-- ENH
('test-izmir-ges-2026','N1','ENH Projelendirme ve Kurulum','enh','ENH','2026-06-01','2026-11-30',30,'devam_ediyor'),
-- Devreye Alma
('test-izmir-ges-2026','D1','Sistem Testleri ve Komisyoning','devreye_alma','Devreye Alma','2026-11-01','2026-11-20',0,'beklemede'),
('test-izmir-ges-2026','D2','EDAS Kabul Testleri','devreye_alma','Devreye Alma','2026-11-15','2026-11-25',0,'beklemede'),
('test-izmir-ges-2026','D3','Ticari Uretim Gecisi','devreye_alma','Devreye Alma','2026-11-25','2026-11-30',0,'beklemede');

