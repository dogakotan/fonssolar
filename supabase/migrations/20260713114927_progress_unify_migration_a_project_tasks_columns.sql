-- Migration A: project_tasks'a ilerleme kolonları ekle, progress_items/progress_daily'den backfill et
-- (additive — hiçbir mevcut kolon/tablo/trigger'a dokunulmuyor, kırmaz)

ALTER TABLE project_tasks
  ADD COLUMN target_qty numeric,
  ADD COLUMN unit text,
  ADD COLUMN total_progress numeric NOT NULL DEFAULT 0;

-- 1) target_qty/unit: progress_items'tan 1:1 kopya (0 çakışma, 0 orphan doğrulandı)
UPDATE project_tasks pt
SET target_qty = pi.target_qty,
    unit        = pi.unit
FROM progress_items pi
WHERE pi.task_id = pt.id;

-- 2) total_progress: progress_items.total_progress'ten DEĞİL, progress_daily.qty_added
--    SUM'ından yeniden hesaplanıyor (kaynak-doğru veri; doğrulama sorgusunda 27 kalemden
--    1'i marjinal farklıydı, düzeltiliyor)
UPDATE project_tasks pt
SET total_progress = sub.total
FROM (
  SELECT pi.task_id, SUM(pd.qty_added) AS total
  FROM progress_items pi
  JOIN progress_daily pd ON pd.item_id = pi.id
  WHERE pi.task_id IS NOT NULL
  GROUP BY pi.task_id
) sub
WHERE sub.task_id = pt.id;

-- 3) progress_daily'ye task_id ekle (nullable, FK)
ALTER TABLE progress_daily
  ADD COLUMN task_id uuid REFERENCES project_tasks(id);

-- Bu UPDATE, total_progress'i SET listesine içeren sync_progress_item_total() üzerinden
-- update_task_progress_from_item()'ı cascade tetikler — o fonksiyondaki mevcut (Migration
-- B'de zaten kaldırılacak) 'bekliyor'::task_status yazım hatası (gerçek enum: 'beklemede')
-- yüzünden hata verir. Bu tetikleyiciyi sadece bu backfill sırasında geçici olarak
-- devre dışı bırakıp hemen ardından tam olarak önceki (etkin) haline geri alıyoruz —
-- fonksiyonun kendisine dokunulmuyor, davranışı Migration A sonrası da öncekiyle birebir aynı.
ALTER TABLE progress_items DISABLE TRIGGER trg_progress_item_update_task;

UPDATE progress_daily pd
SET task_id = pi.task_id
FROM progress_items pi
WHERE pi.id = pd.item_id;

ALTER TABLE progress_items ENABLE TRIGGER trg_progress_item_update_task;

CREATE INDEX idx_progress_daily_task_id ON progress_daily(task_id);

