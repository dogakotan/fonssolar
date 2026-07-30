-- "Plana gore X puan onde/geride" yalnizca bu hesaplanan view kolonundan geliyordu.
-- Kalici veri degildir; kullanici arayuzunden ve API ozetinden tamamen kaldirildi.
DROP VIEW public.vw_project_progress_summary;

CREATE VIEW public.vw_project_progress_summary
WITH (security_invoker = true)
AS
SELECT
  p.id AS project_id,
  p.name AS project_name,
  p.start_date,
  p.target_date,
  p.status,
  p.progress AS actual_progress_pct,
  CASE
    WHEN p.start_date IS NULL OR p.target_date IS NULL THEN 0
    WHEN CURRENT_DATE <= p.start_date THEN 0
    WHEN CURRENT_DATE >= p.target_date THEN 100
    ELSE ROUND(
      (CURRENT_DATE - p.start_date)::numeric
      / NULLIF((p.target_date - p.start_date), 0) * 100
    )
  END AS planned_progress_pct,
  COUNT(pt.id) AS total_tasks,
  COUNT(pt.id) FILTER (WHERE pt.status = 'tamamlandi') AS completed_tasks,
  COUNT(pt.id) FILTER (WHERE pt.status = 'devam_ediyor') AS active_tasks,
  COUNT(pt.id) FILTER (
    WHERE pt.planned_end < CURRENT_DATE
      AND pt.status NOT IN ('tamamlandi', 'iptal')
  ) AS delayed_tasks,
  (p.target_date - CURRENT_DATE) AS days_remaining,
  (CURRENT_DATE - p.start_date) AS days_elapsed
FROM public.projects p
LEFT JOIN public.project_tasks pt ON pt.project_id = p.id
GROUP BY p.id, p.name, p.start_date, p.target_date, p.status, p.progress;

REVOKE ALL ON public.vw_project_progress_summary FROM PUBLIC, anon;
GRANT SELECT ON public.vw_project_progress_summary TO authenticated;
