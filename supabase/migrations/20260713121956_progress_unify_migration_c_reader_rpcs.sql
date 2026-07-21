-- Migration C: 5 canlı okuyucu RPC'yi progress_items yerine project_tasks'a yönlendir

CREATE OR REPLACE FUNCTION public.get_santiye_dashboard(p_project_id text, p_today date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', task_name, 'unit', unit, 'target_qty', target_qty,
        'total_progress', total_progress, 'category', category, 'task_id', id
      ) ORDER BY planned_start NULLS LAST)
      FROM project_tasks
      WHERE project_id = p_project_id AND target_qty > 0
    ), '[]'::jsonb)
  );
END;
$function$;

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
$function$;

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
          'planned_start',t.planned_start,
          'planned_end',  t.planned_end,
          'progress_pct', t.progress_pct,
          'status',       t.status
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
          'path_code',     c.path_code,
          'activity_name', c.activity_name,
          'planned_start', c.planned_start,
          'planned_end',   c.planned_end,
          'status',        c.status,
          'progress_pct',  c.progress_pct,
          'is_critical',   c.is_critical
        ) ORDER BY c.planned_start
      ), '[]'::jsonb)
      FROM critical_path_items c
      WHERE c.project_id = p_project_id
        AND c.planned_start <= p_effective_date
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

    'mech_check', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('id', m.id, 'is_completed', m.is_completed)
      ), '[]'::jsonb)
      FROM mechanical_checklist m
      WHERE m.project_id = p_project_id
    ),

    'elec_check', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('id', e.id, 'is_completed', e.is_completed)
      ), '[]'::jsonb)
      FROM electrical_checklist e
      WHERE e.project_id = p_project_id
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
          'notes',            pt.notes
        ) ORDER BY pt.planned_start ASC NULLS LAST
      ), '[]'::jsonb)
      FROM project_tasks pt
      WHERE pt.project_id = p_project_id
    ),

    'critical_codes', (
      SELECT COALESCE(jsonb_agg(cp.path_code), '[]'::jsonb)
      FROM critical_path_items cp
      WHERE cp.project_id = p_project_id
        AND cp.path_code IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.get_daily_report_detail(p_report_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT user_can_access_report(p_report_id) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
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
    'project', (
      SELECT jsonb_build_object(
        'id',           pr.id,
        'name',         pr.name,
        'location',     pr.location,
        'capacity_kwp', pr.capacity_kwp
      )
      FROM daily_reports dr
      JOIN projects pr ON pr.id = dr.project_id
      WHERE dr.id = p_report_id
    ),
    'personnel', (
      SELECT COALESCE(jsonb_agg(to_jsonb(pl)), '[]'::jsonb)
      FROM personnel_log_entries pl
      WHERE pl.report_id = p_report_id
    ),
    'machinery', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ml)), '[]'::jsonb)
      FROM machinery_logs ml
      WHERE ml.report_id = p_report_id
    ),
    'tasks', (
      SELECT COALESCE(jsonb_agg(to_jsonb(dt) ORDER BY dt.order_index), '[]'::jsonb)
      FROM daily_tasks dt
      WHERE dt.report_id = p_report_id
    ),
    'progress', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id',         pd.id,
          'report_id',  pd.report_id,
          'item_id',    pd.item_id,
          'task_id',    pd.task_id,
          'qty_added',  pd.qty_added,
          'note',       pd.note,
          'created_at', pd.created_at,
          'progress_items', jsonb_build_object(
            'name',           COALESCE(pi.name, pt.task_name),
            'unit',           COALESCE(pi.unit, pt.unit),
            'target_qty',     COALESCE(pi.target_qty, pt.target_qty),
            'total_progress', COALESCE(pi.total_progress, pt.total_progress)
          )
        )
      ), '[]'::jsonb)
      FROM progress_daily pd
      LEFT JOIN progress_items pi ON pi.id = pd.item_id
      LEFT JOIN project_tasks pt ON pt.id = pd.task_id
      WHERE pd.report_id = p_report_id
    ),
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
    'photos', (
      SELECT COALESCE(jsonb_agg(to_jsonb(ph)), '[]'::jsonb)
      FROM daily_report_photos ph
      WHERE ph.report_id = p_report_id
    ),
    'issues', (
      SELECT COALESCE(jsonb_agg(to_jsonb(iss)), '[]'::jsonb)
      FROM daily_report_issues iss
      WHERE iss.report_id = p_report_id
    )
  );
END;
$function$;

