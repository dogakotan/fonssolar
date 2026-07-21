create or replace function public.get_santiye_dashboard(p_project_id text, p_today date default current_date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_project JSONB;
  v_scope record;
  v_status_pr     TEXT[] := ARRAY['talep_olusturuldu', 'onaylandi', 'fatura_onay_bekliyor'];
  v_status_ticket TEXT[] := ARRAY['gönderildi', 'açık', 'işlemde'];
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
    'purchase_requests', COALESCE((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC)
      FROM (
        SELECT id, title, urgency, status, created_at
        FROM purchase_requests
        WHERE project_id = p_project_id
          AND status = ANY(v_status_pr)
        ORDER BY created_at DESC
      ) r
    ), '[]'::jsonb),
    'tickets', COALESCE((
      SELECT jsonb_agg(r ORDER BY r.created_at DESC)
      FROM (
        SELECT id, title, severity, status, created_at, category
        FROM tickets
        WHERE project_id = p_project_id
          AND status = ANY(v_status_ticket)
        ORDER BY created_at DESC
      ) r
    ), '[]'::jsonb),
    'pr_count', (
      SELECT COUNT(*)::int
      FROM purchase_requests
      WHERE project_id = p_project_id
        AND status = ANY(v_status_pr)
    ),
    'ticket_count', (
      SELECT COUNT(*)::int
      FROM tickets
      WHERE project_id = p_project_id
        AND status = ANY(v_status_ticket)
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
        SELECT id, name, unit, target_qty, total_progress, category, order_index, task_id
        FROM progress_items
        WHERE project_id = p_project_id AND target_qty > 0
        ORDER BY order_index
        LIMIT 10
      ) i
    ), '[]'::jsonb)
  );
END;
$function$;

