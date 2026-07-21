
CREATE OR REPLACE FUNCTION public.get_project_overview(
  p_project_id text,
  p_start_date date,
  p_end_date   date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_report_ids UUID[];
BEGIN
  SELECT COALESCE(ARRAY_AGG(id), '{}')
  INTO v_report_ids
  FROM daily_reports
  WHERE project_id = p_project_id
    AND report_date >= p_start_date
    AND report_date <= p_end_date;

  RETURN jsonb_build_object(

    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    'progress_summary', (
      SELECT to_jsonb(s)
      FROM vw_project_progress_summary s
      WHERE s.project_id = p_project_id
    ),

    'period_progress', (
      SELECT to_jsonb(t)
      FROM vw_progress_timeline t
      WHERE t.project_id = p_project_id
        AND t.report_date <= p_end_date
      ORDER BY t.report_date DESC
      LIMIT 1
    ),

    -- Tarihe göre süzülmüş birikimli ortalama ilerleme yüzdesi
    'overall_progress_pct', (
      SELECT ROUND(
        COALESCE(
          AVG(
            LEAST(100.0,
              COALESCE(sums.total_qty, 0.0)
              / NULLIF(pi.target_qty::numeric, 0)
              * 100.0
            )
          ),
          0
        )::numeric, 1
      )
      FROM progress_items pi
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.item_id = pi.id
          AND dr.report_date <= p_end_date
      ) sums ON TRUE
      WHERE pi.project_id = p_project_id
        AND pi.target_qty > 0
    ),

    -- İmalat kalemleri — tarihe kadar birikimli miktar ile birlikte
    'progress_items', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',            pi.id,
        'name',          pi.name,
        'unit',          pi.unit,
        'category',      pi.category,
        'target_qty',    pi.target_qty,
        'total_to_date', COALESCE(sums.total_qty, 0),
        'pct',           ROUND(
                           LEAST(100.0,
                             COALESCE(sums.total_qty, 0.0)
                             / NULLIF(pi.target_qty::numeric, 0) * 100.0
                           )::numeric, 1)
      ) ORDER BY pi.order_index), '[]'::jsonb)
      FROM progress_items pi
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.item_id = pi.id
          AND dr.report_date <= p_end_date
      ) sums ON TRUE
      WHERE pi.project_id = p_project_id
    ),

    'daily_reports', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',           dr.id,
          'report_date',  dr.report_date,
          'weather',      dr.weather,
          'weather_note', dr.weather_note,
          'notes',        dr.notes,
          'created_by',   dr.created_by,
          'worker_count', dr.worker_count,
          'creator_name', COALESCE(pr.full_name, pr.email)
        ) ORDER BY dr.report_date DESC
      ), '[]'::jsonb)
      FROM daily_reports dr
      LEFT JOIN profiles pr ON pr.id = dr.created_by
      WHERE dr.project_id = p_project_id
        AND dr.report_date >= p_start_date
        AND dr.report_date <= p_end_date
    ),

    'personnel', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'report_id',  ple.report_id,
        'shift',      ple.shift,
        'department', ple.department,
        'count',      ple.count
      )), '[]'::jsonb)
      FROM personnel_log_entries ple
      WHERE ple.report_id = ANY(v_report_ids)
    ),

    'machinery', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'report_id',    ml.report_id,
        'machine_type', ml.machine_type,
        'count',        ml.count,
        'status',       ml.status
      )), '[]'::jsonb)
      FROM machinery_logs ml
      WHERE ml.report_id = ANY(v_report_ids)
    ),

    'daily_tasks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'report_id',   dt.report_id,
        'type',        dt.type,
        'description', dt.description,
        'order_index', dt.order_index
      ) ORDER BY dt.order_index), '[]'::jsonb)
      FROM daily_tasks dt
      WHERE dt.report_id = ANY(v_report_ids)
    ),

    'purchases', (
      SELECT COALESCE(jsonb_agg(sub.row_data), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id',           pr.id,
          'title',        pr.title,
          'request_note', pr.request_note,
          'description',  pr.description,
          'status',       pr.status,
          'delivery_date',pr.delivery_date,
          'required_date',pr.required_date,
          'created_at',   pr.created_at
        ) AS row_data
        FROM purchase_requests pr
        WHERE pr.project_id = p_project_id
          AND pr.created_at <= (p_end_date + INTERVAL '1 day')::timestamptz
        ORDER BY pr.created_at DESC
        LIMIT 6
      ) sub
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
    ),

    'risks', (
      SELECT COALESCE(jsonb_agg(sub.row_data), '[]'::jsonb)
      FROM (
        SELECT to_jsonb(r) AS row_data
        FROM project_risks r
        WHERE r.project_id = p_project_id
          AND r.status <> 'kapandi'
        LIMIT 6
      ) sub
    ),

    'tickets', (
      SELECT COALESCE(jsonb_agg(sub.row_data), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id',         t.id,
          'title',      t.title,
          'severity',   t.severity,
          'status',     t.status,
          'created_at', t.created_at
        ) AS row_data
        FROM tickets t
        WHERE t.project_id = p_project_id
          AND t.status <> 'kapat' || chr(305) || 'ld' || chr(305)
        ORDER BY t.created_at DESC
        LIMIT 8
      ) sub
    ),

    'photos', (
      SELECT COALESCE(jsonb_agg(sub.row_data), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'id',           ph.id,
          'storage_path', ph.storage_path,
          'report_date',  ph.report_date,
          'created_at',   ph.created_at
        ) AS row_data
        FROM daily_report_photos ph
        WHERE ph.project_id = p_project_id
        ORDER BY ph.created_at DESC
        LIMIT 9
      ) sub
    ),

    'task_progress', (
      SELECT COALESCE(
        jsonb_object_agg(task_id::text, ROUND(avg_pct::numeric, 4)),
        '{}'::jsonb
      )
      FROM (
        SELECT
          pi.task_id,
          AVG(
            LEAST(100.0,
              COALESCE(sums.total_qty, 0.0)
              / NULLIF(pi.target_qty::numeric, 0)
              * 100.0
            )
          ) AS avg_pct
        FROM progress_items pi
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
          FROM progress_daily pd
          JOIN daily_reports dr ON dr.id = pd.report_id
          WHERE pd.item_id = pi.id
            AND dr.report_date <= p_end_date
        ) sums ON TRUE
        WHERE pi.project_id = p_project_id
          AND pi.task_id IS NOT NULL
          AND pi.target_qty > 0
        GROUP BY pi.task_id
      ) tp
    )

  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_project_overview(text, date, date) TO authenticated;

