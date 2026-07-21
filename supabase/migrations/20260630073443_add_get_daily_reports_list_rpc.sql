
CREATE OR REPLACE FUNCTION get_daily_reports_list(
  p_project_id TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL,
  p_page       INT  DEFAULT 0,
  p_page_size  INT  DEFAULT 10
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_count INT;
BEGIN
  -- Sayfalama dışı toplam kayıt sayısı
  SELECT COUNT(*)
  INTO v_total_count
  FROM daily_reports dr
  WHERE dr.project_id = p_project_id
    AND (p_start_date IS NULL OR dr.report_date >= p_start_date)
    AND (p_end_date   IS NULL OR dr.report_date <= p_end_date);

  RETURN jsonb_build_object(
    'total_count', v_total_count,
    'reports', (
      SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id',             dr.id,
          'report_date',    dr.report_date,
          'weather',        dr.weather,
          'general_status', dr.general_status,
          'worker_count',   dr.worker_count,
          'notes',          dr.notes,
          'created_at',     dr.created_at,
          'created_by',     dr.created_by,
          'creator_name',   p.full_name
        ) AS row_data
        FROM daily_reports dr
        LEFT JOIN profiles p ON p.id = dr.created_by
        WHERE dr.project_id = p_project_id
          AND (p_start_date IS NULL OR dr.report_date >= p_start_date)
          AND (p_end_date   IS NULL OR dr.report_date <= p_end_date)
        ORDER BY dr.report_date DESC
        LIMIT  p_page_size
        OFFSET p_page * p_page_size
      ) sub
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_reports_list(TEXT, DATE, DATE, INT, INT) TO authenticated;

