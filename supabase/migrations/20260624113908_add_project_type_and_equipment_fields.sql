
-- 1. projects tablosuna yeni kolonlar
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type text CHECK (project_type IN ('arazi_ges', 'endustriyel_cati_ges', 'evsel_ges')),
  ADD COLUMN IF NOT EXISTS storage_kwh numeric,
  ADD COLUMN IF NOT EXISTS panel_brand text,
  ADD COLUMN IF NOT EXISTS panel_count integer,
  ADD COLUMN IF NOT EXISTS inverter_brand text,
  ADD COLUMN IF NOT EXISTS inverter_count integer,
  ADD COLUMN IF NOT EXISTS battery_brand text,
  ADD COLUMN IF NOT EXISTS battery_power_kw numeric,
  ADD COLUMN IF NOT EXISTS battery_count integer;

-- 2. project_tasks category enum'una yeni değerler ekle
ALTER TYPE task_category ADD VALUE IF NOT EXISTS 'evrak_sureci';
ALTER TYPE task_category ADD VALUE IF NOT EXISTS 'satin_alma';

-- 3. progress_items category kolonu text ise yeni kategoriler zaten geçerli (text)
-- Mevcut durumu değiştirmeye gerek yok

