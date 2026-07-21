-- Satın Alma Talepleri - farklı haftalara dağıtılmış
INSERT INTO purchase_requests (id, project_id, title, urgency, status, notes, created_at, updated_at) VALUES
('d0000001-0000-0000-0000-000000000001','test-izmir-ges-2026','Rok Delgi Matkap Ucu (50 adet)','acil','onaylandı','Mevcut matkaplar yıprandı','2026-06-01 08:00:00+00','2026-06-02 10:00:00+00'),
('d0000001-0000-0000-0000-000000000002','test-izmir-ges-2026','Şantiye Güvenlik Ekipmanları','normal','satın_alındı','Baret, yelek, eldiven','2026-06-01 09:00:00+00','2026-06-03 14:00:00+00'),
('d0000001-0000-0000-0000-000000000003','test-izmir-ges-2026','Konteyner Ofis Mobilyası','normal','onaylandı','Masa, sandalye, dolap','2026-06-05 10:00:00+00','2026-06-06 11:00:00+00'),
('d0000001-0000-0000-0000-000000000004','test-izmir-ges-2026','Kolon Çakım Ekipmanı Kiralama','çok_acil','onaylandı','Hidrolik çakma makinesi','2026-06-08 08:00:00+00','2026-06-09 09:00:00+00'),
('d0000001-0000-0000-0000-000000000005','test-izmir-ges-2026','İşçi Koruyucu Ekipman Takviye','normal','bekliyor','Ek sipariş gerekti','2026-06-10 11:00:00+00','2026-06-10 11:00:00+00'),
('d0000001-0000-0000-0000-000000000006','test-izmir-ges-2026','Haftalık Yakıt Alımı (İş Makineleri)','normal','satın_alındı','Dizel, 2000 litre','2026-06-15 07:00:00+00','2026-06-15 15:00:00+00'),
('d0000001-0000-0000-0000-000000000007','test-izmir-ges-2026','Kolon Malzeme Ek Sipariş','acil','onaylandı','Zemin beklentiden sert','2026-06-16 09:00:00+00','2026-06-17 10:00:00+00'),
('d0000001-0000-0000-0000-000000000008','test-izmir-ges-2026','Haftalık Yakıt Alımı 2. Hafta','normal','satın_alındı','Dizel, 2200 litre','2026-06-22 07:00:00+00','2026-06-22 15:00:00+00'),
('d0000001-0000-0000-0000-000000000009','test-izmir-ges-2026','Ek Rok Delgi Ekibi Takviyesi','çok_acil','bekliyor','Program gerisinde kaldı','2026-06-23 08:00:00+00','2026-06-23 08:00:00+00'),
('d0000001-0000-0000-0000-000000000010','test-izmir-ges-2026','Kolon Çakım Çelik Profil','acil','bekliyor','Stok bitti','2026-06-24 09:00:00+00','2026-06-24 09:00:00+00');

-- Purchase request items
INSERT INTO purchase_request_items (request_id, name, quantity, unit, unit_price) VALUES
('d0000001-0000-0000-0000-000000000001','Rok Delgi Matkap Ucu',50,'adet',450),
('d0000001-0000-0000-0000-000000000002','Baret',30,'adet',85),
('d0000001-0000-0000-0000-000000000002','Güvenlik Yeleği',30,'adet',120),
('d0000001-0000-0000-0000-000000000003','Ofis Masası',4,'adet',1200),
('d0000001-0000-0000-0000-000000000003','Sandalye',8,'adet',350),
('d0000001-0000-0000-0000-000000000004','Hidrolik Çakma Makinesi Kiralama',1,'ay',18000),
('d0000001-0000-0000-0000-000000000006','Dizel Yakıt',2000,'litre',38),
('d0000001-0000-0000-0000-000000000007','Çelik Kolon Profil',200,'adet',280),
('d0000001-0000-0000-0000-000000000008','Dizel Yakıt',2200,'litre',38),
('d0000001-0000-0000-0000-000000000009','Rok Delgi Ekibi',5,'kişi',8500),
('d0000001-0000-0000-0000-000000000010','Çelik Profil HEA120',150,'mt',180);

-- Tickets - farklı haftalara dağıtılmış
INSERT INTO tickets (project_id, title, description, category, severity, status, created_at, updated_at) VALUES
('test-izmir-ges-2026','Rok delgi ekipmanı arıza','2 nolu delgi makinesi hidrolik sistem arızası','mekanik','yüksek','kapatıldı','2026-06-09 10:00:00+00','2026-06-10 14:00:00+00'),
('test-izmir-ges-2026','Arazi sınır anlaşmazlığı','Kuzey parselde komşu arazi itirazı','genel','orta','işlemde','2026-06-11 09:00:00+00','2026-06-15 11:00:00+00'),
('test-izmir-ges-2026','Fırtına hasarı tespiti','18 Haziran fırtınasında şantiye çitleri zarar gördü','genel','yüksek','kapatıldı','2026-06-18 14:00:00+00','2026-06-19 09:00:00+00'),
('test-izmir-ges-2026','İşçi iş kazası bildirimi','Hafif iş kazası, parmak ezilmesi, ISG raporu gerekli','genel','yüksek','işlemde','2026-06-19 16:00:00+00','2026-06-20 08:00:00+00'),
('test-izmir-ges-2026','Malzeme depo yerleşim sorunu','Depo alanı yetersiz, ek alan gerekiyor','genel','orta','açık','2026-06-22 11:00:00+00','2026-06-22 11:00:00+00'),
('test-izmir-ges-2026','DC kablo tedarik gecikmesi','Tedarikçi teslim tarihini 2 hafta erteledi','elektrik','yüksek','açık','2026-06-23 09:00:00+00','2026-06-23 09:00:00+00'),
('test-izmir-ges-2026','EDAS yazışma takibi','Bağlantı başvurusu cevap bekleniyor','genel','orta','açık','2026-06-24 08:00:00+00','2026-06-24 08:00:00+00');

