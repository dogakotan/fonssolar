
-- ============================================================
-- 1. progress_items tablosuna task_id FK ekle
--    Nullable: kaptan-usak-ges'in mevcut kayıtları kırılmasın
-- ============================================================
ALTER TABLE progress_items
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES project_tasks(id) ON DELETE SET NULL;

-- ============================================================
-- 2. daily_tasks tablosuna da task_id ekle
--    Santiye şefi günlük raporda hangi görevi ilerlettiğini seçebilsin
-- ============================================================
ALTER TABLE daily_tasks
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES project_tasks(id) ON DELETE SET NULL;

-- ============================================================
-- 3. progress_pct'yi otomatik hesaplayan fonksiyon
--    Her progress_daily INSERT/UPDATE/DELETE sonrası tetiklenir
--    Hesaplama: completed_qty / target_qty * 100
-- ============================================================
CREATE OR REPLACE FUNCTION update_task_progress_pct()
RETURNS TRIGGER AS $$
DECLARE
  v_task_id   uuid;
  v_target    numeric;
  v_completed numeric;
  v_pct       numeric;
BEGIN
  -- Hangi task güncellendi?
  SELECT pi.task_id, pi.target_qty
    INTO v_task_id, v_target
    FROM progress_items pi
   WHERE pi.id = COALESCE(NEW.item_id, OLD.item_id);

  -- task_id yoksa çık (eski kaptan kayıtları)
  IF v_task_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Bu task'a bağlı tüm progress_items'ların toplam ilerlemesini hesapla
  SELECT COALESCE(SUM(pi.total_progress), 0)
    INTO v_completed
    FROM progress_items pi
   WHERE pi.task_id = v_task_id;

  -- Hedef 0 ise bölme hatası önle
  IF v_target IS NULL OR v_target = 0 THEN
    v_pct := 0;
  ELSE
    v_pct := LEAST(ROUND((v_completed / v_target) * 100, 1), 100);
  END IF;

  -- project_tasks'ı güncelle
  UPDATE project_tasks
     SET progress_pct = v_pct,
         status = CASE
                    WHEN v_pct >= 100 THEN 'tamamlandi'::task_status
                    WHEN v_pct > 0    THEN 'devam_ediyor'::task_status
                    ELSE status  -- beklemede olarak bırak
                  END,
         actual_start = CASE
                    WHEN v_pct > 0 AND actual_start IS NULL THEN CURRENT_DATE
                    ELSE actual_start
                  END,
         updated_at = now()
   WHERE id = v_task_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. progress_items.total_progress güncellenince de tetikle
--    (progress_daily yerine direkt update yapılırsa da çalışsın)
-- ============================================================
CREATE OR REPLACE FUNCTION update_task_progress_from_item()
RETURNS TRIGGER AS $$
DECLARE
  v_target    numeric;
  v_completed numeric;
  v_pct       numeric;
BEGIN
  IF NEW.task_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Bu task'ın toplam hedefini ve ilerlemesini hesapla
  SELECT 
    COALESCE(SUM(pi.target_qty), 0),
    COALESCE(SUM(pi.total_progress), 0)
  INTO v_target, v_completed
  FROM progress_items pi
  WHERE pi.task_id = NEW.task_id;

  IF v_target = 0 THEN
    v_pct := 0;
  ELSE
    v_pct := LEAST(ROUND((v_completed / v_target) * 100, 1), 100);
  END IF;

  UPDATE project_tasks
     SET progress_pct = v_pct,
         status = CASE
                    WHEN v_pct >= 100 THEN 'tamamlandi'::task_status
                    WHEN v_pct > 0    THEN 'devam_ediyor'::task_status
                    ELSE status
                  END,
         actual_start = CASE
                    WHEN v_pct > 0 AND actual_start IS NULL THEN CURRENT_DATE
                    ELSE actual_start
                  END,
         updated_at = now()
   WHERE id = NEW.task_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Trigger'ları bağla
-- ============================================================

-- progress_daily üzerindeki trigger (günlük miktar girişi)
DROP TRIGGER IF EXISTS trg_progress_daily_update_task ON progress_daily;
CREATE TRIGGER trg_progress_daily_update_task
  AFTER INSERT OR UPDATE OR DELETE ON progress_daily
  FOR EACH ROW EXECUTE FUNCTION update_task_progress_pct();

-- progress_items üzerindeki trigger (direkt güncelleme)
DROP TRIGGER IF EXISTS trg_progress_item_update_task ON progress_items;
CREATE TRIGGER trg_progress_item_update_task
  AFTER UPDATE OF total_progress ON progress_items
  FOR EACH ROW EXECUTE FUNCTION update_task_progress_from_item();

-- ============================================================
-- 6. progress_daily → progress_items.total_progress'ı
--    otomatik toplayan fonksiyon ve trigger
--    (qty_added birikimi → total_progress güncellenir)
-- ============================================================
CREATE OR REPLACE FUNCTION sync_progress_item_total()
RETURNS TRIGGER AS $$
DECLARE
  v_item_id uuid;
  v_total   numeric;
BEGIN
  v_item_id := COALESCE(NEW.item_id, OLD.item_id);

  SELECT COALESCE(SUM(pd.qty_added), 0)
    INTO v_total
    FROM progress_daily pd
   WHERE pd.item_id = v_item_id;

  UPDATE progress_items
     SET total_progress = v_total,
         updated_at     = now()
   WHERE id = v_item_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_item_total ON progress_daily;
CREATE TRIGGER trg_sync_item_total
  AFTER INSERT OR UPDATE OR DELETE ON progress_daily
  FOR EACH ROW EXECUTE FUNCTION sync_progress_item_total();

