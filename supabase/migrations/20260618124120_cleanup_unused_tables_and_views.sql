
-- 1. pr_items sil (purchase_request_items'a migrate edildi)
DROP TABLE IF EXISTS pr_items CASCADE;

-- 2. purchase_items sil (kodda hiç kullanılmıyor, FK yok)
DROP TABLE IF EXISTS purchase_items CASCADE;

-- 3. Kullanılmayan view'ları sil
DROP VIEW IF EXISTS procurement_progress CASCADE;
DROP VIEW IF EXISTS procurement_delay_risk CASCADE;
DROP VIEW IF EXISTS schedule_progress CASCADE;
DROP VIEW IF EXISTS first10_days_checklist CASCADE;

-- 4. Eski günlük rapor tablolarını temizle (veri referans amaçlı saklanıyor, sadece yorum)
-- gunluk_ilerleme_örnek ve personel_makine_raporu şimdilik bırakılıyor
-- kod geçişi tamamlandıktan sonra silinecek

