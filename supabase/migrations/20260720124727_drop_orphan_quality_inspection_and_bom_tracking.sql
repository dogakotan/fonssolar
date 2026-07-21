-- Trigger'lar (tablo silinince zaten kalkar, netlik için ayrı gösteriliyor)
DROP TRIGGER IF EXISTS trg_create_ticket_from_quality_finding ON quality_inspection_findings;
DROP TRIGGER IF EXISTS trg_sync_ticket_status_from_quality_finding ON quality_inspection_findings;

-- Tablolar (0 satır, veri kaybı yok — child'dan parent'a sırayla)
DROP TABLE IF EXISTS quality_inspection_photos;
DROP TABLE IF EXISTS quality_inspection_findings;
DROP TABLE IF EXISTS quality_inspections;

-- Trigger fonksiyonları
DROP FUNCTION IF EXISTS fn_create_ticket_from_quality_finding();
DROP FUNCTION IF EXISTS fn_sync_ticket_status_from_quality_finding();

-- RPC'ler
DROP FUNCTION IF EXISTS get_quality_inspections_list(text, date);
DROP FUNCTION IF EXISTS get_quality_inspection_detail(uuid);
DROP FUNCTION IF EXISTS save_quality_inspection(text, date, text, text, uuid, uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS update_quality_finding_status(uuid, text);

-- Kullanılmayan view (otomatik risk motoru kendi ayrı sorgusuyla aynı işi yapıyor, hiçbir yer bu view'ı çağırmıyor)
DROP VIEW IF EXISTS vw_bom_tracking;

