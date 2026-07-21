-- 1) user_can_access_report'u get_project_scope ile tutarlı hale getir.
-- RLS politikalarında kullanıldığı için grantlara DOKUNULMUYOR.
CREATE OR REPLACE FUNCTION public.user_can_access_report(p_report_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT dr.created_by = auth.uid() FROM daily_reports dr WHERE dr.id = p_report_id),
    false
  )
  OR COALESCE(
    (SELECT s.authorized FROM daily_reports dr, get_project_scope(dr.project_id) s WHERE dr.id = p_report_id),
    false
  );
$function$;

-- 2) get_daily_report_detail: yetkisizse veri sızdırmadan tek alanlı sonuç dön.
CREATE OR REPLACE FUNCTION public.get_daily_report_detail(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'progress', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',         pd.id,
          'report_id',  pd.report_id,
          'item_id',    pd.item_id,
          'qty_added',  pd.qty_added,
          'note',       pd.note,
          'created_at', pd.created_at,
          'progress_items', jsonb_build_object(
            'name',           pi.name,
            'unit',           pi.unit,
            'target_qty',     pi.target_qty,
            'total_progress', pi.total_progress
          )
        )
      ), '[]'::jsonb)
      FROM progress_daily pd
      LEFT JOIN progress_items pi ON pi.id = pd.item_id
      WHERE pd.report_id = p_report_id
    ),
    'materials', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',               mu.id,
          'report_id',        mu.report_id,
          'project_id',       mu.project_id,
          'progress_item_id', mu.progress_item_id,
          'material_name',    mu.material_name,
          'quantity_used',    mu.quantity_used,
          'unit',             mu.unit,
          'description',      mu.description,
          'reason',           mu.reason,
          'created_at',       mu.created_at,
          'progress_items',   jsonb_build_object('name', pi.name)
        )
      ), '[]'::jsonb)
      FROM daily_report_material_usage mu
      LEFT JOIN progress_items pi ON pi.id = mu.progress_item_id
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
$function$;

