CREATE OR REPLACE FUNCTION public.get_daily_reports_list(
  p_project_id text DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 10
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INT := p_page * p_page_size;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,

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
          'creator_name',   sub.creator_name,
          'project_id',     sub.project_id,
          'project_name',   sub.project_name
        ) ORDER BY sub.report_date DESC, sub.created_at DESC, sub.id
      ), '[]'::jsonb)
      FROM (
        SELECT
          dr.id, dr.report_date, dr.weather, dr.general_status,
          dr.worker_count, dr.notes, dr.created_at, dr.created_by,
          p.full_name AS creator_name,
          dr.project_id, pr.name AS project_name
        FROM daily_reports dr
        LEFT JOIN profiles p ON p.id = dr.created_by
        LEFT JOIN projects pr ON pr.id = dr.project_id
        WHERE (v_scope.scope_all OR dr.project_id = ANY(v_scope.project_ids))
          AND (p_start_date IS NULL OR dr.report_date >= p_start_date)
          AND (p_end_date   IS NULL OR dr.report_date <= p_end_date)
        ORDER BY dr.report_date DESC, dr.created_at DESC, dr.id
        LIMIT  p_page_size
        OFFSET v_offset
      ) sub
    ),

    'total_count', (
      SELECT COUNT(*)::int
      FROM daily_reports dr
      WHERE (v_scope.scope_all OR dr.project_id = ANY(v_scope.project_ids))
        AND (p_start_date IS NULL OR dr.report_date >= p_start_date)
        AND (p_end_date   IS NULL OR dr.report_date <= p_end_date)
    )
  );
END;
$function$;

