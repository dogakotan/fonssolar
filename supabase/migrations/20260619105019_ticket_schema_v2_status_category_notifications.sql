
-- 1. category: 'genel' ekle
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_category_check;
ALTER TABLE tickets ALTER COLUMN category SET DEFAULT 'genel';
ALTER TABLE tickets ADD CONSTRAINT tickets_category_check
  CHECK (category = ANY (ARRAY['genel'::text, 'elektrik'::text, 'mekanik'::text]));

-- 2. status: 'gönderildi' ekle, default yap; 'açık' geçerli kalır (geriye dönük uyumluluk)
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ALTER COLUMN status SET DEFAULT 'gönderildi';
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY['gönderildi'::text, 'açık'::text, 'işlemde'::text, 'kapatıldı'::text, 'iptal_edildi'::text]));

-- 3. ticket_comments: bildirim kolonları ekle
ALTER TABLE ticket_comments
  ADD COLUMN IF NOT EXISTS is_notification boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS sent_by_admin   boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_message   text;

