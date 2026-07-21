create or replace function public.get_project_gantt(p_project_id text, p_filter_date date default current_date)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
            AND dr.report_date <= p_filter_date
        ) sums ON TRUE
        WHERE pi.project_id = p_project_id
          AND pi.task_id IS NOT NULL
          AND pi.target_qty > 0
        GROUP BY pi.task_id
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

