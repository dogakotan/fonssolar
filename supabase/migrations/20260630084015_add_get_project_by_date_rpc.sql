
CREATE OR REPLACE FUNCTION public.get_project_by_date(
  p_project_id TEXT,
  p_date       DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_report_id UUID;
BEGIN
  -- p_date veya öncesindeki en yakın günlük raporu bul
  SELECT id INTO v_report_id
  FROM daily_reports
  WHERE project_id = p_project_id
    AND report_date <= p_date
  ORDER BY report_date DESC
  LIMIT 1;

  RETURN jsonb_build_object(

    -- Proje bilgisi
    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    -- O güne en yakın rapor (hava durumu dahil)
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

    -- O rapordaki personel
    'personnel', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'shift',      ple.shift,
        'department', ple.department,
        'count',      ple.count
      )), '[]'::jsonb)
      FROM personnel_log_entries ple
      WHERE ple.report_id = v_report_id
    ),

    -- O rapordaki makineler
    'machinery', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'machine_type', ml.machine_type,
        'count',        ml.count,
        'status',       ml.status
      )), '[]'::jsonb)
      FROM machinery_logs ml
      WHERE ml.report_id = v_report_id
    ),

    -- İmalat kalemleri — p_date'e kadar birikimli miktar
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
          AND dr.report_date <= p_date
      ) sums ON TRUE
      WHERE pi.project_id = p_project_id
    ),

    -- Genel ilerleme — p_date'e kadar tüm kalemlerin ağırlıksız ortalaması
    'overall_pct', (
      SELECT ROUND(
        COALESCE(
          AVG(
            LEAST(100.0,
              COALESCE(sums.total_qty, 0.0)
              / NULLIF(pi.target_qty::numeric, 0) * 100.0
            )
          ), 0
        )::numeric, 1
      )
      FROM progress_items pi
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS total_qty
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.item_id = pi.id
          AND dr.report_date <= p_date
      ) sums ON TRUE
      WHERE pi.project_id = p_project_id
        AND pi.target_qty > 0
    ),

    -- İş paketleri (statik, tarihten bağımsız)
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

    -- Açık ticket'lar (p_date'e kadar oluşturulmuş, kapatılmamış)
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
        AND t.status <> 'kapat' || chr(305) || 'ld' || chr(305)
      LIMIT 8
    ),

    -- Satın alma talepleri (p_date'e kadar)
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

    -- Bütçe kalemleri (tarihten bağımsız)
    'budget_lines', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id',             bl.id,
        'category',       bl.category,
        'planned_amount', bl.planned_amount
      )), '[]'::jsonb)
      FROM budget_lines bl
      WHERE bl.project_id = p_project_id
    ),

    -- Faturalar (p_date'e kadar)
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
        AND COALESCE(inv.invoice_date::text, inv.created_at::date::text) <= p_date::text
    ),

    -- Kaybedilen hava kaynaklı günler (p_date'e kadar)
    'weather_lost_days', (
      SELECT COUNT(*)
      FROM daily_reports dr
      WHERE dr.project_id = p_project_id
        AND dr.report_date <= p_date
        AND dr.weather IN (
          'ya' || chr(287) || 'murlu',
          'karl' || chr(305),
          'f' || chr(305) || 'rt' || chr(305) || 'nal' || chr(305)
        )
    )

  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_project_by_date(text, date) TO authenticated;

