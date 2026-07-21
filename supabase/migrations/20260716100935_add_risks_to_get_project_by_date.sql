CREATE OR REPLACE FUNCTION public.get_project_by_date(p_project_id text, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_report_id UUID;
  v_scope record;
BEGIN
  SELECT * INTO v_scope FROM get_project_scope(p_project_id);
  IF NOT v_scope.authorized THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT id INTO v_report_id
  FROM daily_reports
  WHERE project_id = p_project_id
    AND report_date <= p_date
  ORDER BY report_date DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'authorized', true,

    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    'report', (
      SELECT jsonb_build_object(
        'id',             dr.id,
        'report_date',    dr.report_date,
        'weather',        dr.weather,
        'notes',          dr.notes,
        'worker_count',   dr.worker_count,
        'general_status', dr.general_status,
        'creator_name',   COALESCE(pr.full_name, pr.email)
      )
      FROM daily_reports dr
      LEFT JOIN profiles pr ON pr.id = dr.created_by
      WHERE dr.id = v_report_id
    ),

    'personnel', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'shift',      ple.shift,
        'department', ple.department,
        'count',      ple.count
      )), '[]'::jsonb)
      FROM personnel_log_entries ple
      WHERE ple.report_id = v_report_id
    ),

    'machinery', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'machine_type', ml.machine_type,
        'count',        ml.count,
        'status',       ml.status
      )), '[]'::jsonb)
      FROM machinery_logs ml
      WHERE ml.report_id = v_report_id
    ),

    'progress_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',            pt.id,
        'name',          pt.task_name,
        'unit',          pt.unit,
        'category',      pt.category,
        'target_qty',    pt.target_qty,
        'total_to_date', COALESCE(sums.total_qty, 0),
        'pct',           ROUND(
                           LEAST(100.0,
                             COALESCE(sums.total_qty, 0.0)
                             / NULLIF(pt.target_qty::numeric, 0) * 100.0
                           )::numeric, 1)
      ) ORDER BY pt.planned_start NULLS LAST), '[]'::jsonb)
      FROM project_tasks pt
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.task_id = pt.id
          AND dr.report_date <= p_date
      ) sums ON TRUE
      WHERE pt.project_id = p_project_id
    ),

    'overall_pct', (
      SELECT ROUND(
        COALESCE(
          AVG(
            LEAST(100.0,
              COALESCE(sums.total_qty, 0.0)
              / NULLIF(pt.target_qty::numeric, 0) * 100.0
            )
          ), 0
        )::numeric, 1
      )
      FROM project_tasks pt
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.task_id = pt.id
          AND dr.report_date <= p_date
      ) sums ON TRUE
      WHERE pt.project_id = p_project_id
        AND pt.target_qty > 0
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

    'risks', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',          r.id,
          'title',       r.title,
          'severity',    r.severity,
          'source',      r.source,
          'rule_code',   r.rule_code,
          'subject_ref', r.subject_ref
        ) ORDER BY
          CASE r.severity
            WHEN 'kritik' THEN 1
            WHEN 'yüksek' THEN 2
            WHEN 'orta'   THEN 3
            WHEN 'düşük'  THEN 4
            ELSE 5
          END,
          r.created_at DESC
      ), '[]'::jsonb)
      FROM project_risks r
      WHERE r.project_id = p_project_id
        AND r.status = 'açık'
    ),

    'tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',            pt.id,
        'task_code',     pt.task_code,
        'name',          pt.task_name,
        'task_name',     pt.task_name,
        'category',      pt.category,
        'planned_start', pt.planned_start,
        'planned_end',   pt.planned_end,
        'start_date',    pt.planned_start,
        'due_date',      pt.planned_end,
        'actual_start',  pt.actual_start,
        'progress_pct',  pt.progress_pct,
        'progress',      pt.progress_pct,
        'status',        pt.status,
        'responsible',   pt.responsible,
        'team_size',     pt.team_size
      ) ORDER BY pt.planned_start NULLS LAST), '[]'::jsonb)
      FROM project_tasks pt
      WHERE pt.project_id = p_project_id
    ),

    'tickets', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',         t.id,
        'title',      t.title,
        'severity',   t.severity,
        'status',     t.status,
        'category',   t.category,
        'created_at', t.created_at
      ) ORDER BY t.created_at DESC), '[]'::jsonb)
      FROM tickets t
      WHERE t.project_id = p_project_id
        AND t.created_at::date <= p_date
        AND t.status <> 'kapatıldı'
      LIMIT 8
    ),

    'purchases', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',        pr.id,
        'title',     pr.title,
        'status',    pr.status,
        'urgency',   pr.urgency,
        'notes',     pr.notes,
        'created_at',pr.created_at
      ) ORDER BY pr.created_at DESC), '[]'::jsonb)
      FROM purchase_requests pr
      WHERE pr.project_id = p_project_id
        AND pr.created_at::date <= p_date
      LIMIT 6
    ),

    'budget_lines', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',             bl.id,
        'category',       bl.category,
        'planned_amount', bl.planned_amount
      )), '[]'::jsonb)
      FROM budget_lines bl
      WHERE bl.project_id = p_project_id
    ),

    'invoices', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',           inv.id,
        'total_amount', inv.total_amount,
        'amount',       inv.amount,
        'status',       inv.status,
        'created_at',   inv.created_at,
        'invoice_date', inv.invoice_date
      )), '[]'::jsonb)
      FROM invoices inv
      WHERE inv.project_id = p_project_id
        AND COALESCE(inv.invoice_date, inv.created_at::date) <= p_date
    ),

    'weather_lost_days', (
      SELECT COUNT(*)
      FROM daily_reports dr
      WHERE dr.project_id = p_project_id
        AND dr.report_date <= p_date
        AND dr.weather IN ('yağmurlu', 'karlı', 'fırtınalı')
    )

  );
END;
$function$

