-- Purchase requests and tickets are loaded from their canonical menu sources.
-- Keep this RPC focused on project, report and progress overview data.
CREATE OR REPLACE FUNCTION public.get_santiye_dashboard(
  p_project_id text,
  p_today date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_project jsonb;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT to_jsonb(p.*) INTO v_project
  FROM projects p
  WHERE p.id = p_project_id;

  RETURN jsonb_build_object(
    'authorized', true,
    'project', v_project,
    'today_report', (
      SELECT to_jsonb(r)
      FROM (
        SELECT id, report_date, general_status, worker_count, weather, weather_note, notes, created_at
        FROM daily_reports
        WHERE project_id = p_project_id AND report_date = p_today
        LIMIT 1
      ) r
    ),
    'recent_reports', COALESCE((
      SELECT jsonb_agg(r ORDER BY r.report_date DESC, r.created_at DESC)
      FROM (
        SELECT id, report_date, general_status, worker_count, weather, weather_note, notes, created_at
        FROM daily_reports
        WHERE project_id = p_project_id
        ORDER BY report_date DESC, created_at DESC
        LIMIT 30
      ) r
    ), '[]'::jsonb),
    'progress_summary', (
      SELECT to_jsonb(s)
      FROM vw_project_progress_summary s
      WHERE s.project_id = p_project_id
      LIMIT 1
    ),
    'progress_items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'name', task_name,
        'unit', unit,
        'target_qty', target_qty,
        'total_progress', total_progress,
        'category', category,
        'task_id', id
      ) ORDER BY planned_start NULLS LAST)
      FROM project_tasks
      WHERE project_id = p_project_id AND target_qty > 0
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_santiye_dashboard(text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_santiye_dashboard(text, date) TO authenticated;
