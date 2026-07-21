
CREATE OR REPLACE FUNCTION get_project_gantt(
  p_project_id  TEXT,
  p_filter_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN jsonb_build_object(

    -- ── Proje detayları ───────────────────────────────────────────────────────
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

    -- ── İş kalemleri (planned_start sırasıyla) ────────────────────────────────
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
          'responsible_role', pt.responsible_role
        ) ORDER BY pt.planned_start ASC NULLS LAST
      ), '[]'::jsonb)
      FROM project_tasks pt
      WHERE pt.project_id = p_project_id
    ),

    -- ── Kritik yol kodları (string dizisi) ───────────────────────────────────
    'critical_codes', (
      SELECT COALESCE(jsonb_agg(cp.path_code), '[]'::jsonb)
      FROM critical_path_items cp
      WHERE cp.project_id = p_project_id
        AND cp.path_code IS NOT NULL
    ),

    -- ── Görev ilerleme haritası: task_id → % (filter_date'e kadar birikimli) ─
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

    -- ── Detay paneli bağlamı (sağ panel için son rapor/satın alma/risk) ───────
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
          'id',            pr.id,
          'title',         pr.title,
          'request_no',    pr.request_no,
          'status',        pr.status,
          'required_date', pr.required_date,
          'delivery_date', pr.delivery_date,
          'created_at',    pr.created_at
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
$$;

GRANT EXECUTE ON FUNCTION get_project_gantt(TEXT, DATE) TO authenticated;

