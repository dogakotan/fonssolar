CREATE OR REPLACE FUNCTION public.update_task_progress_from_item()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
         -- Durum insan kararıdır: miktar hesaplaması "tamamlandı"yı asla geri almaz
         -- ve kendiliğinden "tamamlandı" yapmaz — sadece "bekliyor"dan "devam_ediyor"a
         -- otomatik geçiş yapar (işin başladığının tespiti).
         status = CASE
                    WHEN status = 'tamamlandi'::task_status THEN status
                    WHEN v_pct > 0 AND status = 'bekliyor'::task_status THEN 'devam_ediyor'::task_status
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
$function$;

