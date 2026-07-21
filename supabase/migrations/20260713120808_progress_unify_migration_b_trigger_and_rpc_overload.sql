-- Migration B (genişletilmiş): project_tasks'a dashboard kolonları +
-- konsolide trigger + eski 4 trigger'ın disable'ı + yeni save_daily_report overload'ı

-- 0) Güvenlik: olası kaçırılmış task_id backfill'i (idempotent, no-op bekleniyor)
UPDATE progress_daily pd
SET task_id = pi.task_id
FROM progress_items pi
WHERE pi.id = pd.item_id AND pd.task_id IS NULL;

-- 1) item_id artık zorunlu değil
ALTER TABLE progress_daily ALTER COLUMN item_id DROP NOT NULL;

-- 2) get_project_dashboard'ın (canlı — TabGenel.jsx) dashboard_visible/dashboard_order
--    filtresi/sıralaması korunacak — project_tasks'a aynı kolonları ekleyip backfill ediyoruz
ALTER TABLE project_tasks
  ADD COLUMN dashboard_visible boolean NOT NULL DEFAULT false,
  ADD COLUMN dashboard_order integer NOT NULL DEFAULT 0;

UPDATE project_tasks pt
SET dashboard_visible = pi.dashboard_visible,
    dashboard_order   = pi.dashboard_order
FROM progress_items pi
WHERE pi.task_id = pt.id;

-- 3) Yeni konsolide trigger fonksiyonu
CREATE OR REPLACE FUNCTION public.sync_task_progress_from_daily()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_task_id   uuid;
  v_target    numeric;
  v_completed numeric;
  v_pct       numeric;
BEGIN
  v_task_id := COALESCE(NEW.task_id, OLD.task_id);
  IF v_task_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(qty_added), 0)
    INTO v_completed
    FROM progress_daily
   WHERE task_id = v_task_id;

  SELECT target_qty INTO v_target FROM project_tasks WHERE id = v_task_id;

  IF v_target IS NULL OR v_target = 0 THEN
    v_pct := 0;
  ELSE
    v_pct := LEAST(ROUND((v_completed / v_target) * 100, 1), 100);
  END IF;

  UPDATE project_tasks
     SET total_progress = v_completed,
         progress_pct   = v_pct,
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
   WHERE id = v_task_id;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE TRIGGER trg_sync_task_progress_from_daily
AFTER INSERT OR UPDATE OR DELETE ON progress_daily
FOR EACH ROW EXECUTE FUNCTION sync_task_progress_from_daily();

-- 4) Eski 4 trigger'ı devre dışı bırak (fonksiyonlara dokunulmuyor)
ALTER TABLE progress_daily DISABLE TRIGGER trg_progress_daily_update_task;   -- update_task_progress_pct
ALTER TABLE progress_daily DISABLE TRIGGER trg_sync_item_total;             -- sync_progress_item_total
ALTER TABLE progress_daily DISABLE TRIGGER trg_set_task_actual_start;       -- fn_set_task_actual_start
ALTER TABLE progress_items DISABLE TRIGGER trg_progress_item_update_task;   -- update_task_progress_from_item

-- 5) save_daily_report — YENİ 15 parametreli overload
CREATE OR REPLACE FUNCTION public.save_daily_report(
  p_project_id text,
  p_report_date date,
  p_created_by uuid,
  p_general_status text,
  p_worker_count integer,
  p_weather text,
  p_weather_note text,
  p_notes text,
  p_personnel jsonb,
  p_machinery jsonb,
  p_progress jsonb DEFAULT '[]'::jsonb,
  p_daily_tasks jsonb DEFAULT '[]'::jsonb,
  p_materials jsonb DEFAULT '[]'::jsonb,
  p_issues jsonb DEFAULT '[]'::jsonb,
  p_task_progress jsonb DEFAULT '[]'::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_rid uuid;
begin
  insert into daily_reports (
    project_id, report_date, created_by,
    general_status, worker_count, weather, weather_note, notes, updated_at
  )
  values (
    p_project_id, p_report_date, p_created_by,
    p_general_status, p_worker_count, p_weather,
    nullif(p_weather_note, ''), nullif(p_notes, ''), now()
  )
  on conflict (project_id, report_date) do update set
    general_status = excluded.general_status,
    worker_count   = excluded.worker_count,
    weather        = excluded.weather,
    weather_note   = excluded.weather_note,
    notes          = excluded.notes,
    updated_at     = now()
  returning id into v_rid;

  delete from personnel_log_entries where report_id = v_rid;
  insert into personnel_log_entries (report_id, shift, department, count)
  select v_rid, item->>'shift', item->>'department', (item->>'count')::integer
  from   jsonb_array_elements(p_personnel) as item
  where  (item->>'count')::integer > 0;

  delete from machinery_logs where report_id = v_rid;
  insert into machinery_logs (report_id, machine_type, count, status, notes)
  select v_rid, item->>'machine_type', (item->>'count')::integer, item->>'status', nullif(item->>'notes', '')
  from   jsonb_array_elements(p_machinery) as item
  where  (item->>'count')::integer > 0;

  delete from progress_daily where report_id = v_rid;
  insert into progress_daily (report_id, task_id, qty_added, note)
  select v_rid, (item->>'task_id')::uuid, (item->>'qty_added')::numeric, nullif(item->>'note', '')
  from   jsonb_array_elements(p_task_progress) as item
  where  coalesce((item->>'qty_added')::numeric, 0) > 0;

  delete from daily_tasks where report_id = v_rid;
  insert into daily_tasks (report_id, type, description, order_index)
  select v_rid, item->>'type', item->>'description', coalesce((item->>'order_index')::integer, 0)
  from   jsonb_array_elements(p_daily_tasks) as item
  where  nullif(item->>'description', '') is not null;

  delete from daily_report_material_usage where report_id = v_rid;
  insert into daily_report_material_usage (report_id, project_id, progress_item_id, material_name, quantity_used, unit, description, reason)
  select v_rid, p_project_id, nullif(item->>'progress_item_id', '')::uuid, item->>'material_name',
         coalesce((item->>'quantity_used')::numeric, 0), coalesce(nullif(item->>'unit', ''), 'Adet'),
         nullif(item->>'description', ''), nullif(item->>'reason', '')
  from   jsonb_array_elements(p_materials) as item
  where  nullif(item->>'material_name', '') is not null;

  delete from daily_report_issues where report_id = v_rid;
  insert into daily_report_issues (report_id, project_id, topic, priority, assigned_to, description, resolution_status)
  select v_rid, p_project_id, item->>'topic', coalesce(nullif(item->>'priority', ''), 'orta'),
         nullif(item->>'assigned_to', ''), nullif(item->>'description', ''), coalesce(nullif(item->>'resolution_status', ''), 'açık')
  from   jsonb_array_elements(p_issues) as item
  where  nullif(item->>'topic', '') is not null;

  return v_rid;
end;
$function$;

