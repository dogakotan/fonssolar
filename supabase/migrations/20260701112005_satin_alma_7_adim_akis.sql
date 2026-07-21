
-- ============================================================
-- SATIN ALMA SÜRECİ - 7 ADIMLI AKIŞ GÜNCELLEMESİ
-- Şantiye Şefi'nden Fatura Onayına ve Maliyet Tablosuna Yansımasına Kadar
-- ============================================================

-- 1. Mevcut status kısıtını kaldır
ALTER TABLE purchase_requests 
  DROP CONSTRAINT IF EXISTS purchase_requests_status_check;

-- 2. Mevcut veriyi yeni ASCII-safe status değerlerine dönüştür
UPDATE purchase_requests 
SET status = CASE 
  WHEN status = 'bekliyor'     THEN 'talep_olusturuldu'
  WHEN status = 'onaylandı'    THEN 'onaylandi'
  WHEN status = 'satın_alındı' THEN 'satin_alindi'
  ELSE status
END;

-- 3. Default değeri güncelle
ALTER TABLE purchase_requests 
  ALTER COLUMN status SET DEFAULT 'talep_olusturuldu';

-- 4. Yeni 7 adımlı status kısıtını ekle
ALTER TABLE purchase_requests 
  ADD CONSTRAINT purchase_requests_status_check 
  CHECK (status = ANY (ARRAY[
    'talep_olusturuldu'::text,    -- Adım 1: Şantiye Şefi talebi girer
    'fiyat_girildi'::text,        -- Adım 2: PM/Satın Alma tahmini tutar girer
    'onay_bekliyor'::text,        -- Adım 3: Yönetici onayı bekleniyor
    'onaylandi'::text,            -- Adım 3: Yönetici onayladı
    'reddedildi'::text,           -- Adım 3: Yönetici reddetti
    'satin_alindi'::text,         -- Adım 4: Satın alma gerçekleştirildi
    'fatura_bekliyor'::text,      -- Adım 5: Fatura girilmesi bekleniyor
    'fatura_onay_bekliyor'::text, -- Adım 6: Fatura yönetici onayında
    'faturasi_kesildi'::text,     -- Adım 7: Onaylandı, maliyete yansıdı
    'iptal'::text
  ]));

-- 5. Adım 1 eksik kolonları (Şantiye Şefi)
ALTER TABLE purchase_requests 
  ADD COLUMN IF NOT EXISTS justification text,    -- Gerekçe
  ADD COLUMN IF NOT EXISTS photo_url text;        -- Fotoğraf URL

-- 6. Adım 2 kolonları (Proje Yöneticisi / Satın Alma)
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS estimated_amount_excl_vat numeric,                      -- Tahmini Tutar (KDV Hariç)
  ADD COLUMN IF NOT EXISTS estimated_vat_rate numeric DEFAULT 20,                  -- KDV Oranı (%)
  ADD COLUMN IF NOT EXISTS estimated_amount_incl_vat numeric,                      -- Tahmini Tutar (KDV Dahil)
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'TRY',                            -- Para Birimi
  ADD COLUMN IF NOT EXISTS estimated_supplier text,                                -- Tedarikçi (opsiyonel)
  ADD COLUMN IF NOT EXISTS price_note text,                                        -- Not
  ADD COLUMN IF NOT EXISTS price_entered_by uuid REFERENCES auth.users(id),       -- Fiyatı Giren
  ADD COLUMN IF NOT EXISTS price_entered_at timestamptz;                           -- Fiyat Giriş Zamanı

-- 7. Adım 3 eksik kolonu (Yönetici Onayı)
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS approval_note text;   -- Onay/Red Notu (approved_by, approved_at zaten var)

-- 8. Adım 4 kolonları (Satın Alma Sorumlusu)
ALTER TABLE purchase_requests
  ADD COLUMN IF NOT EXISTS purchase_date date,                                      -- Satın Alma Tarihi
  ADD COLUMN IF NOT EXISTS delivery_date date,                                      -- Teslimat Tarihi
  ADD COLUMN IF NOT EXISTS received_by_name text,                                   -- Teslim Alan
  ADD COLUMN IF NOT EXISTS delivery_document_url text,                              -- İrsaliye / Teslimat Belgesi
  ADD COLUMN IF NOT EXISTS purchased_by uuid REFERENCES auth.users(id),            -- Satın Almayı Gerçekleştiren
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES suppliers(id);              -- Onaylı Tedarikçi FK

-- 9. Adım 5: Fatura belgesi URL'si (Muhasebe)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_document_url text;   -- Fatura Belgesi (PDF) URL

-- 10. Satın alma durum değişikliği log tablosu (tüm adımlar kayıt altına alınır)
CREATE TABLE IF NOT EXISTS purchase_request_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES purchase_requests(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  step_no integer CHECK (step_no BETWEEN 1 AND 7),   -- Hangi adım
  changed_by uuid REFERENCES auth.users(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE purchase_request_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_status_log_select"
  ON purchase_request_status_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "purchase_status_log_insert"
  ON purchase_request_status_log FOR INSERT
  TO authenticated WITH CHECK (true);

