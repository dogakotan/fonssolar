
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
  v_offset INT := p_page * p_page_size;
BEGIN
  RETURN jsonb_build_object(

    -- Sayfalı rapor listesi + creator adı tek sorguda
    'reports', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',             sub.id,
          'report_date',    sub.report_date,
          'weather',        sub.weather,
          'general_status', sub.general_status,
          'worker_count',   sub.worker_count,
          'notes',          sub.notes,
          'created_at',     sub.created_at,
          'created_by',     sub.created_by,
          'creator_name',   sub.creator_name
        ) ORDER BY sub.report_date DESC
      ), '[]'::jsonb)
      FROM (
        SELECT
          dr.id, dr.report_date, dr.weather, dr.general_status,
          dr.worker_count, dr.notes, dr.created_at, dr.created_by,
          p.full_name AS creator_name
        FROM daily_reports dr
        LEFT JOIN profiles p ON p.id = dr.created_by
        WHERE dr.project_id = p_project_id
          AND (p_start_date IS NULL OR dr.report_date >= p_start_date)
          AND (p_end_date   IS NULL OR dr.report_date <= p_end_date)
        ORDER BY dr.report_date DESC
        LIMIT  p_page_size
        OFFSET v_offset
      ) sub
    ),

    -- Toplam sayı (sayfalama için)
    'total_count', (
      SELECT COUNT(*)::int
      FROM daily_reports dr
      WHERE dr.project_id = p_project_id
        AND (p_start_date IS NULL OR dr.report_date >= p_start_date)
        AND (p_end_date   IS NULL OR dr.report_date <= p_end_date)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_daily_reports_list(TEXT, DATE, DATE, INT, INT) TO authenticated;

