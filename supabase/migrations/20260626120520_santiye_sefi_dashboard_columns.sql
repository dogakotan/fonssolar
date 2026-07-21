
-- 1. daily_reports tablosuna eksik kolonlar ekle
ALTER TABLE daily_reports
  ADD COLUMN IF NOT EXISTS general_status text
    CHECK (general_status IN ('normal','dikkat','kritik')) DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS worker_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS weather_note text;

-- 2. procurement_items tablosuna aksiyon kolonları ekle
ALTER TABLE procurement_items
  ADD COLUMN IF NOT EXISTS received_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS received_date date,
  ADD COLUMN IF NOT EXISTS shortage_notes text,
  ADD COLUMN IF NOT EXISTS damage_notes text;

-- 3. procurement_items status check genişlet
ALTER TABLE procurement_items
  DROP CONSTRAINT IF EXISTS procurement_items_status_check;
ALTER TABLE procurement_items
  ADD CONSTRAINT procurement_items_status_check
  CHECK (status = ANY (ARRAY[
    'planlandı','sipariş_verildi','teslim_edildi','iptal','gecikmiş',
    'kısmi_teslim','hasarlı'
  ]));

