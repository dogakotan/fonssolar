
-- 1. profiles tablosuna project_id ekle (kullanıcı-proje bağlantısı)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS project_id text REFERENCES projects(id) ON DELETE SET NULL;

-- 2. tickets tablosuna lokasyon ekle (projeden otomatik dolacak ama override edilebilir)
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS location text;

-- 3. category constraint'ini güncelle — elektrik ve mekanik zaten var, ticket cinsi bunlar
-- Mevcut: teknik, isg, kalite, lojistik, elektrik, mekanik, genel
-- Senin istediğin: elektrik, mekanik (+ diğerleri kalabilir)
-- Mevcut constraint zaten kapsıyor, değişiklik gerekmez.

-- 4. status için daha açıklayıcı değerler — mevcut sistemi genişlet
-- Mevcut: açık, işlemde, çözüldü, kapatıldı
-- İstenen: oluşturuldu, işleme alındı, çözüldü, kapatıldı
-- Önce eski constraint'i kaldır, yenisini ekle
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
  CHECK (status = ANY (ARRAY[
    'açık'::text,          -- oluşturuldu (eski verilerle uyumluluk)
    'işlemde'::text,       -- işleme alındı
    'çözüldü'::text,
    'kapatıldı'::text
  ]));

-- 5. tickets tablosuna updated_by ekle (kim güncelledi)
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- 6. Personelin kendi ticket'larını görebilmesi için RLS politikası
-- Önce mevcut politikaları kontrol et
-- Kullanıcı kendi oluşturduğu ticket'ları her zaman görebilir
-- Admin tüm ticket'ları görebilir

-- Mevcut RLS politikalarını temizle
DROP POLICY IF EXISTS "tickets_select" ON tickets;
DROP POLICY IF EXISTS "tickets_insert" ON tickets;
DROP POLICY IF EXISTS "tickets_update" ON tickets;

-- SELECT: kullanıcı kendi ticket'larını + proje arkadaşlarının ticket'larını görebilir
CREATE POLICY "tickets_select" ON tickets
  FOR SELECT USING (
    auth.uid() = created_by  -- kendi ticket'ı
    OR auth.uid() = assigned_to  -- atanan kişi
    OR EXISTS (  -- admin
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role_key = 'admin'
    )
    OR EXISTS (  -- aynı projedeki kullanıcılar
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND project_id = tickets.project_id
    )
  );

-- INSERT: giriş yapmış herkes ticket açabilir
CREATE POLICY "tickets_insert" ON tickets
  FOR INSERT WITH CHECK (auth.uid() = created_by);

-- UPDATE: admin her şeyi güncelleyebilir, kullanıcı sadece kendi ticket'ını
CREATE POLICY "tickets_update" ON tickets
  FOR UPDATE USING (
    auth.uid() = created_by
    OR EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role_key = 'admin'
    )
  );

-- 7. ticket_history tablosuna daha açıklayıcı status_label ekle
ALTER TABLE ticket_history
ADD COLUMN IF NOT EXISTS status_label text;

