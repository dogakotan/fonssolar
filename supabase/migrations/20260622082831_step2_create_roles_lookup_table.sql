
-- ADIM 2: roles lookup tablosu oluştur (3NF düzeltme)
CREATE TABLE IF NOT EXISTS roles (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT
);

-- Tüm roller ve açıklamaları
INSERT INTO roles (key, display_name, description) VALUES
  ('admin',                   'Sistem Yöneticisi',        'Tüm sisteme tam erişim'),
  ('muhasebe',                'Muhasebe',                 'Fatura, ödeme ve mali raporlar'),
  ('santiye_sefi',            'Şantiye Şefi',             'Günlük saha operasyonu, iş güvenliği, ekip yönetimi, kalite kontrol'),
  ('muhendis',                'Mühendis',                 'Teknik tasarım ve uygulama'),
  ('koordinator',             'Koordinatör',              'Genel koordinasyon ve paydaş yönetimi'),
  ('satin_alma_uzmani',       'Satın Alma Uzmanı',        'Tedarik, ihale ve sözleşme yönetimi'),
  ('proje_koordinatoru',      'Proje Koordinatörü',       'Genel proje koordinasyonu, paydaş yönetimi, TEİAŞ-EPDK koordinasyonu, raporlama'),
  ('proje_kurulum_sefi',      'Proje Kurulum Şefi',       'Mekanik+elektrik kurulum liderliği, iş programı takibi, kaynak optimizasyonu'),
  ('elektrik_sefi',           'Elektrik Şefi',            'DC/AC/OG kablo, inverter, trafo, köşk, ENH elektrik işleri koordinasyonu'),
  ('mekanik_sef',             'Mekanik Şef',              'Kazık/çelik yapı kurulum, delgi-çakım makineleri yönetimi, panel montaj'),
  ('isg_sorumlusu',           'İSG Sorumlusu',            'İş sağlığı güvenliği, KKD denetimi, kaza raporları, eğitimler'),
  ('kalite_kontrol_sefi',     'Kalite Kontrol Şefi',      'Muayene-test planları, kabul testleri, as-built dokümantasyon'),
  ('lojistik_tedarik',        'Lojistik ve Tedarik',      'Malzeme tedariği, depo yönetimi, nakliye planlaması, stok takibi'),
  ('enh_sorumlusu',           'ENH Sorumlusu',            '154 kV enerji nakil hattı projelendirme, kurulum, TEİAŞ koordinasyonu'),
  ('operasyon_sorumlusu',     'Operasyon Sorumlusu',      'İnverter devreye alma, SCADA, enerji izleme, test prosedürleri'),
  ('evrak_takip',             'Evrak Takip',              'İzin-ruhsat takibi, TEİAŞ yazışmaları, ÇED, kamulaştırma evrakları'),
  ('maliyet_kontrolcu',       'Maliyet Kontrolcü',        'Bütçe takibi, hakediş hazırlama, maliyet sapma analizi, nakit akışı'),
  ('is_makinesi_operator',    'İş Makinesi Operatörü',    'Delgi makineleri, ekskavatörler, hidrolik kazık çakma ekipmanı yönetimi'),
  ('proje_tasarim_sorumlusu', 'Proje Tasarım Sorumlusu',  'TEDAŞ standartlarına uygun proje çizimi, TEDAŞ proje onayı, uygulama projesi hazırlanması, proje BOM list hazırlanması')
ON CONFLICT (key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description;

-- RLS
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "roles_read_all" ON roles FOR SELECT USING (true);
CREATE POLICY "roles_admin_only" ON roles FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role_key = 'admin')
);

