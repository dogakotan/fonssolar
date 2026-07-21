
CREATE OR REPLACE FUNCTION get_daily_report_detail(
  p_report_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(

    -- 1. Rapor + oluşturucu adı (profiles JOIN)
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

    -- 2. Personel (tüm sütunlar)
    'personnel', (
      SELECT COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
      FROM personnel_log_entries pl
      WHERE pl.report_id = p_report_id
    ),

    -- 3. Makine (tüm sütunlar)
    'machinery', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ml)), '[]'::jsonb)
      FROM machinery_logs ml
      WHERE ml.report_id = p_report_id
    ),

    -- 4. Günlük ilerleme + bağlı progress_item bilgisi
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

    -- 5. Malzeme kullanımı + progress_item adı
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

    -- 6. Fotoğraflar
    'photos', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ph)), '[]'::jsonb)
      FROM daily_report_photos ph
      WHERE ph.report_id = p_report_id
    ),

    -- 7. Sorunlar / issues
    'issues', (
      SELECT COALESCE(jsonb_agg(to_jsonb(iss)), '[]'::jsonb)
      FROM daily_report_issues iss
      WHERE iss.report_id = p_report_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_report_detail(UUID) TO authenticated;

