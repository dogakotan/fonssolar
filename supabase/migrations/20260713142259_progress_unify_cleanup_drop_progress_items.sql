-- 1) get_daily_report_detail: progress_items JOIN'lerini kaldır
CREATE OR REPLACE FUNCTION get_daily_report_detail(p_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT user_can_access_report(p_report_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'report', (
      SELECT jsonb_build_object(
        'id',             dr.id,
        'project_id',     dr.project_id,
        'report_date',    dr.report_date,
        'created_by',     dr.created_by,
        'weather',        dr.weather,
        'notes',          dr.notes,
        'general_status', dr.general_status,
        'worker_count',   dr.worker_count,
        'weather_note',   dr.weather_note,
        'created_at',     dr.created_at,
        'updated_at',     dr.updated_at,
        'profiles', CASE
          WHEN p.full_name IS NOT NULL
          THEN jsonb_build_object('full_name', p.full_name)
          ELSE NULL
        END
      )
      FROM daily_reports dr
      LEFT JOIN profiles p ON p.id = dr.created_by
      WHERE dr.id = p_report_id
    ),
    'project', (
      SELECT jsonb_build_object(
        'id',           pr.id,
        'name',         pr.name,
        'location',     pr.location,
        'capacity_kwp', pr.capacity_kwp
      )
      FROM daily_reports dr
      JOIN projects pr ON pr.id = dr.project_id
      WHERE dr.id = p_report_id
    ),
    'personnel', (
      SELECT COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
      FROM personnel_log_entries pl
      WHERE pl.report_id = p_report_id
    ),
    'machinery', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ml)), '[]'::jsonb)
      FROM machinery_logs ml
      WHERE ml.report_id = p_report_id
    ),
    'tasks', (
      SELECT COALESCE(jsonb_agg(to_jsonb(dt) ORDER BY dt.order_index), '[]'::jsonb)
      FROM daily_tasks dt
      WHERE dt.report_id = p_report_id
    ),
    'progress', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',         pd.id,
          'report_id',  pd.report_id,
          'task_id',    pd.task_id,
          'qty_added',  pd.qty_added,
          'note',       pd.note,
          'created_at', pd.created_at,
          'progress_items', jsonb_build_object(
            'name',           pt.task_name,
            'unit',           pt.unit,
            'target_qty',     pt.target_qty,
            'total_progress', pt.total_progress
          )
        )
      ), '[]'::jsonb)
      FROM progress_daily pd
      LEFT JOIN project_tasks pt ON pt.id = pd.task_id
      WHERE pd.report_id = p_report_id
    ),
    'materials', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',            mu.id,
          'report_id',     mu.report_id,
          'project_id',    mu.project_id,
          'material_name', mu.material_name,
          'quantity_used', mu.quantity_used,
          'unit',          mu.unit,
          'description',   mu.description,
          'reason',        mu.reason,
          'created_at',    mu.created_at
        )
      ), '[]'::jsonb)
      FROM daily_report_material_usage mu
      WHERE mu.report_id = p_report_id
    ),
    'photos', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ph)), '[]'::jsonb)
      FROM daily_report_photos ph
      WHERE ph.report_id = p_report_id
    ),
    'issues', (
      SELECT COALESCE(jsonb_agg(to_jsonb(iss)), '[]'::jsonb)
      FROM daily_report_issues iss
      WHERE iss.report_id = p_report_id
    )
  );
END;
$$;

-- 2) daily_report_material_usage.progress_item_id kolonu (ve FK'si) kaldır
ALTER TABLE daily_report_material_usage DROP COLUMN progress_item_id;

-- 3) progress_daily uzerindeki 3 eski (disabled) trigger'i kaldir
DROP TRIGGER trg_progress_daily_update_task ON progress_daily;
DROP TRIGGER trg_set_task_actual_start ON progress_daily;
DROP TRIGGER trg_sync_item_total ON progress_daily;

-- 4) progress_items tablosunu kaldir. CASCADE: progress_daily.item_id FK'si (kolon kalir,
--    veri korunur), trg_progress_item_update_task (bu tablonun kendi trigger'i), ve
--    vw_progress_timeline (yalnizca zaten olu get_project_overview/get_project_progress_export
--    tarafindan kullaniliyordu, dogrulandi) otomatik duser.
DROP TABLE progress_items CASCADE;

-- 5) Artik hicbir trigger tarafindan kullanilmayan eski trigger fonksiyonlari + dead fonksiyonlar
DROP FUNCTION update_task_progress_pct();
DROP FUNCTION sync_progress_item_total();
DROP FUNCTION update_task_progress_from_item();
DROP FUNCTION fn_set_task_actual_start();
DROP FUNCTION sync_progress_total();
DROP FUNCTION increment_progress_total(uuid, numeric);

-- 6) Eski save_daily_report overload'lari (11 parametreli ve 14 parametreli)
DROP FUNCTION save_daily_report(text,date,uuid,text,integer,text,text,text,jsonb,jsonb,jsonb);
DROP FUNCTION save_daily_report(text,date,uuid,text,integer,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb);

