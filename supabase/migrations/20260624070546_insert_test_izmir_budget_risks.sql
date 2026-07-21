-- Budget Lines
INSERT INTO budget_lines (project_id, category, name, planned_amount, order_index) VALUES
('test-izmir-ges-2026','malzeme','PV Modül (13.300 adet 620Wp)',1850000,1),
('test-izmir-ges-2026','malzeme','Huawei İnverter (24 adet 330KTL)',420000,2),
('test-izmir-ges-2026','malzeme','DC Kablo (75.000 mt)',185000,3),
('test-izmir-ges-2026','malzeme','AC Kablo',95000,4),
('test-izmir-ges-2026','malzeme','OG Kablo ve Ekipman',145000,5),
('test-izmir-ges-2026','malzeme','Konstrüksiyon Çelik',280000,6),
('test-izmir-ges-2026','malzeme','OG Hücre ve Trafo',220000,7),
('test-izmir-ges-2026','iscilik','Mekanik Montaj İşçilik',180000,8),
('test-izmir-ges-2026','iscilik','Elektrik İşçilik',145000,9),
('test-izmir-ges-2026','iscilik','OG İşçilik',75000,10),
('test-izmir-ges-2026','diger','ENH Kurulum',95000,11),
('test-izmir-ges-2026','diger','Nakliye ve Lojistik',65000,12),
('test-izmir-ges-2026','diger','Proje Yönetimi',55000,13),
('test-izmir-ges-2026','diger','Beklenmedik Giderler',80000,14);

-- Risks
INSERT INTO project_risks (project_id, title, description, severity, probability, impact, status) VALUES
('test-izmir-ges-2026','EDAS bağlantı onay gecikmesi','Toroslar EDAS onay sürecinin uzaması projeyi geciktirebilir','kritik',4,5,'açık'),
('test-izmir-ges-2026','Panel sevkiyat gecikmesi','Tedarikçi üretim kapasitesi kısıtlı olabilir','yüksek',3,4,'açık'),
('test-izmir-ges-2026','Hava koşulları','Eylül-Ekim döneminde yağış riski','orta',3,3,'açık'),
('test-izmir-ges-2026','Rok kayası zemin sorunu','Sondaj sırasında sert kayaya rastlanabilir','yüksek',2,4,'açık'),
('test-izmir-ges-2026','İnverter tedarik gecikmesi','Huawei stok durumu belirsiz','orta',2,3,'açık'),
('test-izmir-ges-2026','İşçi bulma zorluğu','Bölgede vasıflı elektrik işçisi kıtlığı','orta',3,2,'açık'),
('test-izmir-ges-2026','Arazi erişim sorunu','Mülk sınır anlaşmazlığı riski','düşük',1,3,'açık'),
('test-izmir-ges-2026','ENH hat güzergah değişikliği','Kamulaştırma sürecinde güzergah revizyonu','yüksek',2,5,'açık');

