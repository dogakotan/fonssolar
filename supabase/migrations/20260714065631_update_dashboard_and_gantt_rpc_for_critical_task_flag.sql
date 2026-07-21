
CREATE OR REPLACE FUNCTION public.get_project_dashboard(p_project_id text, p_effective_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_latest_report_id UUID;
  v_latest_weather   TEXT;
BEGIN
  SELECT id, weather
  INTO v_latest_report_id, v_latest_weather
  FROM daily_reports
  WHERE project_id = p_project_id
    AND report_date <= p_effective_date
  ORDER BY report_date DESC
  LIMIT 1;

  RETURN jsonb_build_object(

    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    'tasks', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'task_code',    t.task_code,
          'task_name',    t.task_name,
          'group_label',  t.group_label,
          'category',     t.category,
          'planned_start',t.planned_start,
          'planned_end',  t.planned_end,
          'progress_pct', t.progress_pct,
          'status',       t.status,
          'is_critical',  t.is_critical
        ) ORDER BY t.planned_start
      ), '[]'::jsonb)
      FROM project_tasks t
      WHERE t.project_id = p_project_id
        AND t.planned_start <= p_effective_date
    ),

    'progress_items', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'name',           pt.task_name,
          'unit',           pt.unit,
          'target_qty',     pt.target_qty,
          'total_progress', sub.filtered_total,
          'dashboard_visible', pt.dashboard_visible,
          'dashboard_order',   pt.dashboard_order
        ) ORDER BY pt.dashboard_order
      ), '[]'::jsonb)
      FROM project_tasks pt
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS filtered_total
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.task_id = pt.id
          AND dr.report_date <= p_effective_date
      ) sub ON true
      WHERE pt.project_id = p_project_id
        AND pt.dashboard_visible = true
    ),

    'critical', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'task_code',     t.task_code,
          'task_name',     t.task_name,
          'category',      t.category,
          'planned_start', t.planned_start,
          'planned_end',   t.planned_end,
          'status',        t.status,
          'progress_pct',  t.progress_pct
        ) ORDER BY t.planned_start
      ), '[]'::jsonb)
      FROM project_tasks t
      WHERE t.project_id = p_project_id
        AND t.is_critical = true
        AND t.planned_start <= p_effective_date
    ),

    'category_weights', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'category',      w.category,
          'weight_pct',    w.weight_pct,
          'avg_progress',  COALESCE(cat_avg.avg_progress, 0)
        ) ORDER BY w.weight_pct DESC
      ), '[]'::jsonb)
      FROM project_category_weights w
      LEFT JOIN (
        SELECT category, AVG(progress_pct) AS avg_progress
        FROM project_tasks
        WHERE project_id = p_project_id
        GROUP BY category
      ) cat_avg ON cat_avg.category = w.category
      WHERE w.project_id = p_project_id
    ),

    'budget_lines', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('name', b.name, 'planned_amount', b.planned_amount)
      ), '[]'::jsonb)
      FROM budget_lines b
      WHERE b.project_id = p_project_id
    ),

    'invoices', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('amount', i.amount, 'status', i.status)
      ), '[]'::jsonb)
      FROM invoices i
      WHERE i.project_id = p_project_id
    ),

    'risks', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', r.id, 'title', r.title, 'severity', r.severity,
          'probability', r.probability, 'impact', r.impact, 'status', r.status
        )
      ), '[]'::jsonb)
      FROM project_risks r
      WHERE r.project_id = p_project_id AND r.status = 'açık'
    ),

    'weather', v_latest_weather,

    'lost_days', (
      SELECT COUNT(*)::int
      FROM daily_reports
      WHERE project_id = p_project_id
        AND report_date <= p_effective_date
        AND weather IN ('yağmurlu', 'karlı', 'fırtınalı')
    ),

    'inspections', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('id', q.id, 'result', q.result)
      ), '[]'::jsonb)
      FROM quality_inspections q
      WHERE q.project_id = p_project_id
    ),

    'open_tickets', (
      SELECT COUNT(*)::int
      FROM tickets
      WHERE project_id = p_project_id AND status != 'kapatıldı'
    ),

    'pending_pr', (
      SELECT COUNT(*)::int
      FROM purchase_requests
      WHERE project_id = p_project_id AND status = 'bekliyor'
    ),

    'recent_tickets', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', t.id, 'title', t.title, 'severity', t.severity,
          'status', t.status, 'created_at', t.created_at, 'category', t.category
        ) ORDER BY t.created_at DESC
      ), '[]'::jsonb)
      FROM (
        SELECT id, title, severity, status, created_at, category
        FROM tickets
        WHERE project_id = p_project_id AND status != 'kapatıldı'
        ORDER BY created_at DESC
        LIMIT 8
      ) t
    ),

    'personnel', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('count', p.count, 'shift', p.shift, 'department', p.department)
      ), '[]'::jsonb)
      FROM personnel_log_entries p
      WHERE p.report_id = v_latest_report_id
    ),

    'machinery', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('count', m.count, 'status', m.status)
      ), '[]'::jsonb)
      FROM machinery_logs m
      WHERE m.report_id = v_latest_report_id
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_project_gantt(p_project_id text, p_filter_date date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,

    'project', (
      SELECT jsonb_build_object(
        'id',           p.id,
        'name',         p.name,
        'capacity_kwp', p.capacity_kwp,
        'location',     p.location,
        'start_date',   p.start_date,
        'target_date',  p.target_date
      )
      FROM projects p
      WHERE p.id = p_project_id
    ),

    'tasks', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',               pt.id,
          'task_code',        pt.task_code,
          'task_name',        pt.task_name,
          'group_label',      pt.group_label,
          'category',         pt.category,
          'planned_start',    pt.planned_start,
          'planned_end',      pt.planned_end,
          'progress_pct',     pt.progress_pct,
          'status',           pt.status,
          'responsible_role', pt.responsible_role,
          'equipment_notes',  pt.equipment_notes,
          'notes',            pt.notes,
          'is_critical',      pt.is_critical
        ) ORDER BY pt.planned_start ASC NULLS LAST
      ), '[]'::jsonb)
      FROM project_tasks pt
      WHERE pt.project_id = p_project_id
    ),

    'task_progress', (
      SELECT COALESCE(
        jsonb_object_agg(task_id::text, ROUND(avg_pct::numeric, 4)),
        '{}'::jsonb
      )
      FROM (
        SELECT
          pt.id AS task_id,
          AVG(
            LEAST(100.0,
              COALESCE(sums.total_qty, 0.0)
              / NULLIF(pt.target_qty::numeric, 0)
              * 100.0
            )
          ) AS avg_pct
        FROM project_tasks pt
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
          FROM progress_daily pd
          JOIN daily_reports dr ON dr.id = pd.report_id
          WHERE pd.task_id = pt.id
            AND dr.report_date <= p_filter_date
        ) sums ON TRUE
        WHERE pt.project_id = p_project_id
          AND pt.target_qty > 0
        GROUP BY pt.id
      ) tp
    ),

    'context', jsonb_build_object(
      'latest_report', (
        SELECT jsonb_build_object(
          'report_date', dr.report_date,
          'notes',       dr.notes
        )
        FROM daily_reports dr
        WHERE dr.project_id = p_project_id
        ORDER BY dr.report_date DESC
        LIMIT 1
      ),
      'latest_purchase', (
        SELECT jsonb_build_object(
          'id',         pr.id,
          'title',      pr.title,
          'status',     pr.status,
          'created_at', pr.created_at
        )
        FROM purchase_requests pr
        WHERE pr.project_id = p_project_id
        ORDER BY pr.created_at DESC
        LIMIT 1
      ),
      'top_risk', (
        SELECT to_jsonb(r)
        FROM project_risks r
        WHERE r.project_id = p_project_id
          AND r.status <> 'kapandi'
        LIMIT 1
      )
    )

  );
END;
$function$;

