
CREATE OR REPLACE FUNCTION get_santiye_dashboard(
  p_project_id TEXT,
  p_today      DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project JSONB;
BEGIN
  SELECT to_jsonb(p.*) INTO v_project
  FROM projects p
  WHERE p.id = p_project_id;

  RETURN jsonb_build_object(
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
    'purchase_requests', COALESCE((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC)
      FROM (
        SELECT id, title, urgency, status, created_at
        FROM purchase_requests
        WHERE project_id = p_project_id
          AND status IN ('bekliyor', E'onaylanдı')
        ORDER BY created_at DESC
      ) r
    ), '[]'::jsonb),
    'tickets', COALESCE((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC)
      FROM (
        SELECT id, title, severity, status, created_at, category
        FROM tickets
        WHERE project_id = p_project_id
          AND status IN (E'gönderildi', E'açık', E'işlemde')
        ORDER BY created_at DESC
      ) r
    ), '[]'::jsonb),
    'pr_count', (
      SELECT COUNT(*)::int
      FROM purchase_requests
      WHERE project_id = p_project_id
        AND status IN ('bekliyor', E'onaylanдı')
    ),
    'ticket_count', (
      SELECT COUNT(*)::int
      FROM tickets
      WHERE project_id = p_project_id
        AND status IN (E'gönderildi', E'açık', E'işlemde')
    ),
    'progress_summary', (
      SELECT to_jsonb(s)
      FROM vw_project_progress_summary s
      WHERE s.project_id = p_project_id
      LIMIT 1
    ),
    'progress_items', COALESCE((
      SELECT jsonb_agg(i ORDER BY i.order_index)
      FROM (
        SELECT id, name, unit, target_qty, total_progress, category, order_index
        FROM progress_items
        WHERE project_id = p_project_id AND target_qty > 0
        ORDER BY order_index
        LIMIT 10
      ) i
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_santiye_dashboard(TEXT, DATE) TO authenticated;

