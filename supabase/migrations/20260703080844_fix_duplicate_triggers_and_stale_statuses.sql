
-- ============================================================
-- DÜZELTME 1: purchase_request_approval_trigger
-- Eski status değerlerini kullanıyordu, migration sonrası çalışmıyordu
-- ============================================================
CREATE OR REPLACE FUNCTION handle_purchase_request_approval()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Yeni akış: onay_bekliyor → onaylandi
  IF NEW.status = 'onaylandi' AND OLD.status = 'onay_bekliyor' THEN
    NEW.approved_at = now();
  END IF;
  -- Eski değerlerden geçiş olursa da yakala (güvenlik için)
  IF NEW.status = 'onaylandi' AND NEW.approved_at IS NULL THEN
    NEW.approved_at = now();
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- DÜZELTME 2: progress_daily üzerindeki duplicate trigger'ı kaldır
-- progress_daily_sync ve trg_sync_item_total aynı işi yapıyordu
-- trg_sync_item_total daha güncel, onu bırakıyoruz
-- ============================================================
DROP TRIGGER IF EXISTS progress_daily_sync ON progress_daily;

-- ============================================================
-- DÜZELTME 3: tickets üzerindeki duplicate trigger'ı kaldır
-- ticket_history_trigger ve trg_ticket_history aynı işi yapıyordu
-- trg_ticket_history daha kapsamlı (title, description, category, location da izliyor)
-- eski ticket_history_trigger'ı kaldırıyoruz
-- ============================================================
DROP TRIGGER IF EXISTS ticket_history_trigger ON tickets;

-- ============================================================
-- DÜZELTME 4: profiles.role kolonu — role_key ile çakışıyor
-- Kolon içeriği her zaman 'santiye_sefi' (default değeri), role_key asıl alan
-- Uygulamanın kırılmaması için kolonu DEPRECATED olarak işaretliyoruz
-- Fiziksel silme yapmıyoruz, sadece belgede açıklıyoruz
-- ============================================================
COMMENT ON COLUMN profiles.role IS 
  'DEPRECATED — role_key kullanın. Bu kolon 2NF ihlali nedeniyle kaldırılacak. Şu an geriye dönük uyumluluk için bırakılmıştır.';

-- ============================================================
-- DÜZELTME 5: purchase_requests.request_note kolonu
-- notes ile örtüşüyor — DEPRECATED işareti
-- ============================================================
COMMENT ON COLUMN purchase_requests.request_note IS
  'DEPRECATED — notes kolonunu kullanın. Bu alan ilerleyen versiyonda kaldırılacaktır.';

