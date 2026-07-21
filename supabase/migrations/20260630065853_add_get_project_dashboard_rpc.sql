
CREATE OR REPLACE FUNCTION get_project_dashboard(
  p_project_id     TEXT,
  p_effective_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_latest_report_id UUID;
  v_latest_weather   TEXT;
BEGIN
  -- En son raporu bul (effective_date'e kadar)
  SELECT id, weather
  INTO v_latest_report_id, v_latest_weather
  FROM daily_reports
  WHERE project_id = p_project_id
    AND report_date <= p_effective_date
  ORDER BY report_date DESC
  LIMIT 1;

  RETURN jsonb_build_object(

    -- 1. Proje detayları
    'project', (
      SELECT to_jsonb(p) FROM projects p WHERE p.id = p_project_id
    ),

    -- 2. Görevler (planned_start <= effective_date)
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

    -- 3. İmalat kalemleri — tarih filtreli toplam (LATERAL JOIN)
    'progress_items', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'name',           pi.name,
          'unit',           pi.unit,
          'target_qty',     pi.target_qty,
          'total_progress', sub.filtered_total,
          'dashboard_visible', pi.dashboard_visible,
          'dashboard_order',   pi.dashboard_order
        ) ORDER BY pi.dashboard_order
      ), '[]'::jsonb)
      FROM progress_items pi
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(pd.qty_added), 0) AS filtered_total
        FROM progress_daily pd
        JOIN daily_reports dr ON dr.id = pd.report_id
        WHERE pd.item_id = pi.id
          AND dr.report_date <= p_effective_date
      ) sub ON true
      WHERE pi.project_id = p_project_id
        AND pi.dashboard_visible = true
    ),

    -- 4. Kritik yol aktiviteleri
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

    -- 5. Bütçe kalemleri
    'budget_lines', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('name', b.name, 'planned_amount', b.planned_amount)
      ), '[]'::jsonb)
      FROM budget_lines b
      WHERE b.project_id = p_project_id
    ),

    -- 6. Faturalar
    'invoices', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('amount', i.amount, 'status', i.status)
      ), '[]'::jsonb)
      FROM invoices i
      WHERE i.project_id = p_project_id
    ),

    -- 7. Açık riskler
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

    -- 8. Hava durumu (son rapor)
    'weather', v_latest_weather,

    -- 9. Kayıp gün (kötü hava) — effective_date'e kadar
    'lost_days', (
      SELECT COUNT(*)::int
      FROM daily_reports
      WHERE project_id = p_project_id
        AND report_date <= p_effective_date
        AND weather IN ('yağmurlu', 'karlı', 'fırtınalı')
    ),

    -- 10. Mekanik kontrol listesi
    'mech_check', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('id', m.id, 'is_completed', m.is_completed)
      ), '[]'::jsonb)
      FROM mechanical_checklist m
      WHERE m.project_id = p_project_id
    ),

    -- 11. Elektrik kontrol listesi
    'elec_check', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('id', e.id, 'is_completed', e.is_completed)
      ), '[]'::jsonb)
      FROM electrical_checklist e
      WHERE e.project_id = p_project_id
    ),

    -- 12. Kalite denetimleri
    'inspections', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('id', q.id, 'result', q.result)
      ), '[]'::jsonb)
      FROM quality_inspections q
      WHERE q.project_id = p_project_id
    ),

    -- 13. Açık ticket sayısı
    'open_tickets', (
      SELECT COUNT(*)::int
      FROM tickets
      WHERE project_id = p_project_id AND status != 'kapatıldı'
    ),

    -- 14. Bekleyen satın alma sayısı
    'pending_pr', (
      SELECT COUNT(*)::int
      FROM purchase_requests
      WHERE project_id = p_project_id AND status = 'bekliyor'
    ),

    -- 15. Son 8 açık ticket
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

    -- 16. Personel (son rapor)
    'personnel', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('count', p.count, 'shift', p.shift, 'department', p.department)
      ), '[]'::jsonb)
      FROM personnel_log_entries p
      WHERE p.report_id = v_latest_report_id
    ),

    -- 17. Makine (son rapor)
    'machinery', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object('count', m.count, 'status', m.status)
      ), '[]'::jsonb)
      FROM machinery_logs m
      WHERE m.report_id = v_latest_report_id
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_project_dashboard(TEXT, DATE) TO authenticated;

