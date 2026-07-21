
-- Kullanılmayan kolonlar (0 satır veri, kod referansı yok)
ALTER TABLE daily_reports     DROP COLUMN IF EXISTS ai_summary;
ALTER TABLE ticket_comments   DROP COLUMN IF EXISTS admin_message;
ALTER TABLE purchase_requests DROP COLUMN IF EXISTS reject_note;
ALTER TABLE ticket_history    DROP COLUMN IF EXISTS status_label;

-- Kullanılmayan tablo (0 satır, kod referansı yok)
DROP TABLE IF EXISTS ticket_attachments;

