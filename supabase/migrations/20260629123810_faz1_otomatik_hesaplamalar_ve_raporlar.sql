
-- ================================================================
-- FAZ 1 TAMAMLAMA: Otomatik hesaplamalar ve yönetim raporu altyapısı
-- ================================================================

-- ----------------------------------------------------------------
-- ADIM 1: project_tasks → projects.progress otomatik senkronizasyon
-- Ağırlıklı ortalama: duration_days ağırlığıyla progress_pct ortalaması
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_sync_project_progress()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_project_id text;
  v_progress   integer;
BEGIN
  v_project_id := COALESCE(NEW.project_id, OLD.project_id);

  SELECT ROUND(
    SUM(progress_pct * GREATEST(COALESCE(planned_end - planned_start, 1), 1))::numeric
    / NULLIF(SUM(GREATEST(COALESCE(planned_end - planned_start, 1), 1)), 0)
  )::integer
  INTO v_progress
  FROM project_tasks
  WHERE project_id = v_project_id;

  UPDATE projects
  SET progress = COALESCE(v_progress, 0)
  WHERE id = v_project_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_project_progress ON project_tasks;
CREATE TRIGGER trg_sync_project_progress
AFTER INSERT OR UPDATE OF progress_pct, planned_start, planned_end OR DELETE ON project_tasks
FOR EACH ROW EXECUTE FUNCTION fn_sync_project_progress();

-- ----------------------------------------------------------------
-- ADIM 2: İlk progress_daily girişinde project_tasks.actual_start otomatik set
-- + görev durumunu 'beklemede' → 'devam_ediyor' olarak günceller
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_task_actual_start()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_task_id     uuid;
  v_report_date date;
BEGIN
  IF NEW.qty_added <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT task_id INTO v_task_id
  FROM progress_items
  WHERE id = NEW.item_id AND task_id IS NOT NULL;

  IF v_task_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT report_date INTO v_report_date
  FROM daily_reports
  WHERE id = NEW.report_id;

  UPDATE project_tasks
  SET
    actual_start = v_report_date,
    status = CASE WHEN status = 'beklemede' THEN 'devam_ediyor' ELSE status END
  WHERE id = v_task_id AND actual_start IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_task_actual_start ON progress_daily;
CREATE TRIGGER trg_set_task_actual_start
AFTER INSERT ON progress_daily
FOR EACH ROW EXECUTE FUNCTION fn_set_task_actual_start();

-- ----------------------------------------------------------------
-- ADIM 3: vw_project_progress_summary
-- Proje bazında planlanan vs gerçekleşen ilerleme karşılaştırması
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_project_progress_summary AS
SELECT
  p.id                                                                        AS project_id,
  p.name                                                                      AS project_name,
  p.start_date,
  p.target_date,
  p.status,
  p.progress                                                                  AS actual_progress_pct,
  CASE
    WHEN p.start_date IS NULL OR p.target_date IS NULL THEN 0
    WHEN CURRENT_DATE <= p.start_date                  THEN 0
    WHEN CURRENT_DATE >= p.target_date                 THEN 100
    ELSE ROUND(
      (CURRENT_DATE - p.start_date)::numeric
      / NULLIF((p.target_date - p.start_date), 0) * 100
    )
  END                                                                         AS planned_progress_pct,
  p.progress - CASE
    WHEN p.start_date IS NULL OR p.target_date IS NULL THEN 0
    WHEN CURRENT_DATE <= p.start_date                  THEN 0
    WHEN CURRENT_DATE >= p.target_date                 THEN 100
    ELSE ROUND(
      (CURRENT_DATE - p.start_date)::numeric
      / NULLIF((p.target_date - p.start_date), 0) * 100
    )
  END                                                                         AS progress_variance,
  COUNT(pt.id)                                                                AS total_tasks,
  COUNT(pt.id) FILTER (WHERE pt.status = 'tamamlandi')                       AS completed_tasks,
  COUNT(pt.id) FILTER (WHERE pt.status = 'devam_ediyor')                     AS active_tasks,
  COUNT(pt.id) FILTER (
    WHERE pt.planned_end < CURRENT_DATE
      AND pt.status NOT IN ('tamamlandi', 'iptal')
  )                                                                           AS delayed_tasks,
  (p.target_date - CURRENT_DATE)                                              AS days_remaining,
  (CURRENT_DATE - p.start_date)                                               AS days_elapsed
FROM projects p
LEFT JOIN project_tasks pt ON pt.project_id = p.id
GROUP BY p.id, p.name, p.start_date, p.target_date, p.status, p.progress;

-- ----------------------------------------------------------------
-- ADIM 4: vw_progress_timeline
-- S-eğrisi için günlük kümülatif gerçekleşen vs planlanan ilerleme
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_progress_timeline AS
WITH daily_qty AS (
  SELECT
    dr.project_id,
    dr.report_date,
    COALESCE(SUM(pd.qty_added), 0) AS qty_today
  FROM daily_reports dr
  LEFT JOIN progress_daily pd ON pd.report_id = dr.id
  GROUP BY dr.project_id, dr.report_date
),
cumulative AS (
  SELECT
    project_id,
    report_date,
    SUM(qty_today) OVER (
      PARTITION BY project_id
      ORDER BY report_date
      ROWS UNBOUNDED PRECEDING
    ) AS cumulative_qty
  FROM daily_qty
),
project_targets AS (
  SELECT project_id, SUM(target_qty) AS total_target
  FROM progress_items
  WHERE target_qty > 0
  GROUP BY project_id
),
project_dates AS (
  SELECT id AS project_id, start_date, target_date
  FROM projects
  WHERE start_date IS NOT NULL AND target_date IS NOT NULL
)
SELECT
  c.project_id,
  c.report_date,
  c.cumulative_qty                                                             AS actual_cumulative_qty,
  tgt.total_target,
  CASE
    WHEN COALESCE(tgt.total_target, 0) > 0
    THEN ROUND(c.cumulative_qty / tgt.total_target * 100, 1)
    ELSE 0
  END                                                                          AS actual_cumulative_pct,
  CASE
    WHEN pd.start_date IS NULL OR pd.target_date IS NULL THEN 0
    WHEN c.report_date <= pd.start_date                  THEN 0
    WHEN c.report_date >= pd.target_date                 THEN 100
    ELSE ROUND(
      (c.report_date - pd.start_date)::numeric
      / NULLIF((pd.target_date - pd.start_date), 0) * 100, 1
    )
  END                                                                          AS planned_cumulative_pct
FROM cumulative c
LEFT JOIN project_targets tgt ON tgt.project_id = c.project_id
LEFT JOIN project_dates pd    ON pd.project_id  = c.project_id;

-- ----------------------------------------------------------------
-- ADIM 5a: vw_weekly_progress
-- Haftalık ilerleme özeti
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_weekly_progress AS
SELECT
  dr.project_id,
  DATE_TRUNC('week', dr.report_date::timestamp)                               AS week_start,
  TO_CHAR(DATE_TRUNC('week', dr.report_date::timestamp), 'IYYY-"W"IW')       AS week_label,
  COUNT(DISTINCT dr.id)                                                        AS report_count,
  COUNT(DISTINCT dr.report_date)                                               AS active_days,
  COALESCE(SUM(dr.worker_count), 0)                                            AS total_workers,
  ROUND(AVG(dr.worker_count))                                                  AS avg_daily_workers,
  COALESCE(SUM(pd.qty_added), 0)                                               AS total_qty_added,
  COUNT(DISTINCT pd.item_id)                                                   AS active_progress_items
FROM daily_reports dr
LEFT JOIN progress_daily pd ON pd.report_id = dr.id
GROUP BY dr.project_id, DATE_TRUNC('week', dr.report_date::timestamp);

-- ----------------------------------------------------------------
-- ADIM 5b: vw_monthly_progress
-- Aylık ilerleme özeti
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_monthly_progress AS
SELECT
  dr.project_id,
  DATE_TRUNC('month', dr.report_date::timestamp)                              AS month_start,
  TO_CHAR(dr.report_date, 'YYYY-MM')                                          AS month_label,
  COUNT(DISTINCT dr.id)                                                        AS report_count,
  COUNT(DISTINCT dr.report_date)                                               AS active_days,
  COALESCE(SUM(dr.worker_count), 0)                                            AS total_workers,
  ROUND(AVG(dr.worker_count))                                                  AS avg_daily_workers,
  COALESCE(SUM(pd.qty_added), 0)                                               AS total_qty_added,
  COUNT(DISTINCT pd.item_id)                                                   AS active_progress_items
FROM daily_reports dr
LEFT JOIN progress_daily pd ON pd.report_id = dr.id
GROUP BY dr.project_id, DATE_TRUNC('month', dr.report_date::timestamp), TO_CHAR(dr.report_date, 'YYYY-MM');

-- ----------------------------------------------------------------
-- ADIM 6: vw_delayed_tasks
-- Geciken görevler — planlanan bitiş tarihi geçmiş ama tamamlanmamış
-- ----------------------------------------------------------------
CREATE OR REPLACE VIEW vw_delayed_tasks AS
SELECT
  pt.id,
  pt.project_id,
  p.name                                                                       AS project_name,
  pt.task_code,
  pt.task_name,
  pt.category,
  pt.planned_start,
  pt.planned_end,
  pt.actual_start,
  pt.progress_pct,
  pt.status,
  pt.responsible,
  (CURRENT_DATE - pt.planned_end)                                              AS days_overdue,
  CASE
    WHEN (CURRENT_DATE - pt.planned_end) > 14 THEN 'kritik'
    WHEN (CURRENT_DATE - pt.planned_end) >  7 THEN 'yüksek'
    ELSE 'orta'
  END                                                                          AS delay_severity
FROM project_tasks pt
JOIN projects p ON p.id = pt.project_id
WHERE pt.planned_end < CURRENT_DATE
  AND pt.status NOT IN ('tamamlandi', 'iptal')
  AND pt.progress_pct < 100
ORDER BY days_overdue DESC;

-- ----------------------------------------------------------------
-- İzinler
-- ----------------------------------------------------------------
GRANT SELECT ON vw_project_progress_summary TO authenticated;
GRANT SELECT ON vw_progress_timeline        TO authenticated;
GRANT SELECT ON vw_weekly_progress          TO authenticated;
GRANT SELECT ON vw_monthly_progress         TO authenticated;
GRANT SELECT ON vw_delayed_tasks            TO authenticated;

